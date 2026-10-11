-- ============================================================================
-- ENGAGEMENT BACKEND
--
-- 1. activity table: log couple engagement events (nudges, plays, etc.)
-- 2. log_activity(p_couple uuid, p_kind text, p_payload jsonb) -> uuid
-- 3. mark_activity_read(p_couple uuid) -> void
-- 4. nudge_partner(p_couple uuid) -> uuid
-- 5. Streak management: complete_streak(p_couple_drop uuid) -> void
--    Increments couples.streak on reveal, idempotent per day.
--    TODO: Streak reset requires a scheduled daily cron job (not implemented here).
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- activity: log of couple engagement events
create table if not exists public.activity (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null,
  actor uuid references public.profiles(id) on delete set null,
  payload jsonb default '{}',
  read_by uuid[] default '{}',
  created_at timestamptz default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.activity enable row level security;

-- activity: SELECT if user is a member of the couple
create policy "activity_select_member"
  on public.activity
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

-- activity: INSERT only via log_activity function (prevent direct insert)
create policy "activity_prevent_insert"
  on public.activity
  for insert
  with check (false);

-- activity: UPDATE via mark_activity_read function
create policy "activity_update_mark_read"
  on public.activity
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- log_activity(p_couple uuid, p_kind text, p_payload jsonb) -> uuid
--
-- Inserts an activity row for the couple with the given kind and payload.
-- The actor is automatically set to auth.uid().
-- Authorization: caller must be a member of p_couple.
-- Returns the ID of the new activity row.
--
create or replace function public.log_activity(
  p_couple uuid,
  p_kind text,
  p_payload jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
begin
  -- Guard: caller must be a member of p_couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Insert activity row
  insert into public.activity (couple_id, kind, actor, payload)
  values (p_couple, p_kind, auth.uid(), coalesce(p_payload, '{}'))
  returning id into v_activity_id;

  return v_activity_id;
end;
$$;

grant execute on function public.log_activity(uuid, text, jsonb) to authenticated;

-- ============================================================================

-- mark_activity_read(p_couple uuid) -> void
--
-- Marks all unread activity for p_couple as read by appending auth.uid()
-- to the read_by array for each unread activity row.
-- Authorization: caller must be a member of p_couple.
--
create or replace function public.mark_activity_read(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard: caller must be a member of p_couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Append auth.uid() to read_by array for unread activity
  -- (exclude if already in the array to avoid duplication)
  update public.activity
  set read_by = array_append(read_by, auth.uid())
  where couple_id = p_couple
    and not (read_by @> array[auth.uid()]);
end;
$$;

grant execute on function public.mark_activity_read(uuid) to authenticated;

-- ============================================================================

-- nudge_partner(p_couple uuid) -> uuid
--
-- Logs a 'nudge' activity for the couple.
-- Authorization: caller must be a member of p_couple.
-- Returns the activity ID.
--
create or replace function public.nudge_partner(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
begin
  -- Guard: caller must be a member of p_couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Log a 'nudge' activity
  v_activity_id := public.log_activity(p_couple, 'nudge', '{}');

  return v_activity_id;
end;
$$;

grant execute on function public.nudge_partner(uuid) to authenticated;

-- ============================================================================

-- complete_streak(p_couple_drop uuid) -> void
--
-- Called when a couple_drop transitions to 'revealed'. Increments couples.streak
-- if this is the first completion for today. Updates longest_streak if streak
-- exceeds it. Sets last_played_on = current_date.
-- Logs a 'played' activity.
-- Idempotent: does not double-count if called multiple times on the same day.
-- Authorization: caller must be a member of the couple.
--
create or replace function public.complete_streak(p_couple_drop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_couple_state public.couples;
begin
  -- Get the couple_id from couple_drops
  select couple_id into v_couple_id
  from public.couple_drops
  where id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  -- Guard: caller must be a member of v_couple_id
  if not exists (
    select 1
    from public.couples c
    where c.id = v_couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Get current couple state
  select * into v_couple_state
  from public.couples
  where id = v_couple_id;

  -- If last_played_on is today, already counted; idempotent return
  if v_couple_state.last_played_on = current_date then
    return;
  end if;

  -- Increment streak, update longest_streak and last_played_on
  update public.couples
  set
    streak = streak + 1,
    longest_streak = greatest(longest_streak, streak + 1),
    last_played_on = current_date
  where id = v_couple_id;

  -- Log a 'played' activity
  perform public.log_activity(v_couple_id, 'played', '{}');
end;
$$;

grant execute on function public.complete_streak(uuid) to authenticated;
