-- 0044_repair_checkin_lifecycle.sql
-- V2 F2 wiring (V2_PLAN §4.2, §10, §11.13): 0040 shipped the table, the
-- verdict RPC and the expiry fn — but nothing CREATES a check-in, and the
-- partner can't read an open one under row-level RLS. This migration closes
-- the lifecycle:
--
--   1. bridge_sent_at on refocus_sessions (+ mark_bridge_sent): a solo
--      session becomes check-in-eligible only when the author tapped
--      "copy to share" on the bridge (F2's solo entry condition).
--   2. ensure_repair_checkin(p_couple): app-open sweep (get_today_state
--      pattern). Creates the due check-in for the newest eligible session:
--      two-sided revealed with anchor >= 24h ago, or solo with
--      bridge_sent_at >= 24h ago — both capped at 7 days so stale sessions
--      never resurrect a card. Anchor = MAX(both submitted_at) =
--      greatest(created_at, partner_joined_at), NOT the mediation timestamp
--      (§11.13). Dedup is the (couple_id, couple_local_date) unique key:
--      a second same-day session folds in (on conflict do nothing).
--   3. get_repair_checkin(p_couple): the safe projection both partners read.
--      Pre-reveal it exposes only MY verdict + whether the partner answered
--      (a boolean, same trust model as get_today_state) — verdicts stay
--      server-held until state='revealed'.
--   4. submit_repair_verdict role fix: 0040's null-session fallback wrote
--      partner_verdict for BOTH callers (the check-in could never reveal).
--      Roles now fall back deterministically to couples.member_a.
--   5. Schedules expire_stale_repair_checkins 6-hourly (0021 cron pattern).

alter table public.refocus_sessions
  add column if not exists bridge_sent_at timestamptz;

-- ============================================================================
-- mark_bridge_sent(p_session): the solo author tapped "copy to share".
-- Idempotent (first tap wins); author-only; solo sessions only.
-- ============================================================================
create or replace function public.mark_bridge_sent(
  p_session uuid
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
    raise exception 'bridge_sent_solo_only';
  end if;

  update public.refocus_sessions
  set bridge_sent_at = coalesce(bridge_sent_at, now())
  where id = p_session;
end;
$$;

grant execute on function public.mark_bridge_sent(uuid) to authenticated;

-- ============================================================================
-- ensure_repair_checkin(p_couple) -> uuid (the created row id, or null)
-- Called on app open (alongside get_today_state). Creates at most one
-- check-in: the newest session that became due (anchor + 24h passed) within
-- the last 7 days and whose day isn't already covered.
-- ============================================================================
create or replace function public.ensure_repair_checkin(
  p_couple uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_tz text;
  v_session record;
  v_checkin_id uuid;
begin
  v_caller := auth.uid();

  if not exists (
    select 1 from public.couples c
    where c.id = p_couple
      and (c.member_a = v_caller or c.member_b = v_caller)
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select coalesce(c.tz, 'Asia/Singapore') into v_tz
  from public.couples c where c.id = p_couple;

  -- Newest eligible session: two-sided revealed (anchor = both sides in) or
  -- solo with the bridge sent; due 24h after the anchor, stale after 7 days.
  select rs.id,
         case when rs.is_solo
              then rs.bridge_sent_at
              else greatest(rs.created_at, coalesce(rs.partner_joined_at, rs.created_at))
         end as anchor
  into v_session
  from public.refocus_sessions rs
  where rs.couple_id = p_couple
    and (
      (not rs.is_solo and rs.state = 'revealed')
      or (rs.is_solo and rs.bridge_sent_at is not null)
    )
  order by 2 desc
  limit 1;

  if v_session.id is null or v_session.anchor is null then
    return null;
  end if;

  if v_session.anchor > now() - interval '24 hours'
     or v_session.anchor < now() - interval '7 days' then
    return null;
  end if;

  -- The check-in asks about the session's day (couple-local). A same-day
  -- second session folds into the existing row via the unique key.
  insert into public.repair_checkins (couple_id, session_id, couple_local_date)
  values (
    p_couple,
    v_session.id,
    (v_session.anchor at time zone v_tz)::date
  )
  on conflict (couple_id, couple_local_date) do nothing
  returning id into v_checkin_id;

  return v_checkin_id;
end;
$$;

grant execute on function public.ensure_repair_checkin(uuid) to authenticated;

-- ============================================================================
-- get_repair_checkin(p_couple) -> jsonb
-- The projection both partners render from. Reveal gate lives HERE: verdicts
-- only appear once state = 'revealed'. still_open rows and rows older than
-- 7 days return exists=false (the card quietly leaves Today).
-- ============================================================================
create or replace function public.get_repair_checkin(
  p_couple uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_row public.repair_checkins%rowtype;
  v_initiator uuid;
  v_i_am_initiator boolean;
  v_my_verdict text;
  v_their_verdict text;
begin
  v_caller := auth.uid();

  if not exists (
    select 1 from public.couples c
    where c.id = p_couple
      and (c.member_a = v_caller or c.member_b = v_caller)
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select * into v_row
  from public.repair_checkins
  where couple_id = p_couple
    and state <> 'still_open'
    and created_at > now() - interval '7 days'
  order by created_at desc
  limit 1;

  if v_row.id is null then
    return json_build_object('exists', false)::jsonb;
  end if;

  -- Role: the session's initiator owns initiator_verdict; if the session is
  -- gone (deleted account), member_a owns it — deterministic either way.
  select rs.initiator into v_initiator
  from public.refocus_sessions rs where rs.id = v_row.session_id;
  if v_initiator is null then
    select c.member_a into v_initiator from public.couples c where c.id = p_couple;
  end if;
  v_i_am_initiator := (v_caller = v_initiator);
  v_my_verdict := case when v_i_am_initiator then v_row.initiator_verdict else v_row.partner_verdict end;
  v_their_verdict := case when v_i_am_initiator then v_row.partner_verdict else v_row.initiator_verdict end;

  return json_build_object(
    'exists', true,
    'id', v_row.id,
    'state', v_row.state,
    'created_at', v_row.created_at,
    'revealed_at', v_row.revealed_at,
    'i_answered', v_my_verdict is not null,
    'partner_answered', v_their_verdict is not null,
    'my_verdict', v_my_verdict,
    -- the reveal gate: the partner's verdict crosses the wire only revealed
    'their_verdict', case when v_row.state = 'revealed' then v_their_verdict else null end,
    -- 48h reflection belongs to the partner who DID answer
    'reflection_mine', v_row.state = 'reflection' and v_my_verdict is not null
  )::jsonb;
end;
$$;

grant execute on function public.get_repair_checkin(uuid) to authenticated;

-- ============================================================================
-- submit_repair_verdict: deterministic role fallback (fixes 0040 where a
-- null session_id sent BOTH callers to partner_verdict).
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

  if not exists (
    select 1 from public.couples c
    where c.id = v_checkin.couple_id
      and (c.member_a = v_caller or c.member_b = v_caller)
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_checkin.state not in ('open') then
    raise exception 'repair_checkin_closed';
  end if;

  select rs.initiator into v_initiator_id
  from public.refocus_sessions rs
  where rs.id = v_checkin.session_id;
  if v_initiator_id is null then
    select c.member_a into v_initiator_id
    from public.couples c where c.id = v_checkin.couple_id;
  end if;

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

  update public.repair_checkins
  set state = 'revealed',
      revealed_at = now()
  where id = p_checkin
    and initiator_verdict is not null
    and partner_verdict is not null;
end;
$$;

grant execute on function public.submit_repair_verdict(uuid, text) to authenticated;

-- ============================================================================
-- Cron: expire_stale_repair_checkins 6-hourly (0021 pattern; §11.13)
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job where jobname = 'expire-stale-repair-checkins';
    perform cron.schedule(
      'expire-stale-repair-checkins',
      '15 */6 * * *',
      'select public.expire_stale_repair_checkins()'
    );
  end if;
exception when others then
  raise notice 'pg_cron not available; skipping schedule: %', sqlerrm;
end $$;
