-- repair_checkins_test.sql (0040)
-- Proves:
--   1. a check-in starts in state 'open' with no verdicts
--   2. initiator can see their own check-in while open
--   3. partner cannot read check-in until revealed
--   4. when both answer, state flips to 'revealed'
--   5. both read the check-in post-reveal
--   6. same-day second check-in folds into existing (unique constraint)
--   7. expire_stale_repair_checkins 48h transition (one-sided -> reflection)
--   8. expire_stale_repair_checkins 72h transition (terminal -> still_open)
--
-- Hermetic: own UUIDs; transaction rolls back at the end.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(11);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d9d9d9d9-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'repair-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 3) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('d9d9d9d9-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Repair' || n
  from generate_series(1, 3) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, tz)
  values ('dcdc0000-0000-0000-0000-000000000001'::uuid,
          'd9d9d9d9-0000-0000-0000-000000000001'::uuid, 'd9d9d9d9-0000-0000-0000-000000000002'::uuid,
          'REPAIR-C1', 'active', '2024-01-01', 'Asia/Singapore');

  insert into public.refocus_sessions (id, couple_id, initiator, topic, initiator_side, state)
  values ('dcdc1111-0000-0000-0000-000000000001'::uuid,
          'dcdc0000-0000-0000-0000-000000000001'::uuid,
          'd9d9d9d9-0000-0000-0000-000000000001'::uuid,
          'dishes',
          'I felt unheard',
          'revealed');

  -- ---- Insert a check-in manually (simulating app creation) ----
  insert into public.repair_checkins (
    id, couple_id, session_id, couple_local_date, state
  )
  values ('dcdc2222-0000-0000-0000-000000000001'::uuid,
          'dcdc0000-0000-0000-0000-000000000001'::uuid,
          'dcdc1111-0000-0000-0000-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date,
          'open');

  -- ---- 0046: open rows are raw-invisible to EVERYONE (projection-only) ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d9d9d9d9-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdc0000-0000-0000-0000-000000000001'::uuid),
    0,
    'initiator (01) raw-reads 0 open rows — the projection is the read path (0046)'
  );

  reset role;

  -- ---- Partner (02) cannot read while open ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d9d9d9d9-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdc0000-0000-0000-0000-000000000001'::uuid),
    0,
    'partner (02) cannot read open check-in (0 rows)'
  );

  reset role;

  -- ---- Initiator (01) submits verdict ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d9d9d9d9-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.submit_repair_verdict('dcdc2222-0000-0000-0000-000000000001'::uuid, 'yes')$q$,
    'initiator can submit verdict'
  );

  reset role;

  select is(
    (select initiator_verdict from public.repair_checkins
     where id = 'dcdc2222-0000-0000-0000-000000000001'::uuid),
    'yes',
    'initiator verdict recorded'
  );

  -- ---- State still 'open' (only one answered) ----
  select is(
    (select state from public.repair_checkins
     where id = 'dcdc2222-0000-0000-0000-000000000001'::uuid),
    'open',
    'state is still open (one verdict)'
  );

  -- ---- Partner (02) submits verdict ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d9d9d9d9-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.submit_repair_verdict('dcdc2222-0000-0000-0000-000000000001'::uuid, 'still_tender')$q$,
    'partner can submit verdict'
  );

  reset role;

  -- ---- State should flip to 'revealed' ----
  select is(
    (select state from public.repair_checkins
     where id = 'dcdc2222-0000-0000-0000-000000000001'::uuid),
    'revealed',
    'state flipped to revealed when both answered'
  );

  -- ---- Now both can read the check-in ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d9d9d9d9-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdc0000-0000-0000-0000-000000000001'::uuid),
    1,
    'partner (02) can now read the revealed check-in'
  );

  reset role;

  -- ---- Same-day second check-in folds into existing (unique constraint) ----
  insert into public.repair_checkins (
    id, couple_id, session_id, couple_local_date, state
  )
  values ('dcdc2222-0000-0000-0000-000000000002'::uuid,
          'dcdc0000-0000-0000-0000-000000000001'::uuid,
          'dcdc1111-0000-0000-0000-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date,
          'open')
  on conflict (couple_id, couple_local_date) do nothing;

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdc0000-0000-0000-0000-000000000001'::uuid),
    1,
    'same-day second insert was rejected (unique constraint)'
  );

  -- ---- Test cron transitions: 48h one-sided -> reflection ----
  insert into public.repair_checkins (
    id, couple_id, session_id, couple_local_date, state, created_at
  )
  values ('dcdc3333-0000-0000-0000-000000000001'::uuid,
          'dcdc0000-0000-0000-0000-000000000001'::uuid,
          'dcdc1111-0000-0000-0000-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date - 3,
          'open',
          now() - interval '48 hours' - interval '1 minute');

  update public.repair_checkins
  set initiator_verdict = 'yes'
  where id = 'dcdc3333-0000-0000-0000-000000000001'::uuid;

  select public.expire_stale_repair_checkins();

  select is(
    (select state from public.repair_checkins
     where id = 'dcdc3333-0000-0000-0000-000000000001'::uuid),
    'reflection',
    '48h one-sided transitioned to reflection'
  );

  -- ---- Test 72h terminal -> still_open ----
  insert into public.repair_checkins (
    id, couple_id, session_id, couple_local_date, state, created_at
  )
  values ('dcdc4444-0000-0000-0000-000000000001'::uuid,
          'dcdc0000-0000-0000-0000-000000000001'::uuid,
          'dcdc1111-0000-0000-0000-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date - 4,
          'open',
          now() - interval '72 hours' - interval '1 minute');

  select public.expire_stale_repair_checkins();

  select is(
    (select state from public.repair_checkins
     where id = 'dcdc4444-0000-0000-0000-000000000001'::uuid),
    'still_open',
    '72h open transitioned to still_open (terminal)'
  );

  select * from finish();
rollback;
