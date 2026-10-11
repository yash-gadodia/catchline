-- 0041_mood_checks.sql
-- V2 capture: daily temperature check (docs/V2_PLAN.md §4.1 + §11.17):
-- "how are we today?" → one of 4 soft options (golden/good/off/heavy).
-- A rough pick shows a quiet offer to enter Refocus. Rate-limited to once
-- per couple-local-day; skipped if the couple already played the drop that day.
--
-- Design decisions:
--   1. mood_checks: id, couple_id, user_id, couple_local_date, mood (enum),
--      refocus_offered (boolean — did we show the Refocus entry point?),
--      created_at. Unique on (couple_id, user_id, couple_local_date) so each
--      partner gets their own check-in each day (not one-per-couple).
--   2. Couple-local-date: same DST-safe primitive as drops/check-ins. Stored
--      as date, computed from the couple's tz. Server-side dedup ensures
--      the app never asks twice the same day.
--   3. RLS: couple members read all moods for their couple (aggregate for the
--      greeting card, no privacy sensitivity). Non-members read 0 rows.
--   4. submit_mood_check: authenticated callable. Upserts the row (same day,
--      same user overwrites). Returns the mood + refocus_offered flag.

create table if not exists public.mood_checks (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  couple_local_date date not null,
  mood text not null check (mood in ('golden', 'good', 'off', 'heavy')),
  refocus_offered boolean not null default false,
  created_at timestamptz not null default now(),
  unique(couple_id, user_id, couple_local_date)
);

create index if not exists idx_mood_checks_couple_date
  on public.mood_checks (couple_id, couple_local_date desc);

alter table public.mood_checks enable row level security;

-- RLS: couple members read all moods for their couple (no privacy — it's a greeting).
drop policy if exists "mood_checks_select" on public.mood_checks;
create policy "mood_checks_select"
  on public.mood_checks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- ============================================================================
-- NEW: submit_mood_check(p_couple, p_mood) -> jsonb
-- Called when the user picks a mood (golden/good/off/heavy). Upserts the row
-- for (couple_id, user_id, couple_local_date). If the mood is rough (off/heavy)
-- and refocus_offered is false, set refocus_offered=true (show the offer once).
-- Returns { mood, refocus_offered } so the app knows whether to render the
-- Refocus entry point.
-- ============================================================================
create or replace function public.submit_mood_check(
  p_couple uuid,
  p_mood text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_couple_local_date date;
  v_refocus_offered boolean := false;
  v_result jsonb;
begin
  v_caller := auth.uid();

  if not exists (
    select 1 from public.couples c
    where c.id = p_couple
      and (c.member_a = v_caller or c.member_b = v_caller)
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if p_mood not in ('golden', 'good', 'off', 'heavy') then
    raise exception 'invalid_mood';
  end if;

  -- Compute couple-local date.
  select (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date into v_couple_local_date
  from public.couples c
  where c.id = p_couple;

  if v_couple_local_date is null then
    raise exception 'couple_not_found';
  end if;

  -- Upsert: if rough mood and not yet offered, set refocus_offered=true.
  insert into public.mood_checks (
    couple_id, user_id, couple_local_date, mood, refocus_offered
  )
  values (
    p_couple,
    v_caller,
    v_couple_local_date,
    p_mood,
    p_mood in ('off', 'heavy')
  )
  on conflict (couple_id, user_id, couple_local_date)
  do update set
    mood = excluded.mood,
    refocus_offered = (mood_checks.refocus_offered or excluded.refocus_offered)
  returning refocus_offered into v_refocus_offered;

  v_result := json_build_object(
    'mood', p_mood,
    'refocus_offered', v_refocus_offered
  )::jsonb;

  return v_result;
end;
$$;

grant execute on function public.submit_mood_check(uuid, text) to authenticated;

-- ============================================================================
-- GRANTS (0037 pattern)
-- ============================================================================
revoke all on public.mood_checks from public, anon, authenticated;
grant select on public.mood_checks to authenticated;
grant select, insert, update, delete on public.mood_checks to service_role;
