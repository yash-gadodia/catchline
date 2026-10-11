-- refocus_solo_test.sql (0039 + 0043)
-- Proves:
--   1. save_solo_refocus atomically creates a revealed solo session with
--      ai_result + solo_saved_at set
--   2. a solo session is invisible to the partner entirely (RLS, 0 rows)
--   3. the author reads their own solo session
--   4. REGRESSION (0043): an existing solo session never blocks a two-sided
--      open — solo rows are born 'revealed', never in the open state
--   5. PRIVACY (0043): solo save writes nothing to the shared activity feed
--   6. a non-member cannot save a solo session
--   7. two-sided still guards one open session per couple
--
-- Hermetic: own UUIDs; transaction rolls back at the end.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(9);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d8d8d8d8-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'solo-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 3) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('d8d8d8d8-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Solo' || n
  from generate_series(1, 3) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('dbdbdbdb-0000-0000-0000-000000000001'::uuid,
          'd8d8d8d8-0000-0000-0000-000000000001'::uuid, 'd8d8d8d8-0000-0000-0000-000000000002'::uuid,
          'SOLO-C1', 'active', '2024-01-01');

  -- ---- 1. Partner A (01) saves a solo reflection atomically ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d8d8d8d8-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.save_solo_refocus(
      'dbdbdbdb-0000-0000-0000-000000000001'::uuid,
      'dishes',
      'I felt unheard',
      '{"underneath": "I need to feel seen"}'::jsonb
    )$q$,
    'partner A can save a solo reflection in one call'
  );

  reset role;

  select is(
    (select count(*)::int from public.refocus_sessions
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid
       and is_solo = true
       and state = 'revealed'
       and solo_saved_at is not null
       and ai_result = '{"underneath": "I need to feel seen"}'::jsonb),
    1,
    'solo session born revealed with ai_result + solo_saved_at set'
  );

  -- ---- 5. PRIVACY: no activity row for the solo save ----
  select is(
    (select count(*)::int from public.activity
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid
       and kind = 'refocus'),
    0,
    'solo save writes nothing to the shared activity feed'
  );

  -- ---- 2. RLS: Partner B (02) reads 0 rows ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d8d8d8d8-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.refocus_sessions
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid),
    0,
    'partner B cannot read partner A''s solo session (0 rows)'
  );

  -- ---- 4. REGRESSION: the solo row does NOT block a two-sided open ----
  select lives_ok(
    $q$select public.start_refocus(
      'dbdbdbdb-0000-0000-0000-000000000001'::uuid,
      'weekend plans',
      'I wanted more of a say'
    )$q$,
    'an existing solo session never blocks a two-sided open (0043 regression)'
  );

  -- ---- 7. two-sided one-open guard still holds ----
  select throws_ok(
    $q$select public.start_refocus(
      'dbdbdbdb-0000-0000-0000-000000000001'::uuid,
      'another topic',
      'my side again'
    )$q$,
    'refocus_session_already_open',
    'second two-sided open is still rejected'
  );

  reset role;

  -- ---- 3. author reads their own solo session (plus the shared one) ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d8d8d8d8-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.refocus_sessions
     where couple_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid
       and is_solo = true),
    1,
    'partner A (author) reads their solo session'
  );

  reset role;

  -- ---- 6. a non-member (03) cannot save a solo session ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d8d8d8d8-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.save_solo_refocus(
      'dbdbdbdb-0000-0000-0000-000000000001'::uuid,
      'sneaky',
      'not my couple',
      '{"x": 1}'::jsonb
    )$q$,
    'Unauthorized: not a member of this couple',
    'non-member cannot save a solo session'
  );

  reset role;

  -- empty ai_result is rejected
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d8d8d8d8-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.save_solo_refocus(
      'dbdbdbdb-0000-0000-0000-000000000001'::uuid,
      'dishes',
      'my side',
      null
    )$q$,
    'refocus_result_required',
    'a null ai_result is rejected'
  );

  reset role;

  select * from finish();
rollback;
