-- 0022_streak_grace.sql
-- IMPROVEMENT_PLAN.md 3.4: streak mechanics for real — grace, not guilt.
--
--   1. Catch-up: yesterday's missed drop stays answerable for 24h (the whole
--      of today, couple-local) at a reduced score (wave_pct * 0.8, flagged
--      `caught_up` so the reveal labels it honestly). Completing it repairs
--      the streak chain — one bad day ≠ death.
--   2. Freezes are EARNED, not static: every full week of streak tops one
--      freeze back up (cap 2, Duolingo's number). A freeze auto-spent by the
--      nightly reset is refunded if the couple then catches up for real.
--   3. Hardening (regression): submit_answers now rejects writes to an
--      already-revealed drop (answers were mutable post-reveal before) and to
--      drops older than yesterday (the catch-up window is the only late door).
--
-- reset_stale_streaks records what it kills (lapsed_streak/lapsed_on) so a
-- same-day catch-up can restore the chain after the midnight reset already ran.
--
-- Grants per the 0006 lesson: new columns ride existing table grants; the new
-- RPC gets an explicit grant; internals are revoked from public.

alter table public.couples
  add column if not exists lapsed_streak int,
  add column if not exists lapsed_on date;

alter table public.couple_drops
  add column if not exists caught_up boolean not null default false;

-- ----------------------------------------------------------------------------
-- _earn_freeze_if_weekly: every 7th consecutive day earns a freeze back, cap 2.
-- Internal.
-- ----------------------------------------------------------------------------
create or replace function public._earn_freeze_if_weekly(p_couple uuid, p_streak int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_streak > 0 and p_streak % 7 = 0 then
    update public.couples
    set freezes_remaining = least(coalesce(freezes_remaining, 0) + 1, 2)
    where id = p_couple;
  end if;
end;
$$;

revoke all on function public._earn_freeze_if_weekly(uuid, int) from public;

-- ----------------------------------------------------------------------------
-- _increment_streak: 0017 behavior preserved exactly (couple-local day,
-- idempotent, gap-aware, 'played' + 'milestone' activity) PLUS weekly freeze
-- earn-back and clearing any lapse record (a live chain supersedes it).
-- ----------------------------------------------------------------------------
create or replace function public._increment_streak(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_last date;
  v_streak int;
begin
  select (now() at time zone coalesce(tz, 'Asia/Singapore'))::date, last_played_on, coalesce(streak, 0)
    into v_today, v_last, v_streak
  from public.couples where id = p_couple;

  if v_today is null then
    raise exception 'couple not found';
  end if;

  -- Already counted today — idempotent.
  if v_last = v_today then
    return;
  end if;

  if v_last = v_today - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  update public.couples
  set streak = v_streak,
      longest_streak = greatest(coalesce(longest_streak, 0), v_streak),
      last_played_on = v_today,
      lapsed_streak = null,
      lapsed_on = null
  where id = p_couple;

  perform public._earn_freeze_if_weekly(p_couple, v_streak);
  perform public.log_activity(p_couple, 'played', '{}');

  if v_streak in (3, 7, 14, 30, 50, 100) then
    perform public.log_activity(p_couple, 'milestone', json_build_object('days', v_streak)::jsonb);
  end if;
end;
$$;

revoke all on function public._increment_streak(uuid) from public;

-- ----------------------------------------------------------------------------
-- _repair_streak: called when a catch-up completes yesterday's drop. Treats
-- yesterday as a played day and reconciles every ordering the reset/freeze/
-- today's-play machinery can produce. Internal.
-- ----------------------------------------------------------------------------
create or replace function public._repair_streak(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_yesterday date;
  v_last date;
  v_streak int;
  v_lapsed int;
  v_lapsed_on date;
  v_new int;
begin
  select (now() at time zone coalesce(tz, 'Asia/Singapore'))::date, last_played_on,
         coalesce(streak, 0), lapsed_streak, lapsed_on
    into v_today, v_last, v_streak, v_lapsed, v_lapsed_on
  from public.couples where id = p_couple;

  if v_today is null then
    raise exception 'couple not found';
  end if;
  v_yesterday := v_today - 1;

  if v_lapsed_on = v_today and coalesce(v_lapsed, 0) > 0 then
    -- Midnight reset already zeroed the chain today; restore it, bridged by
    -- yesterday's catch-up (+1 more if today was already played on streak=1).
    v_new := v_lapsed + 1 + (case when v_last = v_today then 1 else 0 end);
  elsif v_last = v_yesterday then
    -- A freeze bridged yesterday overnight — the couple then earned it back
    -- by actually playing. Refund the freeze; the chain is already correct.
    update public.couples
    set freezes_remaining = least(coalesce(freezes_remaining, 0) + 1, 2)
    where id = p_couple;
    v_new := v_streak;
  elsif v_last = v_today or v_last = v_yesterday - 1 then
    -- Yesterday fills the hole behind today's play, or extends a chain the
    -- reset hasn't judged yet (pre-midnight catch-up).
    v_new := v_streak + 1;
  else
    v_new := 1;
  end if;

  update public.couples
  set streak = v_new,
      longest_streak = greatest(coalesce(longest_streak, 0), v_new),
      last_played_on = greatest(coalesce(v_last, v_yesterday), v_yesterday),
      lapsed_streak = null,
      lapsed_on = null
  where id = p_couple;

  perform public._earn_freeze_if_weekly(p_couple, v_new);
  perform public.log_activity(p_couple, 'played', '{}');

  if v_new in (3, 7, 14, 30, 50, 100) then
    perform public.log_activity(p_couple, 'milestone', json_build_object('days', v_new)::jsonb);
  end if;
end;
$$;

revoke all on function public._repair_streak(uuid) from public;

-- ----------------------------------------------------------------------------
-- reset_stale_streaks: 0014 behavior + it now RECORDS the streak it kills so
-- a same-day catch-up can restore it. Freeze forgiveness unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.reset_stale_streaks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reset_count int;
begin
  update public.couples
  set freezes_remaining = freezes_remaining - 1,
      last_played_on = (now() at time zone coalesce(tz, 'Asia/Singapore'))::date - 1
  where streak > 0
    and last_played_on = (now() at time zone coalesce(tz, 'Asia/Singapore'))::date - 2
    and freezes_remaining > 0;

  with reset as (
    update public.couples
    set lapsed_streak = streak,
        lapsed_on = (now() at time zone coalesce(tz, 'Asia/Singapore'))::date,
        streak = 0
    where streak > 0
      and last_played_on < (now() at time zone coalesce(tz, 'Asia/Singapore'))::date - 1
    returning 1
  )
  select count(*)::int into v_reset_count from reset;

  return v_reset_count;
end;
$$;

revoke all on function public.reset_stale_streaks() from public;
grant execute on function public.reset_stale_streaks() to service_role;

-- ----------------------------------------------------------------------------
-- ensure_yesterday_drop: the catch-up door. Returns yesterday's couple_drop
-- (creating it with the same rotation/spice rules if the couple never opened
-- the app yesterday), only while it is still completable. Same membership
-- guard as ensure_today_drop.
-- ----------------------------------------------------------------------------
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
  v_member_a uuid;
  v_member_b uuid;
  v_status text;
  v_allowed int;
begin
  select (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date - 1,
         c.member_a, c.member_b, c.status
    into v_yesterday, v_member_a, v_member_b, v_status
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
    v_allowed := coalesce((
      select min(case lower(p.spice_level) when 'sweet' then 0 when 'spicy' then 2 else 1 end)
      from public.profiles p
      where p.id in (v_member_a, v_member_b)
    ), 1);

    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

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

    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, v_yesterday, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;

grant execute on function public.ensure_yesterday_drop(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- submit_answers: 0014 contract preserved, plus
--   * rejects a drop already revealed (answers were silently mutable before),
--   * rejects drops older than yesterday (window closed),
--   * a yesterday-dated completion is a catch-up: wave_pct scored at 80%,
--     caught_up flagged, streak repaired instead of incremented.
-- ----------------------------------------------------------------------------
create or replace function public.submit_answers(
  p_couple_drop uuid,
  p_answers jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_drop_id uuid;
  v_drop_date date;
  v_cd_state text;
  v_today date;
  v_member_a uuid;
  v_member_b uuid;
  v_status text;
  v_prompt_id uuid;
  v_pick int;
  v_hunch int;
  v_answer jsonb;
  v_new_state text;
  v_member_a_done boolean;
  v_member_b_done boolean;
  v_prompt_count int;
  v_opt_count int;
  v_wave int;
  v_catch_up boolean;
begin
  select cd.couple_id, cd.drop_id, cd.date, cd.state
    into v_couple_id, v_drop_id, v_drop_date, v_cd_state
  from public.couple_drops cd
  where cd.id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  if v_cd_state = 'revealed' then
    raise exception 'this drop is already revealed';
  end if;

  select c.member_a, c.member_b, c.status,
         (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date
    into v_member_a, v_member_b, v_status, v_today
  from public.couples c where c.id = v_couple_id;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_drop_date < v_today - 1 then
    raise exception 'the catch-up window for this drop has closed';
  end if;

  v_catch_up := v_drop_date = v_today - 1;

  select count(*)::int into v_prompt_count
  from public.drop_prompts dp
  where dp.drop_id = v_drop_id;

  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    v_prompt_id := (v_answer->>'prompt_id')::uuid;
    v_pick := (v_answer->>'pick')::int;
    v_hunch := (v_answer->>'hunch')::int;

    select coalesce(array_length(options, 1), 0) into v_opt_count
    from public.drop_prompts
    where id = v_prompt_id and drop_id = v_drop_id;

    if v_opt_count is null then
      raise exception 'prompt % does not belong to this drop', v_prompt_id;
    end if;

    if v_pick is not null and (v_pick < 0 or v_pick >= v_opt_count) then
      raise exception 'pick % out of range for prompt %', v_pick, v_prompt_id;
    end if;
    if v_hunch is not null and (v_hunch < 0 or v_hunch >= v_opt_count) then
      raise exception 'hunch % out of range for prompt %', v_hunch, v_prompt_id;
    end if;

    insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
    values (p_couple_drop, v_prompt_id, auth.uid(), v_pick, v_hunch)
    on conflict (couple_drop_id, prompt_id, author) do update
    set pick = excluded.pick, hunch = excluded.hunch, created_at = now();
  end loop;

  v_member_a_done := (v_member_a is null and v_status <> 'pending') or (
    select count(*) = v_prompt_count
    from public.answers a
    where a.couple_drop_id = p_couple_drop and a.author = v_member_a
  );
  v_member_b_done := (v_member_b is null and v_status <> 'pending') or (
    select count(*) = v_prompt_count
    from public.answers a
    where a.couple_drop_id = p_couple_drop and a.author = v_member_b
  );

  if v_member_a_done and v_member_b_done then
    v_new_state := 'revealed';
  elsif v_member_a_done or v_member_b_done then
    v_new_state := 'one_done';
  else
    v_new_state := 'open';
  end if;

  if v_new_state = 'revealed' and v_member_a is not null and v_member_b is not null then
    v_wave := public._wave_pct(p_couple_drop);
    if v_catch_up then
      v_wave := round(v_wave * 0.8);
      update public.couple_drops
      set state = 'revealed', wave_pct = v_wave, caught_up = true
      where id = p_couple_drop;
      perform public._repair_streak(v_couple_id);
    else
      update public.couple_drops
      set state = 'revealed', wave_pct = v_wave
      where id = p_couple_drop;
      perform public._increment_streak(v_couple_id);
    end if;
  else
    update public.couple_drops
    set state = v_new_state
    where id = p_couple_drop;
  end if;

  return json_build_object(
    'success', true,
    'couple_drop_id', p_couple_drop,
    'new_state', v_new_state,
    'wave_pct', v_wave,
    'caught_up', v_catch_up and v_new_state = 'revealed'
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- get_today_state: 0014 shape + the catch-up signal so Today can offer the
-- door honestly (no client guessing).
-- ----------------------------------------------------------------------------
create or replace function public.get_today_state(p_couple uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_status text;
  v_today date;
  v_last date;
  v_cd_id uuid;
  v_state text;
  v_wave int;
  v_drop_id uuid;
  v_prompt_count int;
  v_me_done boolean := false;
  v_partner_done boolean := false;
  v_partner uuid;
  v_y_state text;
  v_catch_up boolean := false;
begin
  select c.member_a, c.member_b, c.status,
         (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date,
         c.last_played_on
    into v_member_a, v_member_b, v_status, v_today, v_last
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select cd.state into v_y_state
  from public.couple_drops cd
  where cd.couple_id = p_couple and cd.date = v_today - 1;

  -- Catch-up: yesterday exists unfinished, or was never opened by a couple
  -- that has a history. Held entirely while pending (no reveal to chase).
  v_catch_up := v_status <> 'pending' and (
    (v_y_state is not null and v_y_state <> 'revealed')
    or (v_y_state is null and v_last is not null and v_last < v_today - 1)
  );

  select cd.id, cd.state, cd.wave_pct, cd.drop_id
    into v_cd_id, v_state, v_wave, v_drop_id
  from public.couple_drops cd
  where cd.couple_id = p_couple and cd.date = v_today;

  if v_cd_id is null then
    return json_build_object(
      'exists', false,
      'date', v_today,
      'catch_up_available', v_catch_up,
      'yesterday_state', v_y_state
    );
  end if;

  select count(*)::int into v_prompt_count
  from public.drop_prompts where drop_id = v_drop_id;

  v_partner := case when auth.uid() = v_member_a then v_member_b else v_member_a end;

  select v_prompt_count > 0 and count(*) = v_prompt_count into v_me_done
  from public.answers where couple_drop_id = v_cd_id and author = auth.uid();

  if v_partner is not null then
    select v_prompt_count > 0 and count(*) = v_prompt_count into v_partner_done
    from public.answers where couple_drop_id = v_cd_id and author = v_partner;
  end if;

  return json_build_object(
    'exists', true,
    'date', v_today,
    'couple_drop_id', v_cd_id,
    'state', v_state,
    'wave_pct', v_wave,
    'i_answered', v_me_done,
    'partner_answered', v_partner_done,
    'held', (v_status = 'pending'),
    'catch_up_available', v_catch_up,
    'yesterday_state', v_y_state
  );
end;
$$;

grant execute on function public.get_today_state(uuid) to authenticated;
