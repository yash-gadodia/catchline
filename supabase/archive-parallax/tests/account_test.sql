-- ============================================================================
-- ACCOUNT DELETION TEST
-- Proves delete_my_account() RPC:
--   1. The caller's profile is deleted.
--   2. The caller's answers are deleted.
--   3. The couple is dissolved (status='dissolved', caller's slot nulled).
--   4. The partner's profile is untouched.
--   5. Un-authenticated call raises an exception.
-- Hermetic: own uuids, rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(8);

  -- ---- SETUP (as superuser) -------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('da000001-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'da-alice@test.com', '', now(), now(), now()),
    ('da000001-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'da-bob@test.com',   '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('da000001-0000-0000-0000-000000000001'::uuid, 'DAAlice'),
    ('da000001-0000-0000-0000-000000000002'::uuid, 'DABob')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status)
  values ('da000002-0000-0000-0000-000000000001'::uuid,
          'da000001-0000-0000-0000-000000000001'::uuid,
          'da000001-0000-0000-0000-000000000002'::uuid,
          'DACCT-01', 'active');

  -- Insert a couple_drop so we can attach answers
  insert into public.drops (id, code)
  values ('da000003-0000-0000-0000-000000000001'::uuid, 'da-test-drop')
  on conflict do nothing;

  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('da000004-0000-0000-0000-000000000001'::uuid,
          'da000002-0000-0000-0000-000000000001'::uuid,
          'da000003-0000-0000-0000-000000000001'::uuid,
          current_date, 'open')
  on conflict do nothing;

  insert into public.drop_prompts (id, drop_id, position, options)
  values ('da000005-0000-0000-0000-000000000001'::uuid,
          'da000003-0000-0000-0000-000000000001'::uuid, 1, array['A','B'])
  on conflict do nothing;

  -- Alice has 1 answer; Bob has 1 answer
  insert into public.answers (id, couple_drop_id, prompt_id, author, pick, hunch)
  values
    ('da000006-0000-0000-0000-000000000001'::uuid,
     'da000004-0000-0000-0000-000000000001'::uuid,
     'da000005-0000-0000-0000-000000000001'::uuid,
     'da000001-0000-0000-0000-000000000001'::uuid, 1, 2),
    ('da000006-0000-0000-0000-000000000002'::uuid,
     'da000004-0000-0000-0000-000000000001'::uuid,
     'da000005-0000-0000-0000-000000000001'::uuid,
     'da000001-0000-0000-0000-000000000002'::uuid, 2, 1)
  on conflict do nothing;

  -- ---- UNAUTHENTICATED call raises exception ----------------------------------
  -- (no role switch = postgres superuser, but auth.uid() returns null)
  select throws_ok(
    $$ select public.delete_my_account() $$,
    'P0001',
    'Not authenticated',
    'delete_my_account() raises when called without a session'
  );

  -- ---- Call as Alice (member_a) ----------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub','da000001-0000-0000-0000-000000000001','role','authenticated')::text,
    true);

  select lives_ok(
    $$ select public.delete_my_account() $$,
    'delete_my_account() completes without error for authenticated user'
  );

  reset role;

  -- Alice's profile is gone
  select is(
    (select count(*)::int from public.profiles
     where id = 'da000001-0000-0000-0000-000000000001'::uuid),
    0,
    'Caller profile is deleted'
  );

  -- Alice's answer is gone
  select is(
    (select count(*)::int from public.answers
     where author = 'da000001-0000-0000-0000-000000000001'::uuid),
    0,
    'Caller answers are deleted'
  );

  -- Couple is dissolved
  select is(
    (select status from public.couples
     where id = 'da000002-0000-0000-0000-000000000001'::uuid),
    'dissolved',
    'Couple status is dissolved'
  );

  -- Alice's slot (member_a) is nulled
  select is(
    (select member_a from public.couples
     where id = 'da000002-0000-0000-0000-000000000001'::uuid),
    null::uuid,
    'Caller member_a slot is nulled'
  );

  -- Bob's profile still exists
  select is(
    (select count(*)::int from public.profiles
     where id = 'da000001-0000-0000-0000-000000000002'::uuid),
    1,
    'Partner profile is untouched'
  );

  -- REGRESSION GUARD (0010): with member_a now NULL, the surviving partner (Bob)
  -- can still submit and reach 'revealed' — the NULL slot counts as done, instead
  -- of poisoning the completion check and freezing the drop forever.
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub','da000001-0000-0000-0000-000000000002','role','authenticated')::text,
    true);
  select public.submit_answers(
    'da000004-0000-0000-0000-000000000001'::uuid,
    '[{"prompt_id":"da000005-0000-0000-0000-000000000001","pick":0,"hunch":1}]'::jsonb
  );
  reset role;

  select is(
    (select state from public.couple_drops
     where id = 'da000004-0000-0000-0000-000000000001'::uuid),
    'revealed',
    'Surviving partner reaches revealed after dissolution (NULL member treated as done)'
  );

  select * from finish();
rollback;
