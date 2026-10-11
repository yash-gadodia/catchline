-- 0014_true_loop.sql
-- Phase 0 "Make it TRUE" (docs/IMPROVEMENT_PLAN.md §3): the production loop was
-- broken because the client drove the reveal + streak through the demo helper
-- (sim_partner_submit), which prod revokes. This migration makes the server the
-- single source of truth:
--   * submit_answers computes + stores wave_pct and increments the couple
--     streak when the second partner's submit flips state to 'revealed'.
--   * get_today_state(p_couple) lets the client rehydrate today honestly
--     (RLS correctly hides partner answers pre-reveal, so "partner already
--     played" can only be truthful via a DEFINER read).
--   * "today" is couple-local (couples.tz, default Asia/Singapore), not UTC.
--   * The prod revocation of sim_partner_submit is committed here (parity —
--     it previously lived only in the prod dashboard). supabase/seed.sql
--     re-grants it for LOCAL dev only.
--   * The daily reset_stale_streaks pg_cron job is committed here too.

-- ----------------------------------------------------------------------------
-- Schema: couple timezone + stored wavelength
-- ----------------------------------------------------------------------------
alter table public.couples
  add column if not exists tz text not null default 'Asia/Singapore';

alter table public.couple_drops
  add column if not exists wave_pct int;

-- ----------------------------------------------------------------------------
-- _wave_pct: server-side wavelength for a revealed couple_drop.
-- Mirrors src/domain/reveal.ts scoreReveal: per prompt, my hunch matching your
-- pick counts once in each direction; pct = hits / (prompts * 2).
-- ----------------------------------------------------------------------------
create or replace function public._wave_pct(p_couple_drop uuid)
returns int
language sql
stable
as $$
  with pair as (
    select a.prompt_id,
           max(case when a.author = c.member_a then a.pick end)  as a_pick,
           max(case when a.author = c.member_a then a.hunch end) as a_hunch,
           max(case when a.author = c.member_b then a.pick end)  as b_pick,
           max(case when a.author = c.member_b then a.hunch end) as b_hunch
    from public.answers a
    join public.couple_drops cd on cd.id = a.couple_drop_id
    join public.couples c on c.id = cd.couple_id
    where a.couple_drop_id = p_couple_drop
    group by a.prompt_id
  )
  select coalesce(round(100.0 * (
        count(*) filter (where a_hunch is not null and b_pick is not null and a_hunch = b_pick)
      + count(*) filter (where b_hunch is not null and a_pick is not null and b_hunch = a_pick)
    ) / nullif(count(*) * 2, 0))::int, 0)
  from pair;
$$;

revoke all on function public._wave_pct(uuid) from public;

-- ----------------------------------------------------------------------------
-- _increment_streak: internal, couple-scoped, idempotent per couple-local day.
-- No membership guard — only callable from DEFINER functions in this file.
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
      last_played_on = v_today
  where id = p_couple;

  perform public.log_activity(p_couple, 'played', '{}');
end;
$$;

revoke all on function public._increment_streak(uuid) from public;

-- ----------------------------------------------------------------------------
-- ensure_today_drop: couple-local "today" (was server current_date, which
-- flipped days at 8am SGT).
-- ----------------------------------------------------------------------------
create or replace function public.ensure_today_drop(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_drop_id uuid;
  v_drop_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
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
    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, v_today, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- submit_answers: same contract as 0011 plus, on the flip to 'revealed' with
-- two real members, the server stores wave_pct and increments the streak.
-- The client no longer drives either.
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
begin
  select cd.couple_id, cd.drop_id into v_couple_id, v_drop_id
  from public.couple_drops cd
  where cd.id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  select c.member_a, c.member_b, c.status into v_member_a, v_member_b, v_status
  from public.couples c where c.id = v_couple_id;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

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

  -- A NULL member slot counts as done only when the couple is NOT pending
  -- (0011 semantics: dissolved releases the survivor; pending holds the reveal).
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
    update public.couple_drops
    set state = 'revealed', wave_pct = v_wave
    where id = p_couple_drop;
    perform public._increment_streak(v_couple_id);
  else
    update public.couple_drops
    set state = v_new_state
    where id = p_couple_drop;
  end if;

  return json_build_object(
    'success', true,
    'couple_drop_id', p_couple_drop,
    'new_state', v_new_state,
    'wave_pct', v_wave
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- complete_streak: kept for compatibility; now a guarded wrapper around the
-- internal increment (same idempotency), couple-local dates.
-- ----------------------------------------------------------------------------
create or replace function public.complete_streak(p_couple_drop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  select couple_id into v_couple_id
  from public.couple_drops
  where id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  if not exists (
    select 1 from public.couples c
    where c.id = v_couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  perform public._increment_streak(v_couple_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- reset_stale_streaks: couple-local dates (was UTC current_date).
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
  -- Forgiveness: a couple that missed exactly one day keeps the streak by
  -- spending a freeze, and is treated as if they played yesterday.
  update public.couples
  set freezes_remaining = freezes_remaining - 1,
      last_played_on = (now() at time zone coalesce(tz, 'Asia/Singapore'))::date - 1
  where streak > 0
    and last_played_on = (now() at time zone coalesce(tz, 'Asia/Singapore'))::date - 2
    and freezes_remaining > 0;

  with reset as (
    update public.couples
    set streak = 0
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
-- get_today_state: honest client rehydration in one round-trip.
-- Returns whether I answered, whether my partner answered (truthful — RLS
-- hides their rows from the client pre-reveal), state, and wave_pct.
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
  v_cd_id uuid;
  v_state text;
  v_wave int;
  v_drop_id uuid;
  v_prompt_count int;
  v_me_done boolean := false;
  v_partner_done boolean := false;
  v_partner uuid;
begin
  select c.member_a, c.member_b, c.status,
         (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date
    into v_member_a, v_member_b, v_status, v_today
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select cd.id, cd.state, cd.wave_pct, cd.drop_id
    into v_cd_id, v_state, v_wave, v_drop_id
  from public.couple_drops cd
  where cd.couple_id = p_couple and cd.date = v_today;

  if v_cd_id is null then
    return json_build_object('exists', false, 'date', v_today);
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
    'held', (v_status = 'pending')
  );
end;
$$;

grant execute on function public.get_today_state(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- sim_partner_submit is a DEV helper. Prod revoked it in the dashboard on
-- 29 Jun (GO_LIVE.md §7); commit that here for parity. supabase/seed.sql
-- (local-only) re-grants it so solo dev testing still works.
-- ----------------------------------------------------------------------------
revoke execute on function public.sim_partner_submit(uuid) from authenticated, anon;

-- ----------------------------------------------------------------------------
-- Daily streak reset: 16:00 UTC = 00:00 SGT (couples default to Asia/Singapore).
-- Prod had this only in the dashboard; committed here for parity. If a
-- dashboard-created job with a different name exists, delete that one.
-- Guarded: local stacks without pg_cron just skip.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job where jobname = 'reset-stale-streaks';
    perform cron.schedule(
      'reset-stale-streaks',
      '0 16 * * *',
      'select public.reset_stale_streaks()'
    );
  end if;
exception when others then
  raise notice 'pg_cron not available; skipping schedule: %', sqlerrm;
end $$;
