-- feature_flags_test.sql (0042)
-- Proves:
--   1. all five V2 flags exist and ship OFF
--   2. authenticated users can read flag state
--   3. authenticated users cannot flip a flag (no insert/update/delete)
--   4. anon reads 0 rows (no grant)
--
-- Hermetic where it matters: asserts only the seeded V2 flag keys, never a
-- global count. Transaction rolls back at the end.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(8);

  -- ---- 1. the five flags exist, all OFF -------------------------------------
  select is(
    (select count(*)::int from public.feature_flags
     where key in ('f1_mood_check','f1_partner_notify','f2_repair_checkin','f3_weave','f5_growth_counter')),
    5,
    'all five V2 flags are seeded'
  );

  select is(
    (select count(*)::int from public.feature_flags
     where key in ('f1_mood_check','f1_partner_notify','f2_repair_checkin','f3_weave','f5_growth_counter')
       and enabled),
    0,
    'every V2 flag ships OFF'
  );

  -- ---- 2. authenticated can read --------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('faf1faf1-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
          'flags-1@test.com', '', now(), now(), now())
  on conflict do nothing;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','faf1faf1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.feature_flags
     where key in ('f1_mood_check','f1_partner_notify','f2_repair_checkin','f3_weave','f5_growth_counter')),
    5,
    'authenticated user reads all five flags'
  );

  select is(
    (select enabled from public.feature_flags where key = 'f1_mood_check'),
    false,
    'authenticated user sees f1_mood_check OFF'
  );

  -- ---- 3. authenticated cannot write ----------------------------------------
  select throws_ok(
    $q$update public.feature_flags set enabled = true where key = 'f1_mood_check'$q$,
    '42501',
    'permission denied for table feature_flags',
    'authenticated cannot flip a flag'
  );

  select throws_ok(
    $q$insert into public.feature_flags (key, enabled) values ('rogue_flag', true)$q$,
    '42501',
    'permission denied for table feature_flags',
    'authenticated cannot insert a flag'
  );

  select throws_ok(
    $q$delete from public.feature_flags where key = 'f1_mood_check'$q$,
    '42501',
    'permission denied for table feature_flags',
    'authenticated cannot delete a flag'
  );

  reset role;

  -- ---- 4. anon reads nothing -------------------------------------------------
  set local role anon;
  select throws_ok(
    $q$select count(*) from public.feature_flags$q$,
    '42501',
    'permission denied for table feature_flags',
    'anon has no read grant on feature_flags'
  );
  reset role;

  select * from finish();
rollback;
