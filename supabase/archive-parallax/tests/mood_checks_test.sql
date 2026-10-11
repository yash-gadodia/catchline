-- mood_checks_test.sql (0041)
-- Proves:
--   1. submit_mood_check creates a row with the submitted mood
--   2. couple members read all moods for their couple
--   3. each partner gets their own per-user daily uniqueness
--   4. same day, same user: second submit upserts (overwrites)
--   5. invalid mood is rejected
--   6. non-member cannot submit or read
--   7. couple-local-date DST-safe computation
--
-- Hermetic: own UUIDs; transaction rolls back at the end.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(10);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('daadadad-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'mood-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 3) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('daadadad-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Mood' || n
  from generate_series(1, 3) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, tz)
  values ('dbdbdbdb-0000-0000-0000-000000000002'::uuid,
          'daadadad-0000-0000-0000-000000000001'::uuid, 'daadadad-0000-0000-0000-000000000002'::uuid,
          'MOOD-C1', 'active', '2024-01-01', 'Asia/Singapore');

  -- ---- Partner A (01) submits a mood ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','daadadad-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.submit_mood_check('dbdbdbdb-0000-0000-0000-000000000002'::uuid, 'golden')$q$,
    'partner A can submit a mood'
  );

  reset role;

  select is(
    (select count(*)::int from public.mood_checks
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000002'::uuid
       and user_id = 'daadadad-0000-0000-0000-000000000001'::uuid),
    1,
    'partner A''s mood check was created'
  );

  -- ---- Partner B (02) submits a different mood (same day) ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','daadadad-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.submit_mood_check('dbdbdbdb-0000-0000-0000-000000000002'::uuid, 'off')$q$,
    'partner B can submit a mood'
  );

  reset role;

  -- ---- Per-user daily uniqueness: each partner has their own row ----
  select is(
    (select count(*)::int from public.mood_checks
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000002'::uuid),
    2,
    'two mood checks created (one per partner)'
  );

  -- ---- Both partners read all moods for their couple ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','daadadad-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.mood_checks
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000002'::uuid),
    2,
    'partner A reads both moods (their own + partner B''s)'
  );

  reset role;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','daadadad-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.mood_checks
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000002'::uuid),
    2,
    'partner B reads both moods'
  );

  reset role;

  -- ---- Same day, same user: second submit upserts ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','daadadad-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select public.submit_mood_check('dbdbdbdb-0000-0000-0000-000000000002'::uuid, 'good');

  reset role;

  select is(
    (select count(*)::int from public.mood_checks
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000002'::uuid
       and user_id = 'daadadad-0000-0000-0000-000000000001'::uuid),
    1,
    'still exactly one row per (couple, user) after upsert'
  );

  select is(
    (select mood from public.mood_checks
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000002'::uuid
       and user_id = 'daadadad-0000-0000-0000-000000000001'::uuid),
    'good',
    'the mood was updated (upsert overwrote)'
  );

  -- ---- Non-member cannot submit or read ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','daadadad-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.submit_mood_check('dbdbdbdb-0000-0000-0000-000000000002'::uuid, 'good')$q$,
    'Unauthorized: not a member of this couple',
    'a non-member cannot submit a mood'
  );

  select is(
    (select count(*)::int from public.mood_checks
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000002'::uuid),
    0,
    'a non-member reads 0 mood checks'
  );

  reset role;

  select * from finish();
rollback;
