-- ============================================================================
-- RLS ENFORCEMENT TEST (the real reveal-gate proof)
--
-- Unlike the policy-existence checks, this test switches into the `authenticated`
-- role and sets request.jwt.claims so auth.uid() returns a specific user, then
-- asserts the ACTUAL row counts each user can read. This is what proves the
-- privacy backbone: a pre-reveal partner and a non-member read ZERO answers.
--
-- Hermetic: own uuids, rolled back by the test harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(9);

  -- ---- SETUP (as superuser) -------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('a1a1a1a1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rls-alice@test.com', '', now(), now(), now()),
    ('a1a1a1a1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rls-bob@test.com', '', now(), now(), now()),
    ('a1a1a1a1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rls-charlie@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'RAlice'),
    ('a1a1a1a1-0000-0000-0000-000000000002'::uuid, 'RBob'),
    ('a1a1a1a1-0000-0000-0000-000000000003'::uuid, 'RCharlie')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.drops (id, code, title, theme)
  values ('a2a2a2a2-0000-0000-0000-000000000001'::uuid, 'rls-drop', 'RLS Drop', 'romantic');

  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('a3a3a3a3-0000-0000-0000-000000000001'::uuid, 'a2a2a2a2-0000-0000-0000-000000000001'::uuid, 1, '💕', 'Q1?', array['A','B']),
    ('a3a3a3a3-0000-0000-0000-000000000002'::uuid, 'a2a2a2a2-0000-0000-0000-000000000001'::uuid, 2, '💭', 'Q2?', array['A','B']);

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('a4a4a4a4-0000-0000-0000-000000000001'::uuid,
          'a1a1a1a1-0000-0000-0000-000000000001'::uuid,
          'a1a1a1a1-0000-0000-0000-000000000002'::uuid,
          'RLS-ENF-01', 'active', '2024-01-01');

  -- An OPEN drop (pre-reveal) and a REVEALED drop, both with Alice+Bob answers.
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values
    ('a5a5a5a5-0000-0000-0000-000000000001'::uuid, 'a4a4a4a4-0000-0000-0000-000000000001'::uuid, 'a2a2a2a2-0000-0000-0000-000000000001'::uuid, current_date, 'open'),
    ('a5a5a5a5-0000-0000-0000-000000000002'::uuid, 'a4a4a4a4-0000-0000-0000-000000000001'::uuid, 'a2a2a2a2-0000-0000-0000-000000000001'::uuid, current_date - 1, 'revealed');

  insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
  values
    -- open drop
    ('a5a5a5a5-0000-0000-0000-000000000001'::uuid, 'a3a3a3a3-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 0, 1),
    ('a5a5a5a5-0000-0000-0000-000000000001'::uuid, 'a3a3a3a3-0000-0000-0000-000000000002'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 1, 0),
    ('a5a5a5a5-0000-0000-0000-000000000001'::uuid, 'a3a3a3a3-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 1, 0),
    ('a5a5a5a5-0000-0000-0000-000000000001'::uuid, 'a3a3a3a3-0000-0000-0000-000000000002'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 0, 1),
    -- revealed drop
    ('a5a5a5a5-0000-0000-0000-000000000002'::uuid, 'a3a3a3a3-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000001'::uuid, 0, 1),
    ('a5a5a5a5-0000-0000-0000-000000000002'::uuid, 'a3a3a3a3-0000-0000-0000-000000000001'::uuid, 'a1a1a1a1-0000-0000-0000-000000000002'::uuid, 1, 0);

  -- ---- AS ALICE (member) ----------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','a1a1a1a1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.answers where couple_drop_id = 'a5a5a5a5-0000-0000-0000-000000000001'::uuid and author = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid),
    2, 'Alice reads her OWN answers in the open drop');

  select is(
    (select count(*)::int from public.answers where couple_drop_id = 'a5a5a5a5-0000-0000-0000-000000000001'::uuid and author = 'a1a1a1a1-0000-0000-0000-000000000002'::uuid),
    0, 'REVEAL GATE: Alice CANNOT read Bob''s answers before reveal (open)');

  select is(
    (select count(*)::int from public.answers where couple_drop_id = 'a5a5a5a5-0000-0000-0000-000000000002'::uuid and author = 'a1a1a1a1-0000-0000-0000-000000000002'::uuid),
    1, 'AFTER reveal: Alice CAN read Bob''s answers (revealed)');

  select is(
    (select count(*)::int from public.couple_drops where id = 'a5a5a5a5-0000-0000-0000-000000000001'::uuid),
    1, 'Alice can see her couple_drop');

  reset role;

  -- ---- AS BOB (member) ------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','a1a1a1a1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.answers where couple_drop_id = 'a5a5a5a5-0000-0000-0000-000000000001'::uuid and author = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid),
    0, 'REVEAL GATE: Bob CANNOT read Alice''s answers before reveal (open)');

  select is(
    (select count(*)::int from public.answers where couple_drop_id = 'a5a5a5a5-0000-0000-0000-000000000002'::uuid and author = 'a1a1a1a1-0000-0000-0000-000000000001'::uuid),
    1, 'AFTER reveal: Bob CAN read Alice''s answers (revealed)');

  reset role;

  -- ---- AS CHARLIE (non-member) ----------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','a1a1a1a1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.answers where couple_drop_id in ('a5a5a5a5-0000-0000-0000-000000000001'::uuid, 'a5a5a5a5-0000-0000-0000-000000000002'::uuid)),
    0, 'Non-member Charlie reads ZERO answers (open or revealed)');

  select is(
    (select count(*)::int from public.couple_drops where couple_id = 'a4a4a4a4-0000-0000-0000-000000000001'::uuid),
    0, 'Non-member Charlie reads ZERO couple_drops');

  select is(
    (select count(*)::int from public.couples where id = 'a4a4a4a4-0000-0000-0000-000000000001'::uuid),
    0, 'Non-member Charlie cannot see the couple');

  reset role;

  select * from finish();
rollback;
