-- 0016_nudge_push.sql
-- Nudge becomes real (docs/IMPROVEMENT_PLAN.md §3.3): nudges are now delivered
-- as push via the notify-partner edge fn, so they need a server-side rate
-- limit. nudge_partner rejects more than 1 nudge per couple per couple-local
-- day (couples.tz, default Asia/Singapore — same pattern as 0014). The
-- rejection message 'nudge_rate_limited' is a stable code the client turns
-- into a friendly toast.

create or replace function public.nudge_partner(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_tz text;
  v_today date;
begin
  -- Guard: caller must be a member of p_couple (and resolve the couple tz).
  select coalesce(c.tz, 'Asia/Singapore') into v_tz
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_tz is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  v_today := (now() at time zone v_tz)::date;

  -- Rate limit: 1 nudge per couple per couple-local day.
  if exists (
    select 1
    from public.activity a
    where a.couple_id = p_couple
      and a.kind = 'nudge'
      and (a.created_at at time zone v_tz)::date = v_today
  ) then
    raise exception 'nudge_rate_limited';
  end if;

  -- Log a 'nudge' activity
  v_activity_id := public.log_activity(p_couple, 'nudge', '{}');

  return v_activity_id;
end;
$$;

grant execute on function public.nudge_partner(uuid) to authenticated;
