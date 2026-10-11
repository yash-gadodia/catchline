-- ============================================================================
-- DROPS, DROP_PROMPTS, COUPLE_DROPS, ANSWERS
--
-- Security-critical schema for the daily-loop reveal gate.
-- Enforce that partner answers are only visible when both have submitted.
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- drops: global catalog of daily prompts
create table if not exists public.drops (
  id uuid not null primary key default gen_random_uuid(),
  code text,
  title text,
  theme text,
  pack_id uuid null,
  created_at timestamptz default now()
);

-- drop_prompts: questions within a drop
create table if not exists public.drop_prompts (
  id uuid not null primary key default gen_random_uuid(),
  drop_id uuid not null references public.drops(id) on delete cascade,
  position int,
  emoji text,
  question text,
  options text[],
  created_at timestamptz default now()
);

-- couple_drops: instance of a drop assigned to a couple on a specific date
create table if not exists public.couple_drops (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  drop_id uuid not null references public.drops(id),
  date date not null,
  state text not null default 'open' check (state in ('open', 'one_done', 'revealed')),
  created_at timestamptz default now(),
  unique(couple_id, date)
);

-- answers: per-member answers to prompts within a couple_drop
create table if not exists public.answers (
  id uuid not null primary key default gen_random_uuid(),
  couple_drop_id uuid not null references public.couple_drops(id) on delete cascade,
  prompt_id uuid not null references public.drop_prompts(id),
  author uuid not null references public.profiles(id),
  pick int,
  hunch int,
  created_at timestamptz default now(),
  unique(couple_drop_id, prompt_id, author)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all four tables
alter table public.drops enable row level security;
alter table public.drop_prompts enable row level security;
alter table public.couple_drops enable row level security;
alter table public.answers enable row level security;

-- drops: readable by any authenticated user (global catalog)
create policy "drops_select_authenticated"
  on public.drops
  for select
  to authenticated
  using (true);

-- drop_prompts: readable by any authenticated user (global catalog)
create policy "drop_prompts_select_authenticated"
  on public.drop_prompts
  for select
  to authenticated
  using (true);

-- couple_drops: select if user is a member of the couple
create policy "couple_drops_select_member"
  on public.couple_drops
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

-- couple_drops: update if user is a member of the couple
--   (needed for internal state transitions; submit_answers will handle the update)
create policy "couple_drops_update_member"
  on public.couple_drops
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

-- answers: SELECT own answers always
create policy "answers_select_own"
  on public.answers
  for select
  to authenticated
  using (author = auth.uid());

-- answers: SELECT partner's answers only when couple_drop.state = 'revealed'
create policy "answers_select_partner_revealed"
  on public.answers
  for select
  to authenticated
  using (
    author != auth.uid()
    and exists (
      select 1
      from public.couple_drops cd
      where cd.id = couple_drop_id
        and cd.state = 'revealed'
        and exists (
          select 1
          from public.couples c
          where c.id = cd.couple_id
            and (c.member_a = auth.uid() or c.member_b = auth.uid())
        )
    )
  );

-- answers: INSERT only for couple_drops the caller is a member of, as author = auth.uid()
create policy "answers_insert_member"
  on public.answers
  for insert
  to authenticated
  with check (
    author = auth.uid()
    and exists (
      select 1
      from public.couple_drops cd
      where cd.id = couple_drop_id
        and exists (
          select 1
          from public.couples c
          where c.id = cd.couple_id
            and (c.member_a = auth.uid() or c.member_b = auth.uid())
        )
    )
  );

-- ============================================================================
-- SECURITY DEFINER FUNCTION: submit_answers
--
-- Inserts/updates the caller's answers for a couple_drop, then updates the
-- couple_drop state based on submission status:
--   'one_done' if only one member has answered all prompts
--   'revealed' once both members have answered all prompts
--
-- Authorization: caller must be a member of the couple.
-- ============================================================================

create or replace function public.submit_answers(
  p_couple_drop uuid,
  p_answers jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_other_member uuid;
  v_prompt_id uuid;
  v_pick int;
  v_hunch int;
  v_answer jsonb;
  v_new_state text;
  v_member_a_done boolean;
  v_member_b_done boolean;
  v_prompt_count int;
begin
  -- Get the couple_drop and verify membership
  select cd.couple_id into v_couple_id
  from public.couple_drops cd
  where cd.id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  -- Verify caller is a member of the couple
  if not exists (
    select 1
    from public.couples c
    where c.id = v_couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Get the drop associated with this couple_drop to count prompts
  select count(*)::int into v_prompt_count
  from public.drop_prompts dp
  where dp.drop_id = (select drop_id from public.couple_drops where id = p_couple_drop);

  -- Insert or update each answer
  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    v_prompt_id := (v_answer->>'prompt_id')::uuid;
    v_pick := (v_answer->>'pick')::int;
    v_hunch := (v_answer->>'hunch')::int;

    insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
    values (p_couple_drop, v_prompt_id, auth.uid(), v_pick, v_hunch)
    on conflict (couple_drop_id, prompt_id, author) do update
    set pick = excluded.pick, hunch = excluded.hunch, created_at = now();
  end loop;

  -- Check if member_a has answered all prompts
  select (count(*) = v_prompt_count) into v_member_a_done
  from public.answers a
  join public.couple_drops cd on a.couple_drop_id = cd.id
  where cd.id = p_couple_drop
    and a.author = (select member_a from public.couples where id = v_couple_id);

  -- Check if member_b has answered all prompts
  select (count(*) = v_prompt_count) into v_member_b_done
  from public.answers a
  join public.couple_drops cd on a.couple_drop_id = cd.id
  where cd.id = p_couple_drop
    and a.author = (select member_b from public.couples where id = v_couple_id);

  -- Determine new state
  if v_member_a_done and v_member_b_done then
    v_new_state := 'revealed';
  elsif v_member_a_done or v_member_b_done then
    v_new_state := 'one_done';
  else
    v_new_state := 'open';
  end if;

  -- Update couple_drops state
  update public.couple_drops
  set state = v_new_state
  where id = p_couple_drop;

  return json_build_object(
    'success', true,
    'couple_drop_id', p_couple_drop,
    'new_state', v_new_state
  );
end;
$$;

grant execute on function public.submit_answers(uuid, jsonb) to authenticated;
