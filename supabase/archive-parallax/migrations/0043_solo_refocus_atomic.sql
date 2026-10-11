-- 0043_solo_refocus_atomic.sql
-- Fix two latent hazards in 0039's solo API, found while wiring the client:
--
--   1. BLOCKING BUG: start_refocus(p_is_solo => true) inserted the solo row
--      with the default state 'waiting_partner', occupying the partial unique
--      index refocus_sessions_one_open_per_couple. A subsequent two-sided open
--      hit unique_violation, and the recovery SELECT (filtered `not is_solo`)
--      found nothing -> 'refocus_session_race_unresolved'. One solo session
--      bricked the couple's two-sided Refocus until expiry. It also violated
--      0039's own documented invariant ("solo rows are never in the open
--      state") and leaked into the open-session client query.
--
--   2. PRIVACY LEAK: start_refocus logged 'refocus' activity for solo starts.
--      The activity feed is couple-shared, so the partner could see that a
--      solo session happened — a solo session must be invisible to the
--      partner ENTIRELY (0039's own RLS goal).
--
-- Fix: solo sessions are created atomically by save_solo_refocus at the
-- moment the reflection is saved — born 'revealed', ai_result + solo_saved_at
-- set, no activity log. start_refocus goes back to two-sided only (keeping
-- the 0039 race fix). The open-state invariant is now structural: no code
-- path can create a solo row in 'waiting_partner'/'ready'.

-- ============================================================================
-- start_refocus: two-sided only again (race fix retained)
-- ============================================================================
drop function if exists public.start_refocus(uuid, text, text, boolean);

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

  if exists (
    select 1
    from public.refocus_sessions rs
    where rs.couple_id = p_couple
      and rs.state in ('waiting_partner', 'ready')
  ) then
    raise exception 'refocus_session_already_open';
  end if;

  -- Try insert; on conflict (races that bypass the guard), return the existing row.
  begin
    insert into public.refocus_sessions (
      couple_id, initiator, topic, initiator_side
    )
    values (p_couple, v_caller, trim(p_topic), trim(p_side))
    returning id into v_session_id;
  exception when unique_violation then
    select id into v_session_id
    from public.refocus_sessions
    where couple_id = p_couple
      and state in ('waiting_partner', 'ready')
    limit 1;
    if v_session_id is null then
      raise exception 'refocus_session_race_unresolved';
    end if;
    return v_session_id;
  end;

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
-- save_solo_refocus: atomic create-and-save (replaces the 0039 two-step API)
-- Called once, after a successful solo reflection. The row is born 'revealed'
-- so it can never occupy the open-session slot, and nothing is written to the
-- shared activity feed.
-- ============================================================================
drop function if exists public.save_solo_refocus(uuid, jsonb);

create or replace function public.save_solo_refocus(
  p_couple uuid,
  p_topic text,
  p_side text,
  p_ai_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_session_id uuid;
begin
  v_caller := auth.uid();

  if not exists (
    select 1 from public.couples c
    where c.id = p_couple
      and (c.member_a = v_caller or c.member_b = v_caller)
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if coalesce(trim(p_topic), '') = '' or coalesce(trim(p_side), '') = '' then
    raise exception 'refocus_input_required';
  end if;

  if p_ai_result is null then
    raise exception 'refocus_result_required';
  end if;

  insert into public.refocus_sessions (
    couple_id, initiator, topic, initiator_side,
    is_solo, state, ai_result, solo_saved_at, revealed_at
  )
  values (
    p_couple, v_caller, trim(p_topic), trim(p_side),
    true, 'revealed', p_ai_result, now(), now()
  )
  returning id into v_session_id;

  -- No log_activity: a solo session is invisible to the partner entirely.

  return v_session_id;
end;
$$;

grant execute on function public.save_solo_refocus(uuid, text, text, jsonb) to authenticated;
