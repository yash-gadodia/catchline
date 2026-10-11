-- 0046_repair_checkins_rls_tighten.sql
-- Close a reveal-gate hole in 0040's RLS, caught by the V2 S1 self-review:
-- the select policy exposed raw rows (both verdict columns) to BOTH couple
-- members for state in ('revealed','reflection','still_open'). But
-- 'reflection' (48h) and 'still_open' (72h) are reached when only ONE
-- partner answered — the non-answering partner could bypass
-- get_repair_checkin() with a plain select and read the other's verdict
-- ("still_tender") that was never mutually revealed. Exactly the
-- verdict-crosses-the-wire-pre-reveal failure F2 exists to prevent.
--
-- Fix: raw selects only see rows whose verdicts were MUTUALLY revealed
-- (state = 'revealed'). Every other state is served exclusively through the
-- get_repair_checkin DEFINER projection (0044), which redacts the partner's
-- verdict. The only client raw-select (useRepairStats) already filters
-- state='revealed', so nothing app-side changes.

drop policy if exists "repair_checkins_select" on public.repair_checkins;
create policy "repair_checkins_select"
  on public.repair_checkins
  for select
  to authenticated
  using (
    state = 'revealed'
    and exists (
      select 1 from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );
