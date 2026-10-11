-- 0007_streak_reset.sql
-- The shared streak is the central retention mechanic but it could only ever go
-- up: complete_streak incremented on every play regardless of gaps, and the
-- freezes_remaining column was never read. This makes the streak honest:
--   * complete_streak is gap-aware (consecutive day -> +1; gap -> restart at 1).
--   * reset_stale_streaks() zeroes the streak for couples who missed a day,
--     spending a freeze first when one is available (forgiveness). Meant to run
--     daily via pg_cron / a scheduled edge function (see backlog: Yash).

-- ----------------------------------------------------------------------------
-- complete_streak: gap-aware increment
-- ----------------------------------------------------------------------------
create or replace function public.complete_streak(p_couple_drop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_last date;
  v_streak int;
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

  select last_played_on, streak into v_last, v_streak
  from public.couples where id = v_couple_id;

  -- Already counted today — idempotent.
  if v_last = current_date then
    return;
  end if;

  -- Consecutive day continues the run; any larger gap restarts it at 1.
  if v_last = current_date - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  update public.couples
  set streak = v_streak,
      longest_streak = greatest(longest_streak, v_streak),
      last_played_on = current_date
  where id = v_couple_id;

  perform public.log_activity(v_couple_id, 'played', '{}');
end;
$$;

grant execute on function public.complete_streak(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- reset_stale_streaks: daily maintenance (run by a scheduler, not clients)
-- Returns the number of couples whose streak was reset to 0.
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
      last_played_on = current_date - 1
  where streak > 0
    and last_played_on = current_date - 2
    and freezes_remaining > 0;

  -- Anyone still behind by more than a day (no freeze, or a bigger gap) resets.
  with reset as (
    update public.couples
    set streak = 0
    where streak > 0
      and last_played_on < current_date - 1
    returning 1
  )
  select count(*)::int into v_reset_count from reset;

  return v_reset_count;
end;
$$;

-- Only the service role / scheduler runs this batch job — never the client.
revoke all on function public.reset_stale_streaks() from public;
grant execute on function public.reset_stale_streaks() to service_role;
