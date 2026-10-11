-- ============================================================================
-- DAILY LOOP HELPERS
--
-- 1. SEED the DROP 27 catalog (idempotent, ON CONFLICT DO NOTHING)
-- 2. ensure_today_drop(p_couple uuid) -> uuid (SECURITY DEFINER)
-- 3. sim_partner_submit(p_couple_drop uuid) -> void (SECURITY DEFINER, demo helper)
-- ============================================================================

-- ============================================================================
-- 1. SEED DROP 27
-- ============================================================================

-- Fixed UUID for DROP 27 so it's stable across runs
do $$
declare
  v_drop_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
begin
  -- Insert the drop if it doesn't exist
  insert into public.drops (id, code, title, theme, created_at)
  values (
    v_drop_id,
    'DROP 27',
    'soft launch',
    null,
    now()
  )
  on conflict (id) do nothing;

  -- Insert the three prompts (position 0, 1, 2)
  insert into public.drop_prompts (drop_id, position, emoji, question, options, created_at)
  values
    (
      v_drop_id,
      0,
      '☕',
      'I feel most taken care of when you...',
      array[
        'bring me a drink before I ask',
        'quietly handle a thing so I don''t have to',
        'check in on me midday',
        'let me rant with zero fixing',
        'just sit close, no words'
      ],
      now()
    ),
    (
      v_drop_id,
      1,
      '🌧',
      'When I''m overwhelmed, what I really need is...',
      array[
        'space, alone, for a bit',
        'you near me, not fixing it',
        'to talk the whole thing out',
        'to be pulled out of my head',
        'to hear that we''re okay'
      ],
      now()
    ),
    (
      v_drop_id,
      2,
      '🔓',
      'Something I think but almost never say out loud...',
      array[
        'that I''m "too much"',
        'that I''m not enough',
        'where we''re actually headed',
        'a dream I haven''t told you',
        'how much I really need you'
      ],
      now()
    )
  on conflict do nothing;
end $$;

-- ============================================================================
-- 2. ensure_today_drop(p_couple uuid) -> uuid
--
-- Returns the couple_drop id for (p_couple, current_date).
-- If it doesn't exist, creates one referencing DROP 27.
-- SECURITY DEFINER: verifies caller is a member of p_couple.
-- ============================================================================

create or replace function public.ensure_today_drop(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_drop_id uuid;
  v_drop_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
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

  -- Try to fetch today's couple_drop for this couple
  select id into v_couple_drop_id
  from public.couple_drops
  where couple_id = p_couple
    and date = current_date;

  -- If it doesn't exist, create it
  if v_couple_drop_id is null then
    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, current_date, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;

grant execute on function public.ensure_today_drop(uuid) to authenticated;

-- ============================================================================
-- 3. sim_partner_submit(p_couple_drop uuid) -> void
--
-- SIM HELPER (for demo/testing): stands in for a real partner so the loop
-- is testable solo. In production, the real partner submits via the UI.
--
-- Actions:
--   1. Find the couple and its drop
--   2. If member_b IS NULL, create a demo partner profile (display_name 'Dani')
--      and set it as member_b; update couple status to 'active'
--   3. Insert deterministic answers for ALL prompts of the drop
--      (use prompt position to pick an option index)
--   4. Update couple_drops.state to 'revealed'
--   5. Idempotent on answers (ON CONFLICT)
--
-- SECURITY DEFINER: caller must be a member of the couple.
-- ============================================================================

create or replace function public.sim_partner_submit(p_couple_drop uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_drop_id uuid;
  v_partner_id uuid;
  v_prompt record;
  v_pick int;
  v_member_a uuid;
  v_member_b uuid;
  v_auth_user_id uuid;
begin
  -- Get couple_drop details
  select cd.couple_id, cd.drop_id into v_couple_id, v_drop_id
  from public.couple_drops cd
  where cd.id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  -- Get couple members
  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c
  where c.id = v_couple_id;

  -- Guard: caller must be a member of the couple
  if not exists (
    select 1
    from public.couples c
    where c.id = v_couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- If member_b is NULL, create demo partner
  if v_member_b is null then
    -- Create a demo auth user (note: in real scenario this is done via auth.users,
    -- but here we're in a SECURITY DEFINER function, so we directly insert)
    -- For testing: create a new UUID for the demo partner
    v_auth_user_id := gen_random_uuid();

    -- Insert demo profile
    insert into public.profiles (id, display_name)
    values (v_auth_user_id, 'Dani')
    on conflict do nothing;

    -- Update couple: set member_b and status='active'
    update public.couples
    set member_b = v_auth_user_id,
        status = 'active',
        together_since = current_date
    where id = v_couple_id;

    v_partner_id := v_auth_user_id;
  else
    -- member_b already exists
    v_partner_id := v_member_b;
  end if;

  -- Insert deterministic answers for all prompts of the drop
  -- Use prompt position to pick an option index (position % num_options)
  for v_prompt in
    select dp.id, dp.position, array_length(dp.options, 1) as num_options
    from public.drop_prompts dp
    where dp.drop_id = v_drop_id
    order by dp.position
  loop
    -- Deterministic pick: position -> option index
    -- For position 0, 1, 2: pick options 1, 4, 2 (a variety)
    v_pick := case
      when v_prompt.position = 0 then 1
      when v_prompt.position = 1 then 4
      when v_prompt.position = 2 then 2
      else (v_prompt.position % v_prompt.num_options)
    end;

    insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
    values (p_couple_drop, v_prompt.id, v_partner_id, v_pick, 0)
    on conflict (couple_drop_id, prompt_id, author) do update
    set pick = excluded.pick, hunch = excluded.hunch, created_at = now();
  end loop;

  -- Update couple_drops state to 'revealed'
  update public.couple_drops
  set state = 'revealed'
  where id = p_couple_drop;
end;
$$;

grant execute on function public.sim_partner_submit(uuid) to authenticated;
