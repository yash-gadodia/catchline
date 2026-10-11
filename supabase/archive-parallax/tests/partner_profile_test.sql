-- ============================================================================
-- PARTNER PROFILE RLS TEST (proves the 0013 fix)
--
-- Switches into the `authenticated` role + sets request.jwt.claims so auth.uid()
-- returns a specific user, then asserts ACTUAL row counts each user can read
-- from public.profiles:
--   * a member CAN read their partner's profile on an ACTIVE couple (both ways)
--   * a non-member reads ZERO
--   * a member of a PENDING (not yet active) couple reads ZERO (status gate)
--
-- Hermetic: own uuids, rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(6);

  -- ---- SETUP (as superuser) -------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'pp-alice@test.com',   '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'pp-bob@test.com',     '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'pp-charlie@test.com', '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'pp-dana@test.com',    '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000005'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'pp-evan@test.com',    '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, 'PPAlice'),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, 'PPBob'),
    ('b1b1b1b1-0000-0000-0000-000000000003'::uuid, 'PPCharlie'),
    ('b1b1b1b1-0000-0000-0000-000000000004'::uuid, 'PPDana'),
    ('b1b1b1b1-0000-0000-0000-000000000005'::uuid, 'PPEvan')
  on conflict (id) do update set display_name = excluded.display_name;

  -- Active couple: Alice (a) + Bob (b). Pending couple: Dana (a) + Evan (b).
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values
    ('b4b4b4b4-0000-0000-0000-000000000001'::uuid,
     'b1b1b1b1-0000-0000-0000-000000000001'::uuid,
     'b1b1b1b1-0000-0000-0000-000000000002'::uuid, 'PP-ACTIVE-1', 'active', '2024-01-01'),
    ('b4b4b4b4-0000-0000-0000-000000000002'::uuid,
     'b1b1b1b1-0000-0000-0000-000000000004'::uuid,
     'b1b1b1b1-0000-0000-0000-000000000005'::uuid, 'PP-PENDING-1', 'pending', null);

  -- ---- AS ALICE (member_a of active couple) ---------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.profiles where id = 'b1b1b1b1-0000-0000-0000-000000000002'::uuid),
    1, 'member_a CAN read partner (member_b) profile on an active couple');

  select is(
    (select count(*)::int from public.profiles where id = 'b1b1b1b1-0000-0000-0000-000000000001'::uuid),
    1, 'member_a can read their OWN profile');

  -- ---- AS BOB (member_b of active couple) -----------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.profiles where id = 'b1b1b1b1-0000-0000-0000-000000000001'::uuid),
    1, 'member_b CAN read partner (member_a) profile on an active couple');

  -- ---- AS CHARLIE (non-member) ----------------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.profiles where id = 'b1b1b1b1-0000-0000-0000-000000000001'::uuid),
    0, 'non-member reads ZERO of a stranger profile (Alice)');

  select is(
    (select count(*)::int from public.profiles where id = 'b1b1b1b1-0000-0000-0000-000000000002'::uuid),
    0, 'non-member reads ZERO of a stranger profile (Bob)');

  -- ---- AS DANA (member of a PENDING couple) ---------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000004','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.profiles where id = 'b1b1b1b1-0000-0000-0000-000000000005'::uuid),
    0, 'member of a PENDING couple reads ZERO of the other (active-only gate)');

  select * from finish();
rollback;
