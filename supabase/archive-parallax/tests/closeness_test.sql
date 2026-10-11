-- ============================================================================
-- CLOSENESS FEEDBACK TEST (0027): post-reveal "did this bring you closer?"
--
-- Proves, with role impersonation:
--   1. a member can record on a REVEALED drop; the value lands
--   2. tapping again upserts (overwrites, still one row)
--   3. a pre-reveal drop rejects the RPC
--   4. a non-member rejects the RPC
--   5. RLS: the PARTNER reads 0 rows of the author's feedback (privacy —
--      "not really" must never leak); the author reads their own
--
-- Hermetic: own uuids; the whole file is one rolled-back transaction.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(9);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'closeness-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 3) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Close' || n
  from generate_series(1, 3) n
  on conflict (id) do update set display_name = excluded.display_name;

  -- Ad-hoc drop (no position: never enters rotation) with 1 prompt.
  insert into public.drops (id, code, title, theme)
  values ('d8d8d8d8-0000-0000-0000-000000000001'::uuid, 'closeness-drop', 'Closeness Drop', null);
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values ('d9d9d9d9-0000-0000-0000-000000000001'::uuid, 'd8d8d8d8-0000-0000-0000-000000000001'::uuid, 0, '☕', 'Q1?', array['A','B','C']);

  -- Couple: author(01) + partner(02); user 03 is an outsider.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('dadadada-0000-0000-0000-000000000001'::uuid,
          'd7d7d7d7-0000-0000-0000-000000000001'::uuid, 'd7d7d7d7-0000-0000-0000-000000000002'::uuid,
          'CLOSE-C1', 'active', '2024-01-01');

  -- One revealed drop (feedback opens) + one still-open drop (feedback shut).
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values
    ('dbdbdbdb-0000-0000-0000-000000000001'::uuid, 'dadadada-0000-0000-0000-000000000001'::uuid,
     'd8d8d8d8-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 1, 'revealed'),
    ('dbdbdbdb-0000-0000-0000-000000000002'::uuid, 'dadadada-0000-0000-0000-000000000001'::uuid,
     'd8d8d8d8-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date, 'open');

  -- ---- author records on the revealed drop ----------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.record_closeness('dbdbdbdb-0000-0000-0000-000000000001'::uuid, true)$q$,
    'a member can record closeness on a revealed drop'
  );

  reset role;
  -- Separate statement: the write above is only visible to a fresh snapshot.
  select is(
    (select closer from public.closeness_feedback
     where couple_drop_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid
       and author = 'd7d7d7d7-0000-0000-0000-000000000001'::uuid),
    true,
    'the recorded signal lands as closer = true'
  );

  -- ---- tap again: upsert overwrites, still one row ---------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.record_closeness('dbdbdbdb-0000-0000-0000-000000000001'::uuid, false)$q$,
    're-recording on the same drop is accepted (upsert, not error)'
  );

  reset role;
  select is(
    (select closer from public.closeness_feedback
     where couple_drop_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid
       and author = 'd7d7d7d7-0000-0000-0000-000000000001'::uuid),
    false,
    'the upsert overwrote the signal to closer = false'
  );
  select is(
    (select count(*)::int from public.closeness_feedback
     where couple_drop_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid
       and author = 'd7d7d7d7-0000-0000-0000-000000000001'::uuid),
    1,
    'still exactly one row per (drop, author)'
  );

  -- ---- guards -----------------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.record_closeness('dbdbdbdb-0000-0000-0000-000000000002'::uuid, true)$q$,
    'closeness feedback opens at the reveal',
    'a pre-reveal drop rejects closeness feedback'
  );

  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.record_closeness('dbdbdbdb-0000-0000-0000-000000000001'::uuid, true)$q$,
    'Unauthorized: not a member of this couple',
    'a non-member cannot record closeness on the couple''s drop'
  );

  -- ---- RLS: the answer is the author's own signal ------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.closeness_feedback
     where couple_drop_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid),
    0,
    'the PARTNER reads 0 rows of the author''s feedback ("not really" never leaks)'
  );

  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.closeness_feedback
     where couple_drop_id = 'dbdbdbdb-0000-0000-0000-000000000001'::uuid),
    1,
    'the author reads their own feedback row'
  );

  select * from finish();
rollback;
