-- ============================================================================
-- GET_TODAY_STATE DROP CODE + TITLE TEST (0035)
-- Proves get_today_state returns the real drop code and title for honest
-- rotation display (F5), and that 0035 preserved the 0026 catch-up fields
-- (the clobber class that bit 0030).
-- Hermetic: own uuids, rolled back.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(5);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('f5000001-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'f5-alice@test.com', '', now(), now(), now()),
    ('f5000001-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'f5-bob@test.com',   '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('f5000001-0000-0000-0000-000000000001'::uuid, 'F5Alice'),
    ('f5000001-0000-0000-0000-000000000002'::uuid, 'F5Bob')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status)
  values ('f5000002-0000-0000-0000-000000000001'::uuid,
          'f5000001-0000-0000-0000-000000000001'::uuid,
          'f5000001-0000-0000-0000-000000000002'::uuid,
          'F5GTS-01', 'active');

  insert into public.drops (id, code, title, position, spice)
  values ('f5000003-0000-0000-0000-000000000001'::uuid, 'DROP 42', 'feeling safe', 15, 0)
  on conflict do nothing;

  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('f5000004-0000-0000-0000-000000000001'::uuid,
          'f5000002-0000-0000-0000-000000000001'::uuid,
          'f5000003-0000-0000-0000-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date, 'open')
  on conflict do nothing;

  insert into public.drop_prompts (id, drop_id, position, options)
  values ('f5000005-0000-0000-0000-000000000001'::uuid,
          'f5000003-0000-0000-0000-000000000001'::uuid, 0, array['A','B'])
  on conflict do nothing;

  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub','f5000001-0000-0000-0000-000000000001','role','authenticated')::text,
    true);

  select is(
    (select public.get_today_state('f5000002-0000-0000-0000-000000000001'::uuid)->>'drop_code'),
    'DROP 42',
    'get_today_state returns the real drop code'
  );

  select is(
    (select public.get_today_state('f5000002-0000-0000-0000-000000000001'::uuid)->>'drop_title'),
    'feeling safe',
    'get_today_state returns the real drop title'
  );

  select is(
    (select public.get_today_state('f5000002-0000-0000-0000-000000000001'::uuid)->>'exists'),
    'true',
    'get_today_state.exists remains true when couple_drop exists'
  );

  select ok(
    (select public.get_today_state('f5000002-0000-0000-0000-000000000001'::uuid)::jsonb ? 'catch_up_available'),
    '0035 preserved catch_up_available from 0026'
  );

  select ok(
    (select public.get_today_state('f5000002-0000-0000-0000-000000000001'::uuid)::jsonb ? 'yesterday_state'),
    '0035 preserved yesterday_state from 0026'
  );

  select * from finish();
rollback;
