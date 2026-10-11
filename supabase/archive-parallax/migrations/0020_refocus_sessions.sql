-- 0020_refocus_sessions.sql
-- IMPROVEMENT_PLAN.md 4.6: Refocus v2 — genuinely two-sided mediation sessions.
-- One partner starts a session (topic + their side), the other adds their real
-- side, and ONLY then does the edge function mediate from both real inputs.
--
-- Design decisions:
--   * All writes go through SECURITY DEFINER RPCs (start_refocus /
--     add_refocus_side / expire_stale_refocus) — clients never insert/update
--     rows directly. The AI result is written by the `refocus` edge function
--     with the service role once state = 'ready'.
--   * SELECT is plain RLS: members read their own couple's sessions. Raw sides
--     are visible to both members by design — the app renders only the shared
--     result, but the session is couple-shared data, not a private diary
--     (the private path is solo mode, which persists nothing).
--   * Table-level grants per the 0006 lesson: default privileges give
--     authenticated no DML, so the table is invisible without an explicit
--     grant. Only SELECT is granted — the DEFINER fns run as owner and the
--     edge function uses service_role.
--   * Realtime: added to supabase_realtime idempotently (0018 pattern) so both
--     phones see the session flip waiting_partner -> ready -> revealed live.
--     Realtime respects RLS.

create table if not exists public.refocus_sessions (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  initiator uuid not null references public.profiles(id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 120),
  initiator_side text not null check (char_length(initiator_side) between 1 and 8000),
  partner_side text check (partner_side is null or char_length(partner_side) between 1 and 8000),
  state text not null default 'waiting_partner'
    check (state in ('waiting_partner', 'ready', 'revealed', 'expired')),
  ai_result jsonb,
  created_at timestamptz not null default now(),
  partner_joined_at timestamptz,
  revealed_at timestamptz
);

create index if not exists refocus_sessions_couple_time
  on public.refocus_sessions (couple_id, created_at desc);

alter table public.refocus_sessions enable row level security;

-- 0006 lesson: grants open the door, RLS gates the rows. SELECT only —
-- writes are DEFINER-fn / service-role territory.
grant select on public.refocus_sessions to authenticated;
grant select, insert, update, delete on public.refocus_sessions to service_role;

drop policy if exists "refocus_sessions_select_member" on public.refocus_sessions;
create policy "refocus_sessions_select_member"
  on public.refocus_sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- ============================================================================
-- start_refocus(p_couple, p_topic, p_side) -> uuid
-- The initiator opens a session with a short topic label + their own side.
-- Guards: caller is a member; exactly ONE open (waiting_partner/ready) session
-- per couple at a time. Also logs a 'refocus' activity so the feed shows it.
-- ============================================================================
create or replace function public.start_refocus(
  p_couple uuid,
  p_topic text,
  p_side text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if coalesce(trim(p_topic), '') = '' or coalesce(trim(p_side), '') = '' then
    raise exception 'refocus_input_required';
  end if;

  if exists (
    select 1
    from public.refocus_sessions rs
    where rs.couple_id = p_couple
      and rs.state in ('waiting_partner', 'ready')
  ) then
    raise exception 'refocus_session_already_open';
  end if;

  insert into public.refocus_sessions (couple_id, initiator, topic, initiator_side)
  values (p_couple, auth.uid(), trim(p_topic), trim(p_side))
  returning id into v_session_id;

  perform public.log_activity(
    p_couple,
    'refocus',
    json_build_object('topic', trim(p_topic), 'session_id', v_session_id)::jsonb
  );

  return v_session_id;
end;
$$;

grant execute on function public.start_refocus(uuid, text, text) to authenticated;

-- ============================================================================
-- add_refocus_side(p_session, p_side) -> void
-- The NON-initiator member adds their side; state flips waiting_partner -> ready.
-- The edge function does the mediation + reveal from there.
-- ============================================================================
create or replace function public.add_refocus_side(
  p_session uuid,
  p_side text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.refocus_sessions%rowtype;
begin
  select * into v_session
  from public.refocus_sessions
  where id = p_session;

  if v_session.id is null then
    raise exception 'refocus_session_not_found';
  end if;

  if not exists (
    select 1
    from public.couples c
    where c.id = v_session.couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_session.initiator = auth.uid() then
    raise exception 'refocus_initiator_cannot_add_partner_side';
  end if;

  if v_session.state <> 'waiting_partner' then
    raise exception 'refocus_session_not_waiting';
  end if;

  if coalesce(trim(p_side), '') = '' then
    raise exception 'refocus_input_required';
  end if;

  update public.refocus_sessions
  set partner_side = trim(p_side),
      partner_joined_at = now(),
      state = 'ready'
  where id = p_session;
end;
$$;

grant execute on function public.add_refocus_side(uuid, text) to authenticated;

-- ============================================================================
-- expire_stale_refocus() -> integer
-- Service-role housekeeping (cron): sessions still waiting on the partner
-- after 72h flip to 'expired' so the couple can start fresh. Returns the
-- number of sessions expired. Not callable by clients.
-- ============================================================================
create or replace function public.expire_stale_refocus()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.refocus_sessions
  set state = 'expired'
  where state = 'waiting_partner'
    and created_at < now() - interval '72 hours';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Functions are EXECUTE-able by PUBLIC by default — lock this one to service_role.
revoke execute on function public.expire_stale_refocus() from public, anon, authenticated;
grant execute on function public.expire_stale_refocus() to service_role;

-- Realtime: publish refocus_sessions so both partners see state changes live
-- (idempotent, 0018 pattern; RLS still scopes what each subscriber receives).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'refocus_sessions'
  ) then
    alter publication supabase_realtime add table public.refocus_sessions;
  end if;
end
$$;
