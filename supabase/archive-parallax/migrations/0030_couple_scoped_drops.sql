-- 0030_couple_scoped_drops.sql
-- Flywheel v2 (docs/GENERATIVE_ENGINE.md "v2 — couple-scoped serving"):
-- a drop generated FROM a couple's own graph comes back to THAT couple's
-- rotation as a personal moat, instead of only landing in the global catalog.
--
--   1. drops.couple_id: null = global catalog (unchanged); non-null = a drop
--      scoped to exactly one couple. FK cascades with the couple.
--   2. publish_drop_candidate: a couple-scoped candidate stamps its couple_id
--      onto the published drop; global candidates stay null. All other 0026
--      behavior (GEN code, position = max+1, 3 prompts, became_prompt_id
--      flywheel, idempotency) preserved byte-for-byte.
--   3. _next_drop_for: the couple's OWN unplayed scoped drops win over
--      intent-weighted global picks. Priority: pack_override > own-couple >
--      intent-weighted > LRU. A couple's scoped drops NEVER serve to another
--      couple — every selection branch is fenced with
--      (couple_id is null or couple_id = p_couple).
--   4. RLS: scoped drops (+ their prompts) are readable only by couple members;
--      global rows stay readable to any authenticated user. Prevents another
--      couple from READING (not just being served) a personalized drop.
--   5. send_pack availability checks exclude other couples' scoped drops so a
--      foreign scoped drop can neither unlock a theme nor count as "available".
--
-- Idempotent: if-not-exists / create-or-replace / drop-policy-if-exists.

-- ----------------------------------------------------------------------------
-- 1. The scoping column.
-- ----------------------------------------------------------------------------
alter table public.drops
  add column if not exists couple_id uuid references public.couples(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- 2. publish_drop_candidate: 0026 behavior + stamp the candidate's couple_id
--    onto the published drop (null candidate -> global drop, unchanged).
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

  insert into public.drops (code, title, theme, position, spice, couple_id)
  values (
    'GEN ' || upper(substr(replace(p_candidate::text, '-', ''), 1, 6)),
    v_cand.title,
    v_cand.theme,
    v_position,
    greatest(0, least(2, v_cand.spice)),
    v_cand.couple_id
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
-- 3. _next_drop_for: own-couple scoped drops win over global intent picks.
--    Priority: pack_override > own-couple > intent-weighted > LRU. Every branch
--    is fenced with (couple_id is null or couple_id = p_couple) so a couple's
--    scoped drops are never served to another couple. Signature unchanged from
--    0026 (uuid, boolean), so ensure_today/yesterday_drop callers are untouched.
-- ----------------------------------------------------------------------------
create or replace function public._next_drop_for(p_couple uuid, p_use_override boolean default true)
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

  -- 5.3: a sent pack steers the next drop, once — consumed only on a hit.
  if p_use_override and v_override is not null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.theme = v_override
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

    if v_drop_id is not null then
      update public.couples set pack_override = null where id = p_couple;
      return v_drop_id;
    end if;
  end if;

  -- v2: the couple's OWN scoped unplayed drops (its personal moat) win over
  -- any global pick. Spice-gated, catalog order.
  select d.id into v_drop_id
  from public.drops d
  where d.position is not null
    and d.couple_id = p_couple
    and d.spice <= v_allowed
    and not exists (
      select 1 from public.couple_drops cd
      where cd.couple_id = p_couple and cd.drop_id = d.id
    )
  order by d.position
  limit 1;

  if v_drop_id is not null then
    return v_drop_id;
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
    and (d.couple_id is null or d.couple_id = p_couple)
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
      and (d.couple_id is null or d.couple_id = p_couple)
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

revoke all on function public._next_drop_for(uuid, boolean) from public;

-- ----------------------------------------------------------------------------
-- 4. RLS: scoped drops (+ their prompts) are member-only; global rows stay
--    readable to any authenticated user. Anon holds no drops policy (unchanged
--    — the demo reads sample data, never the catalog).
-- ----------------------------------------------------------------------------
drop policy if exists "drops_select_authenticated" on public.drops;
create policy "drops_select_authenticated"
  on public.drops
  for select
  to authenticated
  using (
    couple_id is null
    or exists (
      select 1 from public.couples c
      where c.id = drops.couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

drop policy if exists "drop_prompts_select_authenticated" on public.drop_prompts;
create policy "drop_prompts_select_authenticated"
  on public.drop_prompts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.drops d
      where d.id = drop_prompts.drop_id
        and (
          d.couple_id is null
          or exists (
            select 1 from public.couples c
            where c.id = d.couple_id
              and (c.member_a = auth.uid() or c.member_b = auth.uid())
          )
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. send_pack: availability checks ignore other couples' scoped drops — a
--    foreign scoped drop can neither make a theme "known" nor count as
--    available for this couple. 0026 guards + logging otherwise unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.send_pack(p_couple uuid, p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_allowed int;
begin
  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_member_a is null and v_member_b is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if not exists (
    select 1 from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.theme = p_theme
  ) then
    raise exception 'unknown pack theme %', p_theme;
  end if;

  v_allowed := coalesce((
    select min(case lower(p.spice_level) when 'sweet' then 0 when 'spicy' then 2 else 1 end)
    from public.profiles p
    where p.id in (v_member_a, v_member_b)
  ), 1);

  if not exists (
    select 1 from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.theme = p_theme
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
  ) then
    raise exception 'that pack has nothing new for you two right now';
  end if;

  update public.couples set pack_override = p_theme where id = p_couple;
  perform public.log_activity(p_couple, 'pack', json_build_object('theme', p_theme)::jsonb);
end;
$$;

revoke all on function public.send_pack(uuid, text) from public;
grant execute on function public.send_pack(uuid, text) to authenticated;
