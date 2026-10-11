-- 0017_streak_surface.sql
-- IMPROVEMENT_PLAN.md 3.4 + 3.6 (audit #13/#14): make the streak surface honest.
--
--   * get_streak_surface(p_couple): one SECURITY DEFINER round-trip for the
--     streak screen — streak, longest_streak, freezes_remaining, and `week`,
--     the REAL last-7-couple-local-days grid from couple_drops history. The
--     client's Math.min(streak, 7) synthetic fill was a lie.
--   * _increment_streak (0014 behavior preserved exactly) now also logs a
--     'milestone' activity when the new streak hits 3/7/14/30/50/100 — the
--     activity feed's 'milestone' kind finally has a producer.
--
-- Freezes stay entirely server-side: reset_stale_streaks (0014) auto-spends
-- one to forgive a single missed day. There is no client "arm" step — the
-- screen only REPORTS freezes_remaining.

-- ----------------------------------------------------------------------------
-- get_streak_surface: honest streak-screen rehydration in one round-trip.
-- Membership-guarded like get_today_state (0014); couple-local "today"
-- (couples.tz, default Asia/Singapore).
--
-- `week` is an array of 7 booleans for the last 7 couple-local days, OLDEST
-- FIRST — week[7] (the last element) is today. A day counts when that date's
-- couple_drops row reached state = 'revealed'. This matches the streak
-- screen's row of 7 dots where the final (dashed 🔥) dot is today.
-- ----------------------------------------------------------------------------
create or replace function public.get_streak_surface(p_couple uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_today date;
  v_streak int;
  v_longest int;
  v_freezes int;
  v_week json;
begin
  select c.member_a, c.member_b,
         (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date,
         coalesce(c.streak, 0), coalesce(c.longest_streak, 0),
         coalesce(c.freezes_remaining, 0)
    into v_member_a, v_member_b, v_today, v_streak, v_longest, v_freezes
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select json_agg(
           exists (
             select 1 from public.couple_drops cd
             where cd.couple_id = p_couple
               and cd.date = gs.d::date
               and cd.state = 'revealed'
           )
           order by gs.d
         )
    into v_week
  from generate_series(v_today - 6, v_today, interval '1 day') as gs(d);

  return json_build_object(
    'streak', v_streak,
    'longest_streak', v_longest,
    'freezes_remaining', v_freezes,
    'week', v_week
  );
end;
$$;

grant execute on function public.get_streak_surface(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- _increment_streak: 0014 behavior preserved exactly (couple-local day,
-- idempotent, gap-aware, logs 'played') PLUS a 'milestone' activity when the
-- new streak hits a threshold. Internal — only callable from DEFINER
-- functions (submit_answers / complete_streak), so auth.uid() is a member
-- and log_activity's guard passes.
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

  -- 0017: the feed's 'milestone' kind gets a real producer.
  if v_streak in (3, 7, 14, 30, 50, 100) then
    perform public.log_activity(p_couple, 'milestone', json_build_object('days', v_streak)::jsonb);
  end if;
end;
$$;

revoke all on function public._increment_streak(uuid) from public;
