-- learnings_privacy_test.sql (0038)
-- Proves:
--   1. a couple-visible learning is readable by both partners
--   2. a private learning is visible only to author, not partner
--   3. a non-member reads 0 rows
--   4. add_learning stamps author_id automatically
--   5. add_private_learning creates is_private=true, author_id=caller
--   6. RLS author-OR-couple-visible enforcement
--
-- Hermetic: own UUIDs; transaction rolls back at the end.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(8);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'privacy-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 3) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Privacy' || n
  from generate_series(1, 3) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('dadadada-0000-0000-0000-000000000001'::uuid,
          'd7d7d7d7-0000-0000-0000-000000000001'::uuid, 'd7d7d7d7-0000-0000-0000-000000000002'::uuid,
          'PRIV-C1', 'active', '2024-01-01');

  -- ---- Partner A (01) adds a COUPLE-VISIBLE learning about partner B (02) ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.add_learning(
      'dadadada-0000-0000-0000-000000000001'::uuid,
      'd7d7d7d7-0000-0000-0000-000000000002'::uuid,
      '💭', 'perfectionist', 'gets anxious when plans change',
      'refocus', 'session-123'
    )$q$,
    'partner A can add a couple-visible learning'
  );

  reset role;

  -- Verify it was stored with author_id.
  select is(
    (select count(*)::int from public.learnings
     where couple_id = 'dadadada-0000-0000-0000-000000000001'::uuid
       and about = 'd7d7d7d7-0000-0000-0000-000000000002'::uuid
       and is_private = false
       and author_id = 'd7d7d7d7-0000-0000-0000-000000000001'::uuid),
    1,
    'the learning was stored with author_id and is_private=false'
  );

  -- ---- Partner A (01) adds a PRIVATE learning (solo reflection) ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.add_private_learning(
      'dadadada-0000-0000-0000-000000000001'::uuid,
      'I was selfish that day'
    )$q$,
    'partner A can add a private learning'
  );

  reset role;

  select is(
    (select count(*)::int from public.learnings
     where couple_id = 'dadadada-0000-0000-0000-000000000001'::uuid
       and is_private = true
       and author_id = 'd7d7d7d7-0000-0000-0000-000000000001'::uuid),
    1,
    'the private learning was stored with is_private=true'
  );

  -- ---- RLS: Partner A (01) reads both of their learnings ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.learnings
     where couple_id = 'dadadada-0000-0000-0000-000000000001'::uuid),
    2,
    'partner A (author) reads both the couple-visible and private learnings'
  );

  reset role;

  -- ---- RLS: Partner B (02) reads only the couple-visible learning ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.learnings
     where couple_id = 'dadadada-0000-0000-0000-000000000001'::uuid),
    1,
    'partner B reads only the couple-visible learning (0 private rows)'
  );

  select is(
    (select is_private from public.learnings
     where couple_id = 'dadadada-0000-0000-0000-000000000001'::uuid
       limit 1),
    false,
    'the readable learning is marked is_private=false'
  );

  reset role;

  -- ---- RLS: Non-member (03) reads 0 rows ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d7d7d7d7-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.learnings
     where couple_id = 'dadadada-0000-0000-0000-000000000001'::uuid),
    0,
    'a non-member reads 0 learnings'
  );

  reset role;

  select * from finish();
rollback;
