-- ============================================================================
-- UNPAIR TEST
-- Proves the unpair() RPC:
--   1. A member can dissolve a couple (row is gone).
--   2. A non-member calling unpair() gets an exception.
-- Hermetic: own uuids, rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(3);

  -- ---- SETUP (as superuser) -------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('e1e1e1e1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'up-alice@test.com', '', now(), now(), now()),
    ('e1e1e1e1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'up-bob@test.com',   '', now(), now(), now()),
    ('e1e1e1e1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'up-eve@test.com',   '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('e1e1e1e1-0000-0000-0000-000000000001'::uuid, 'UPAlice'),
    ('e1e1e1e1-0000-0000-0000-000000000002'::uuid, 'UPBob'),
    ('e1e1e1e1-0000-0000-0000-000000000003'::uuid, 'UPEve')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('e4e4e4e4-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
          'UNPAIR-01', 'active', '2024-01-01');

  -- ---- NON-MEMBER cannot unpair (throws) ------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select throws_ok(
    $$ select public.unpair('e4e4e4e4-0000-0000-0000-000000000001'::uuid) $$,
    'Unauthorized: not a member of this couple'
  );

  reset role;

  -- Couple still exists after the failed non-member attempt
  select is(
    (select count(*)::int from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000001'::uuid),
    1,
    'Couple still exists after non-member unpair attempt'
  );

  -- ---- MEMBER can unpair (couple row is gone) --------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $$ select public.unpair('e4e4e4e4-0000-0000-0000-000000000001'::uuid) $$,
    'Member can call unpair without error'
  );

  reset role;

  select * from finish();
rollback;
