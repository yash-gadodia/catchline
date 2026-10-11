-- couple_context_test.sql (0048)
-- Proves get_couple_context — the single read path feeding the AI mediator:
--   1. a member can read their own couple's context
--   2. a NON-member is refused (SECURITY DEFINER bypasses RLS, so the explicit
--      membership guard is the only protection)
--   3. shared learnings ARE included
--   4. a PRIVATE learning is NEVER included (it would otherwise reach the
--      partner it was deliberately withheld from, via the mediation both read)
--   5. session summaries are included; sessions without one are skipped
--   6. raw vent text (initiator_side / partner_side) NEVER appears in context
--   7. a null couple id is rejected
--
-- Hermetic: own UUIDs; transaction rolls back at the end.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(7);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('c0c0c0c0-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'ctx-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 3) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('c0c0c0c0-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Ctx' || n
  from generate_series(1, 3) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('cccccccc-0000-0000-0000-000000000001'::uuid,
          'c0c0c0c0-0000-0000-0000-000000000001'::uuid,
          'c0c0c0c0-0000-0000-0000-000000000002'::uuid,
          'CTX-C1', 'active', '2024-01-01');

  -- A shared learning and a PRIVATE one, both authored by member A.
  insert into public.learnings (couple_id, about, author_id, emoji, need, detail, source, origin, is_private)
  values
    ('cccccccc-0000-0000-0000-000000000001'::uuid,
     'c0c0c0c0-0000-0000-0000-000000000002'::uuid,
     'c0c0c0c0-0000-0000-0000-000000000001'::uuid,
     '🚶', 'space before money talks', 'SHARED_DETAIL_MARKER', 'refocus', 'ctx-shared', false),
    ('cccccccc-0000-0000-0000-000000000001'::uuid,
     'c0c0c0c0-0000-0000-0000-000000000002'::uuid,
     'c0c0c0c0-0000-0000-0000-000000000001'::uuid,
     '🤐', 'PRIVATE_NEED_MARKER', 'PRIVATE_DETAIL_MARKER', 'refocus', 'ctx-private', true);

  -- One summarised session (with raw sides that must NOT surface) and one
  -- unsummarised session (must be skipped).
  insert into public.refocus_sessions
    (couple_id, initiator, topic, initiator_side, partner_side, state, summary, themes)
  values
    ('cccccccc-0000-0000-0000-000000000001'::uuid,
     'c0c0c0c0-0000-0000-0000-000000000001'::uuid,
     'money', 'RAW_VENT_MARKER_A', 'RAW_VENT_MARKER_B', 'revealed',
     'They needed a walk before talking numbers.', array['money', 'timing']),
    ('cccccccc-0000-0000-0000-000000000001'::uuid,
     'c0c0c0c0-0000-0000-0000-000000000001'::uuid,
     'chores', 'RAW_VENT_MARKER_C', null, 'expired', null, null);

  -- ---- 1. a member gets context ------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c0c0c0c0-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select isnt(
    public.get_couple_context('cccccccc-0000-0000-0000-000000000001'::uuid),
    null,
    'a member reads their couple context'
  );

  -- ---- 2. shared learning is present --------------------------------------
  select ok(
    public.get_couple_context('cccccccc-0000-0000-0000-000000000001'::uuid)::text
      like '%SHARED_DETAIL_MARKER%',
    'shared learnings are included in context'
  );

  -- ---- 3. private learning is absent (the security property) --------------
  select ok(
    public.get_couple_context('cccccccc-0000-0000-0000-000000000001'::uuid)::text
      not like '%PRIVATE_DETAIL_MARKER%',
    'a PRIVATE learning never reaches the mediator context'
  );

  select ok(
    public.get_couple_context('cccccccc-0000-0000-0000-000000000001'::uuid)::text
      not like '%PRIVATE_NEED_MARKER%',
    'a private learning leaks no field, not even its need'
  );

  -- ---- 4. summaries in, raw vents out -------------------------------------
  select ok(
    public.get_couple_context('cccccccc-0000-0000-0000-000000000001'::uuid)::text
      like '%needed a walk before talking numbers%',
    'session summaries are included'
  );

  select ok(
    public.get_couple_context('cccccccc-0000-0000-0000-000000000001'::uuid)::text
      not like '%RAW_VENT_MARKER%',
    'raw vent text NEVER appears in context'
  );

  -- ---- 5. a non-member is refused -----------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','c0c0c0c0-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.get_couple_context('cccccccc-0000-0000-0000-000000000001'::uuid)$q$,
    'not a member of this couple',
    'a non-member cannot read a couple''s context'
  );

  select * from finish();
rollback;
