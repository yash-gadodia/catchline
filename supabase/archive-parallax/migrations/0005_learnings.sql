-- ============================================================================
-- LEARNINGS (LOVE-MAP / HISTORY BACKEND)
--
-- 1. learnings table: captures insights from couple drops + refocus resolutions
-- 2. add_learning(p_couple, p_about, p_emoji, p_need, p_detail, p_source, p_origin) -> uuid
--    Called by: drop reveal (refocus partner needs) or explicit add via UI
-- 3. couple_history(p_couple) -> table (date, code, title, wavelength, twins_count)
--    Returns all REVEALED couple_drops for a couple with computed wavelength
--    ordered by date DESC (most recent first)
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- learnings: captured insights from reveals and refocus resolutions
create table if not exists public.learnings (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  about uuid not null references public.profiles(id) on delete cascade,
  emoji text,
  need text,
  detail text,
  source text not null check (source in ('drop', 'refocus')),
  origin text,
  mastery int default 0,
  became_prompt_id uuid null,
  created_at timestamptz default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.learnings enable row level security;

-- learnings: SELECT if user is a member of the couple
create policy "learnings_select_member"
  on public.learnings
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

-- learnings: INSERT only via add_learning function
create policy "learnings_prevent_insert"
  on public.learnings
  for insert
  with check (false);

-- learnings: UPDATE only via add_learning or mastery increment functions
create policy "learnings_prevent_direct_update"
  on public.learnings
  for update
  with check (false);

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================================

-- add_learning(
--   p_couple uuid,
--   p_about uuid,
--   p_emoji text,
--   p_need text,
--   p_detail text,
--   p_source text,
--   p_origin text
-- ) -> uuid
--
-- Inserts a new learning row for the couple about a specific partner.
-- Called by:
--   - drop reveal handler (p_source='drop', p_origin=couple_drop_id)
--   - refocus resolution (p_source='refocus', p_origin from refocus context)
--
-- Authorization: caller must be a member of the couple.
-- Returns the ID of the new learning.
--
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
  -- Guard: caller must be a member of p_couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Guard: p_about must be a member of p_couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = p_about or c.member_b = p_about)
  ) then
    raise exception 'p_about is not a member of this couple';
  end if;

  -- Guard: p_source must be 'drop' or 'refocus'
  if p_source not in ('drop', 'refocus') then
    raise exception 'p_source must be drop or refocus';
  end if;

  -- Insert the learning
  insert into public.learnings (
    couple_id, about, emoji, need, detail, source, origin
  )
  values (p_couple, p_about, p_emoji, p_need, p_detail, p_source, p_origin)
  returning id into v_learning_id;

  return v_learning_id;
end;
$$;

grant execute on function public.add_learning(uuid, uuid, text, text, text, text, text) to authenticated;

-- ============================================================================

-- couple_history(p_couple uuid) -> table (
--   date date,
--   code text,
--   title text,
--   wavelength int,
--   twins_count int
-- )
--
-- Returns all REVEALED couple_drops for a couple with computed wavelength
-- and twins count. Wavelength is computed as:
--   (yourHunch_hits + theirHunch_hits) / (prompts_count * 2) * 100
--
-- Ordered by date DESC (most recent first).
--
-- Authorization: SECURITY DEFINER, caller must be a member of the couple.
--
create or replace function public.couple_history(p_couple uuid)
returns table (
  date date,
  code text,
  title text,
  wavelength int,
  twins_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
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

  -- Get couple members
  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c
  where c.id = p_couple;

  -- Return the history rows
  return query
  select
    cd.date,
    d.code,
    d.title,
    (
      case
        when prompt_count = 0 then 0
        else round(((yours_hits + theirs_hits) / (prompt_count::numeric * 2)) * 100)::int
      end
    ) as wavelength,
    coalesce(twins, 0) as twins_count
  from public.couple_drops cd
  join public.drops d on cd.drop_id = d.id
  left join lateral (
    select
      count(*)::int as prompt_count,
      sum(case when a_yours.hunch = a_theirs.pick then 1 else 0 end)::int as yours_hits,
      sum(case when a_theirs.hunch = a_yours.pick then 1 else 0 end)::int as theirs_hits,
      sum(case when a_yours.pick = a_theirs.pick then 1 else 0 end)::int as twins
    from public.drop_prompts dp
    left join public.answers a_yours on a_yours.prompt_id = dp.id
      and a_yours.couple_drop_id = cd.id
      and a_yours.author = v_member_a
    left join public.answers a_theirs on a_theirs.prompt_id = dp.id
      and a_theirs.couple_drop_id = cd.id
      and a_theirs.author = v_member_b
    where dp.drop_id = cd.drop_id
  ) stats on true
  where cd.couple_id = p_couple
    and cd.state = 'revealed'
  order by cd.date desc;
end;
$$;

grant execute on function public.couple_history(uuid) to authenticated;
