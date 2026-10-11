-- 0039_refocus_solo_persist.sql
-- V2 fight-flywheel persistence (docs/V2_PLAN.md §4.1 + §11.11):
-- Solo refocus sessions now persist server-side with ai_result intact.
-- A solo session is invisible to the partner entirely (not just the result);
-- RLS denies the non-author even row existence.
--
-- ALSO: fix pre-existing start_refocus race where simultaneous opens from
-- both partners bypass the "one open session per couple" check.
--
-- Design decisions:
--   1. is_solo boolean: true when one partner starts solo mode (no partner
--      invite). Separate from NULL partner_side (a two-sided session waiting
--      for the partner still has partner_side=NULL). RLS denies the partner
--      ANY read of is_solo=true rows.
--   2. solo_saved_at timestamptz: set when the user taps "save this work"
--      (or on auto-save). Indicates the solo session persisted. Null until saved.
--   3. Race fix: partial unique index on (couple_id) WHERE state IN
--      ('waiting_partner','ready') excludes solo sessions (solo rows never
--      have those states in practice, but the index logic is cleaner without
--      solo check). ON CONFLICT handling in start_refocus catches simultaneous
--      inserts and returns the existing session instead of erroring.

alter table public.refocus_sessions
  add column if not exists is_solo boolean not null default false,
  add column if not exists solo_saved_at timestamptz;

-- Partial unique index: only one open two-sided session per couple.
-- Solo sessions are either revealed or expired, never in the open state.
create unique index if not exists refocus_sessions_one_open_per_couple
  on public.refocus_sessions (couple_id)
  where state in ('waiting_partner', 'ready');

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Drop old policy; add solo-aware logic.
drop policy if exists "refocus_sessions_select_member" on public.refocus_sessions;

create policy "refocus_sessions_select_member"
  on public.refocus_sessions
  for select
  to authenticated
  using (
    (not is_solo and exists (
      select 1 from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    ))
    or
    (is_solo and initiator = auth.uid())
  );

-- ============================================================================
-- UPDATE start_refocus: race fix + solo support
-- Drop the old 3-arg version (from 0020) to avoid ambiguity when upgrading
-- ============================================================================
drop function if exists public.start_refocus(uuid, text, text);

create or replace function public.start_refocus(
  p_couple uuid,
  p_topic text,
  p_side text,
  p_is_solo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_caller uuid;
begin
  v_caller := auth.uid();

  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = v_caller or c.member_b = v_caller)
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if coalesce(trim(p_topic), '') = '' or coalesce(trim(p_side), '') = '' then
    raise exception 'refocus_input_required';
  end if;

  -- Two-sided: guard against duplicate opens. Solo sessions have no constraint.
  if not p_is_solo then
    if exists (
      select 1
      from public.refocus_sessions rs
      where rs.couple_id = p_couple
        and rs.state in ('waiting_partner', 'ready')
        and not rs.is_solo
    ) then
      raise exception 'refocus_session_already_open';
    end if;
  end if;

  -- Try insert; on conflict (races that bypass the guard), return the existing row.
  begin
    insert into public.refocus_sessions (
      couple_id, initiator, topic, initiator_side, is_solo
    )
    values (p_couple, v_caller, trim(p_topic), trim(p_side), p_is_solo)
    returning id into v_session_id;
  exception when unique_violation then
    -- Race: simultaneous open from both partners got past the guard.
    -- Return the existing session. This can only happen for two-sided.
    select id into v_session_id
    from public.refocus_sessions
    where couple_id = p_couple
      and state in ('waiting_partner', 'ready')
      and not is_solo
    limit 1;
    if v_session_id is null then
      raise exception 'refocus_session_race_unresolved';
    end if;
    return v_session_id;
  end;

  perform public.log_activity(
    p_couple,
    'refocus',
    json_build_object('topic', trim(p_topic), 'session_id', v_session_id, 'is_solo', p_is_solo)::jsonb
  );

  return v_session_id;
end;
$$;

grant execute on function public.start_refocus(uuid, text, text, boolean) to authenticated;

-- ============================================================================
-- NEW: save_solo_refocus(p_session, p_ai_result) -> void
-- Called when a solo session completes (user taps "save this") or on auto-save.
-- Sets solo_saved_at = now() + stores the ai_result. The session is readable
-- by the author only (RLS enforces).
-- ============================================================================
create or replace function public.save_solo_refocus(
  p_session uuid,
  p_ai_result jsonb
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

  if v_session.initiator <> auth.uid() then
    raise exception 'Unauthorized: not the session author';
  end if;

  if not v_session.is_solo then
    raise exception 'refocus_save_solo_only';
  end if;

  update public.refocus_sessions
  set solo_saved_at = now(),
      ai_result = p_ai_result,
      state = 'revealed'
  where id = p_session;
end;
$$;

grant execute on function public.save_solo_refocus(uuid, jsonb) to authenticated;

-- ============================================================================
-- GRANTS (0037 pattern)
-- ============================================================================
revoke all on public.refocus_sessions from public, anon, authenticated;
grant select on public.refocus_sessions to authenticated;
grant select, insert, update, delete on public.refocus_sessions to service_role;
