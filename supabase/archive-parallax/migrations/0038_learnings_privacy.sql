-- 0038_learnings_privacy.sql
-- V2 learnings engine (docs/V2_PLAN.md §4 + §11.12):
-- private reflection notes are solo-session insights ("I was selfish that day")
-- that a partner can never see. This migration adds author tracking + privacy.
--
-- Design decisions:
--   1. author_id: nullable uuid -> existing rows stay null (couple-visible).
--      New rows stamped by add_learning and the solo-persist DEFINER fn.
--   2. is_private: boolean default false. Couple-visible learnings (the norm)
--      read by both; private notes (solo reflections, 48h fallback) read only
--      by author. RLS enforces: (NOT is_private AND couple_member) OR
--      (is_private AND author_id = auth.uid()).
--   3. Composite index idx_learnings_couple_created for the growth counter (F5).
--      Enables fast "count learnings for couple ordered by created_at desc".
--   4. All grants follow 0037 least-privilege (SELECT only for authenticated;
--      writes through DEFINER functions or service_role).

alter table public.learnings
  add column if not exists author_id uuid references public.profiles(id) on delete set null,
  add column if not exists is_private boolean not null default false;

create index if not exists idx_learnings_couple_created
  on public.learnings (couple_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Drop the old blanket policy and replace with author-aware logic.
drop policy if exists "learnings_select_member" on public.learnings;

create policy "learnings_select_member"
  on public.learnings
  for select
  to authenticated
  using (
    (not is_private and exists (
      select 1 from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    ))
    or
    (is_private and author_id = auth.uid())
  );

-- ============================================================================
-- UPDATE add_learning: stamp author_id on insert
-- ============================================================================
create or replace function public.add_learning(
  p_couple uuid,
  p_about uuid,
  p_emoji text,
  p_need text,
  p_detail text,
  p_source text,
  p_origin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learning_id uuid;
begin
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = p_about or c.member_b = p_about)
  ) then
    raise exception 'p_about is not a member of this couple';
  end if;

  if p_source not in ('drop', 'refocus') then
    raise exception 'p_source must be drop or refocus';
  end if;

  insert into public.learnings (
    couple_id, about, emoji, need, detail, source, origin, author_id
  )
  values (p_couple, p_about, p_emoji, p_need, p_detail, p_source, p_origin, auth.uid())
  on conflict (couple_id, about, origin) do update
  set emoji = excluded.emoji,
      need = excluded.need,
      detail = excluded.detail,
      source = excluded.source,
      author_id = excluded.author_id
  returning id into v_learning_id;

  return v_learning_id;
end;
$$;

grant execute on function public.add_learning(uuid, uuid, text, text, text, text, text) to authenticated;

-- ============================================================================
-- NEW: add_private_learning(p_couple, p_learning_detail) -> uuid
-- For solo-session 48h fallback reflection notes (F2). Creates a private insight
-- visible only to the author (the partner who did the work).
-- ============================================================================
create or replace function public.add_private_learning(
  p_couple uuid,
  p_learning_detail text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learning_id uuid;
begin
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if coalesce(trim(p_learning_detail), '') = '' then
    raise exception 'learning_detail_required';
  end if;

  insert into public.learnings (
    couple_id, about, detail, source, origin, author_id, is_private
  )
  values (p_couple, auth.uid(), trim(p_learning_detail), 'refocus', null, auth.uid(), true)
  returning id into v_learning_id;

  return v_learning_id;
end;
$$;

grant execute on function public.add_private_learning(uuid, text) to authenticated;

-- ============================================================================
-- GRANTS (0037 pattern)
-- ============================================================================
revoke all on public.learnings from public, anon, authenticated;
grant select on public.learnings to authenticated;
grant select, insert, update, delete on public.learnings to service_role;
