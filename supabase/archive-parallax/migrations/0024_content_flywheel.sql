-- 0024_content_flywheel.sql
-- IMPROVEMENT_PLAN.md 1.3 + 1.4 + 5.3 server side:
--
--   1.3  Intents actually tune content: rotation prefers unplayed catalog
--        drops whose theme matches either member's onboarding intents
--        (soft weighting — never a hard filter, spice stays the only gate).
--   1.4  The flywheel closes: publishing a generated candidate that grew out
--        of Love Map learnings stamps learnings.became_prompt_id, making
--        "now a question in your drops" TRUE in the UI.
--   5.3  send_pack: a partner "sends a pack" by steering the couple's NEXT
--        drop to that theme (real, not a toast). repair_streak: the paid
--        repair restores a chain the reset killed within the last 7 days,
--        once per 30 days.
--
-- Rotation logic previously lived duplicated in ensure_today_drop (0015) and
-- ensure_yesterday_drop (0021); both now delegate to one internal
-- _next_drop_for so the pack override + intent weighting apply everywhere.

alter table public.couples
  add column if not exists pack_override text,
  add column if not exists last_repair_on date;

alter table public.drop_candidates
  add column if not exists source_learning_ids uuid[];

-- ----------------------------------------------------------------------------
-- _next_drop_for: the single rotation brain. Priority:
--   1. the couple's pack_override theme (consumed on use),
--   2. unplayed catalog drops, intent-matched themes first, catalog order,
--   3. LRU cycle when the catalog is exhausted.
-- Spice-gated throughout. Internal (DEFINER-only callers pass a verified couple).
-- ----------------------------------------------------------------------------
create or replace function public._next_drop_for(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_override text;
  v_allowed int;
  v_drop_id uuid;
begin
  select c.member_a, c.member_b, c.pack_override
    into v_member_a, v_member_b, v_override
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  v_allowed := coalesce((
    select min(case lower(p.spice_level) when 'sweet' then 0 when 'spicy' then 2 else 1 end)
    from public.profiles p
    where p.id in (v_member_a, v_member_b)
  ), 1);

  -- 5.3: a sent pack steers the next drop, once.
  if v_override is not null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.theme = v_override
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

    update public.couples set pack_override = null where id = p_couple;

    if v_drop_id is not null then
      return v_drop_id;
    end if;
  end if;

  -- 1.3: unplayed drops, themes matching either member's intents first.
  with intent_themes as (
    select distinct m.theme
    from public.profiles p
    cross join lateral unnest(coalesce(p.intents, '{}')) as i(intent)
    join (values
      ('know', 'deeper'), ('know', 'memory'),
      ('talk', 'spark'),  ('talk', 'daily'),
      ('rough', 'deeper'),
      ('far', 'memory'),  ('far', 'daily'),
      ('fun', 'fun'),     ('fun', 'spark'), ('fun', 'spicy')
    ) as m(intent, theme) on m.intent = i.intent
    where p.id in (v_member_a, v_member_b)
  )
  select d.id into v_drop_id
  from public.drops d
  where d.position is not null
    and d.spice <= v_allowed
    and not exists (
      select 1 from public.couple_drops cd
      where cd.couple_id = p_couple and cd.drop_id = d.id
    )
  order by (d.theme in (select theme from intent_themes)) desc,
           d.position
  limit 1;

  -- Catalog exhausted: cycle from the least-recently-used eligible drop.
  if v_drop_id is null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.spice <= v_allowed
    order by (select max(cd.date)
              from public.couple_drops cd
              where cd.couple_id = p_couple and cd.drop_id = d.id) asc,
             d.position asc
    limit 1;
  end if;

  if v_drop_id is null then
    raise exception 'no eligible drop in catalog';
  end if;

  return v_drop_id;
end;
$$;

revoke all on function public._next_drop_for(uuid) from public;

-- ----------------------------------------------------------------------------
-- ensure_today_drop / ensure_yesterday_drop: guards + idempotency unchanged
-- (0015 / 0021 semantics); rotation delegated.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_today_drop(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_drop_id uuid;
  v_drop_id uuid;
  v_today date;
begin
  select (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date into v_today
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_today is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select id into v_couple_drop_id
  from public.couple_drops
  where couple_id = p_couple
    and date = v_today;

  if v_couple_drop_id is null then
    v_drop_id := public._next_drop_for(p_couple);
    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, v_today, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;

create or replace function public.ensure_yesterday_drop(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_drop_id uuid;
  v_state text;
  v_drop_id uuid;
  v_yesterday date;
  v_status text;
begin
  select (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date - 1, c.status
    into v_yesterday, v_status
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_yesterday is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_status = 'pending' then
    raise exception 'catch-up opens once you are paired';
  end if;

  select cd.id, cd.state into v_couple_drop_id, v_state
  from public.couple_drops cd
  where cd.couple_id = p_couple
    and cd.date = v_yesterday;

  if v_state = 'revealed' then
    raise exception 'yesterday is already revealed';
  end if;

  if v_couple_drop_id is null then
    v_drop_id := public._next_drop_for(p_couple);
    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, v_yesterday, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;

grant execute on function public.ensure_today_drop(uuid) to authenticated;
grant execute on function public.ensure_yesterday_drop(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- publish_drop_candidate: 0019 behavior + the 1.4 flywheel — learnings that
-- seeded the candidate get became_prompt_id stamped with the published drop's
-- first prompt.
-- ----------------------------------------------------------------------------
create or replace function public.publish_drop_candidate(p_candidate uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cand public.drop_candidates%rowtype;
  v_drop_id uuid;
  v_position int;
  v_first_prompt uuid;
begin
  select * into v_cand
  from public.drop_candidates
  where id = p_candidate
  for update;

  if v_cand.id is null then
    raise exception 'candidate not found';
  end if;

  if v_cand.published_drop_id is not null then
    return v_cand.published_drop_id;
  end if;

  select coalesce(max(d.position), 0) + 1 into v_position
  from public.drops d
  where d.position is not null;

  insert into public.drops (code, title, theme, position, spice)
  values (
    'GEN ' || upper(substr(replace(p_candidate::text, '-', ''), 1, 6)),
    v_cand.title,
    v_cand.theme,
    v_position,
    greatest(0, least(2, v_cand.spice))
  )
  returning id into v_drop_id;

  insert into public.drop_prompts (drop_id, position, emoji, question, options)
  select
    v_drop_id,
    (el.ord - 1)::int,
    el.val->>'emoji',
    el.val->>'question',
    (select array_agg(o.v #>> '{}' order by o.ord)
     from jsonb_array_elements(el.val->'options') with ordinality as o(v, ord))
  from jsonb_array_elements(v_cand.prompts) with ordinality as el(val, ord);

  select dp.id into v_first_prompt
  from public.drop_prompts dp
  where dp.drop_id = v_drop_id
  order by dp.position
  limit 1;

  -- 1.4: "your learning became a question" is now literally true.
  if v_cand.source_learning_ids is not null and v_first_prompt is not null then
    update public.learnings
    set became_prompt_id = v_first_prompt
    where id = any(v_cand.source_learning_ids)
      and became_prompt_id is null;
  end if;

  update public.drop_candidates
  set status = 'approved',
      published_drop_id = v_drop_id,
      reviewed_at = now()
  where id = p_candidate;

  return v_drop_id;
end;
$$;

revoke execute on function public.publish_drop_candidate(uuid) from public, anon, authenticated;
grant execute on function public.publish_drop_candidate(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- send_pack: the pack send is real — it steers the couple's next drop.
-- ----------------------------------------------------------------------------
create or replace function public.send_pack(p_couple uuid, p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if not exists (
    select 1 from public.drops d
    where d.position is not null and d.theme = p_theme
  ) then
    raise exception 'unknown pack theme %', p_theme;
  end if;

  update public.couples set pack_override = p_theme where id = p_couple;
  perform public.log_activity(p_couple, 'pack', json_build_object('theme', p_theme)::jsonb);
end;
$$;

revoke all on function public.send_pack(uuid, text) from public;
grant execute on function public.send_pack(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- repair_streak: restores a chain killed within the last 7 days. Once per
-- 30 days per couple. The purchase/entitlement gate lives client-side until
-- a RevenueCat webhook exists — the server still enforces the windows.
-- ----------------------------------------------------------------------------
create or replace function public.repair_streak(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_last date;
  v_lapsed int;
  v_lapsed_on date;
  v_last_repair date;
  v_new int;
begin
  select (now() at time zone coalesce(tz, 'Asia/Singapore'))::date,
         last_played_on, lapsed_streak, lapsed_on, last_repair_on
    into v_today, v_last, v_lapsed, v_lapsed_on, v_last_repair
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_today is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if coalesce(v_lapsed, 0) <= 0 or v_lapsed_on is null or v_lapsed_on < v_today - 7 then
    raise exception 'nothing repairable — no streak lapsed in the last 7 days';
  end if;

  if v_last_repair is not null and v_last_repair > v_today - 30 then
    raise exception 'streak repair is available once every 30 days';
  end if;

  -- Restore the chain as if the gap never happened; a same-day play already
  -- counted (streak reset to 1) folds in.
  v_new := v_lapsed + (case when v_last = v_today then 1 else 0 end);

  update public.couples
  set streak = v_new,
      longest_streak = greatest(coalesce(longest_streak, 0), v_new),
      last_played_on = greatest(coalesce(v_last, v_today - 1), v_today - 1),
      lapsed_streak = null,
      lapsed_on = null,
      last_repair_on = v_today
  where id = p_couple;

  perform public.log_activity(p_couple, 'milestone', json_build_object('days', v_new, 'repaired', true)::jsonb);
end;
$$;

revoke all on function public.repair_streak(uuid) from public;
grant execute on function public.repair_streak(uuid) to authenticated;
