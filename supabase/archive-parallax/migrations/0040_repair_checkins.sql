-- 0040_repair_checkins.sql
-- V2 repair check-in loop (docs/V2_PLAN.md §4.2 + §11.13):
-- "yesterday was a lot. did you two find your way back?" — a 24h follow-up
-- to two-sided refocus reveals. Mutual answers trigger a reveal at both partners.
-- One-sided after 48h flips to a private reflection note.
-- After 72h, auto-resolves as "still open" (terminal).
--
-- Design decisions:
--   1. repair_checkins: id, couple_id, session_id (refs refocus_sessions),
--      couple_local_date (dedup key — one check-in per day per couple),
--      initiator_verdict, partner_verdict (yes/getting_there/still_tender),
--      state ('open' -> 'revealed' both answered, or 'open' -> 'reflection' 48h
--      one-sided, or 'reflection'/'open' -> 'still_open' 72h). Times: created_at,
--      revealed_at (set when both answered or when 72h auto-resolve), most_recent_submit.
--   2. Keying (couple_id, couple_local_date) ensures same-day second session
--      folds into the existing check-in (same question asked only once).
--   3. RLS: initiator can read before reveal; partner reads 0 rows until
--      state='revealed' (same gate as couple_drops reveal). Author of a 48h
--      reflection note reads it; partner does not.
--   4. Cron: expire_stale_repair_checkins() runs 6-hourly via pg_cron (0021
--      pattern). Handles 48h -> reflection (one-sided) and 72h -> still_open.
--   5. On reveal (two-sided), the app logs a 'repair' activity and may render
--      celebration UI. On 48h reflection, auto-create a private learning.

create table if not exists public.repair_checkins (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  session_id uuid references public.refocus_sessions(id) on delete set null,
  couple_local_date date not null,
  initiator_verdict text check (initiator_verdict is null or initiator_verdict in ('yes', 'getting_there', 'still_tender')),
  partner_verdict text check (partner_verdict is null or partner_verdict in ('yes', 'getting_there', 'still_tender')),
  state text not null default 'open'
    check (state in ('open', 'revealed', 'reflection', 'still_open')),
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  most_recent_submit timestamptz,
  unique(couple_id, couple_local_date)
);

create index if not exists idx_repair_checkins_couple_created
  on public.repair_checkins (couple_id, created_at desc);

alter table public.repair_checkins enable row level security;

-- RLS: initiator (and both partners post-reveal) can read their own check-in.
-- Pre-reveal (state='open'), only the initiator can read. Post-reveal, both see.
drop policy if exists "repair_checkins_select" on public.repair_checkins;
create policy "repair_checkins_select"
  on public.repair_checkins
  for select
  to authenticated
  using (
    exists (
      select 1 from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
    and (
      state in ('revealed', 'reflection', 'still_open')
      or (state = 'open' and session_id in (
        select id from public.refocus_sessions rs
        where rs.couple_id = couple_id
          and rs.initiator = auth.uid()
      ))
    )
  );

-- ============================================================================
-- NEW: submit_repair_verdict(p_checkin, p_verdict) -> void
-- Called when the user answers the check-in (yes / getting_there / still_tender).
-- Sets the appropriate verdict (initiator_verdict or partner_verdict based on
-- who's calling) + updates most_recent_submit. If both answered, state flips
-- to 'revealed'.
-- ============================================================================
create or replace function public.submit_repair_verdict(
  p_checkin uuid,
  p_verdict text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkin public.repair_checkins%rowtype;
  v_caller uuid;
  v_session public.refocus_sessions%rowtype;
  v_initiator_id uuid;
begin
  v_caller := auth.uid();

  select * into v_checkin
  from public.repair_checkins
  where id = p_checkin;

  if v_checkin.id is null then
    raise exception 'repair_checkin_not_found';
  end if;

  if p_verdict not in ('yes', 'getting_there', 'still_tender') then
    raise exception 'invalid_verdict';
  end if;

  -- Get session to identify initiator/partner roles.
  if v_checkin.session_id is not null then
    select * into v_session
    from public.refocus_sessions
    where id = v_checkin.session_id;
    v_initiator_id := v_session.initiator;
  else
    -- Fallback: no session (legacy or 48h reflection edge case).
    -- Check the couple membership anyway.
    if not exists (
      select 1 from public.couples c
      where c.id = v_checkin.couple_id
        and (c.member_a = v_caller or c.member_b = v_caller)
    ) then
      raise exception 'Unauthorized: not a member of this couple';
    end if;
    v_initiator_id := null;
  end if;

  -- Caller must be a couple member.
  if not exists (
    select 1 from public.couples c
    where c.id = v_checkin.couple_id
      and (c.member_a = v_caller or c.member_b = v_caller)
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Decide which verdict column to update.
  if v_caller = v_initiator_id then
    update public.repair_checkins
    set initiator_verdict = p_verdict,
        most_recent_submit = now()
    where id = p_checkin;
  else
    update public.repair_checkins
    set partner_verdict = p_verdict,
        most_recent_submit = now()
    where id = p_checkin;
  end if;

  -- Check if both answered; if so, reveal.
  select * into v_checkin
  from public.repair_checkins
  where id = p_checkin;

  if v_checkin.initiator_verdict is not null and v_checkin.partner_verdict is not null then
    update public.repair_checkins
    set state = 'revealed',
        revealed_at = now()
    where id = p_checkin;
  end if;
end;
$$;

grant execute on function public.submit_repair_verdict(uuid, text) to authenticated;

-- ============================================================================
-- NEW: expire_stale_repair_checkins() -> integer
-- Service-role cron job (6-hourly via pg_cron, 0021 pattern).
-- Transitions:
--   - 'open' 48h+ with only one verdict -> 'reflection' (partner never engaged)
--   - 'open'/'reflection' 72h+ -> 'still_open' (terminal)
-- For the 48h reflection case, auto-creates a private learning from initiator's
-- sentiment (if available). Returns count of transitioned rows.
-- ============================================================================
create or replace function public.expire_stale_repair_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row public.repair_checkins%rowtype;
  v_initiator uuid;
begin
  -- 48h one-sided -> reflection
  for v_row in
    select *
    from public.repair_checkins
    where state = 'open'
      and (initiator_verdict is not null or partner_verdict is not null)
      and (initiator_verdict is null or partner_verdict is null)
      and created_at < now() - interval '48 hours'
  loop
    -- Determine who responded.
    select rs.initiator into v_initiator
    from public.refocus_sessions rs
    where rs.id = v_row.session_id;

    update public.repair_checkins
    set state = 'reflection',
        revealed_at = now()
    where id = v_row.id;

    -- Auto-create a private learning for the person who engaged solo.
    if v_initiator is not null then
      perform public.add_private_learning(
        v_row.couple_id,
        'repair check-in reflection: ' || coalesce(v_row.initiator_verdict, v_row.partner_verdict, 'incomplete')
      );
    end if;

    v_count := v_count + 1;
  end loop;

  -- 72h still open or reflection -> still_open (terminal)
  update public.repair_checkins
  set state = 'still_open',
      revealed_at = now()
  where state in ('open', 'reflection')
    and created_at < now() - interval '72 hours';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_repair_checkins() from public, anon, authenticated;
grant execute on function public.expire_stale_repair_checkins() to service_role;

-- ============================================================================
-- GRANTS (0037 pattern)
-- ============================================================================
revoke all on public.repair_checkins from public, anon, authenticated;
grant select on public.repair_checkins to authenticated;
grant select, insert, update, delete on public.repair_checkins to service_role;
