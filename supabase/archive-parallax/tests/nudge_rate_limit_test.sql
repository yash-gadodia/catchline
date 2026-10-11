-- ============================================================================
-- NUDGE RATE LIMIT TEST (0016): nudge_partner allows 1 nudge per couple per
-- couple-local day, rejecting extras with 'nudge_rate_limited'.
--
-- Proves, with role impersonation (auth.uid() = real members):
--   1. first nudge of the day succeeds and writes exactly one activity row
--   2. a second nudge the same day throws 'nudge_rate_limited'
--   3. the limit is per COUPLE — the other member is blocked too
--   4. day 2 (yesterday's nudge aged out) allows a nudge again
--   5. a non-member is rejected
--
-- Hermetic: own uuids; rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(7);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'nrl-alice@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'nrl-bob@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'nrl-eve@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'NRLAlice'),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, 'NRLBob'),
    ('c1c1c1c1-0000-0000-0000-000000000003'::uuid, 'NRLEve')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('c4c4c4c4-0000-0000-0000-000000000001'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000001'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000002'::uuid,
          'NUDGERL-1', 'active', '2024-01-01');

  -- ---- 1. First nudge of the day succeeds ------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select ok(
    public.nudge_partner('c4c4c4c4-0000-0000-0000-000000000001'::uuid) is not null,
    'first nudge of the day succeeds'
  );

  -- ---- 2. Second nudge same day, same member -> rejected ----------------------
  select throws_ok(
    $$select public.nudge_partner('c4c4c4c4-0000-0000-0000-000000000001'::uuid)$$,
    'nudge_rate_limited',
    'second nudge the same day is rejected with nudge_rate_limited'
  );

  -- ---- 3. Per-couple limit: the OTHER member is blocked too -------------------
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select throws_ok(
    $$select public.nudge_partner('c4c4c4c4-0000-0000-0000-000000000001'::uuid)$$,
    'nudge_rate_limited',
    'the partner is also blocked the same day (limit is per couple)'
  );

  reset role;

  -- Exactly one nudge activity row was written
  select is(
    (select count(*)::int from public.activity
      where couple_id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid and kind = 'nudge'),
    1,
    'exactly one nudge activity row exists after the rejections'
  );

  -- ---- 4. Day 2: age yesterday's nudge out -> allowed again -------------------
  update public.activity
  set created_at = created_at - interval '1 day'
  where couple_id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid and kind = 'nudge';

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select ok(
    public.nudge_partner('c4c4c4c4-0000-0000-0000-000000000001'::uuid) is not null,
    'a new couple-local day allows a nudge again'
  );

  -- ---- 5. Non-member rejected --------------------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $$select public.nudge_partner('c4c4c4c4-0000-0000-0000-000000000001'::uuid)$$,
    'Unauthorized: not a member of this couple',
    'nudge_partner rejects a non-member'
  );

  reset role;

  select is(
    (select count(*)::int from public.activity
      where couple_id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid and kind = 'nudge'),
    2,
    'two nudge activity rows total (day 1 + day 2)'
  );

  select * from finish();
rollback;
