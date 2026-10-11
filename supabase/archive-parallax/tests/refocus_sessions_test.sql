-- ============================================================================
-- REFOCUS SESSIONS TEST (0020): the two-sided Refocus session model.
--
-- Proves, with role impersonation (auth.uid() = real members):
--   1. start_refocus guards membership + writes an exact waiting_partner row
--      and a 'refocus' activity with the topic in its payload
--   2. one open session per couple: a second start (by either member) is
--      rejected while a session is waiting_partner OR ready
--   3. add_refocus_side is only for the NON-initiator member: initiator and
--      non-members are rejected, empty input is rejected, the partner's add
--      flips state exactly waiting_partner -> ready
--   4. clients cannot write the table directly (no grants/policies)
--   5. the service role can write the reveal (ai_result + state='revealed'),
--      as the edge function does
--   6. expire_stale_refocus is service_role-only, expires exactly the
--      waiting_partner sessions older than 72h, and frees the couple to start
--      a fresh session
--   7. RLS read scoping: members read their couple's sessions, others read 0
--
-- Hermetic: own uuids; rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(31);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('d1d1d1d1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rfs-alice@test.com', '', now(), now(), now()),
    ('d1d1d1d1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rfs-bob@test.com', '', now(), now(), now()),
    ('d1d1d1d1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rfs-carol@test.com', '', now(), now(), now()),
    ('d1d1d1d1-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rfs-dave@test.com', '', now(), now(), now()),
    ('d1d1d1d1-0000-0000-0000-000000000005'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rfs-eve@test.com', '', now(), now(), now()),
    ('d1d1d1d1-0000-0000-0000-000000000006'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rfs-frank@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('d1d1d1d1-0000-0000-0000-000000000001'::uuid, 'RFSAlice'),
    ('d1d1d1d1-0000-0000-0000-000000000002'::uuid, 'RFSBob'),
    ('d1d1d1d1-0000-0000-0000-000000000003'::uuid, 'RFSCarol'),
    ('d1d1d1d1-0000-0000-0000-000000000004'::uuid, 'RFSDave'),
    ('d1d1d1d1-0000-0000-0000-000000000005'::uuid, 'RFSEve'),
    ('d1d1d1d1-0000-0000-0000-000000000006'::uuid, 'RFSFrank')
  on conflict (id) do update set display_name = excluded.display_name;

  -- couple 1: alice + bob · couple 2: carol + dave · couple 3: eve + frank
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values
    ('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'd1d1d1d1-0000-0000-0000-000000000001'::uuid, 'd1d1d1d1-0000-0000-0000-000000000002'::uuid, 'RFSTST-1', 'active', '2024-01-01'),
    ('d4d4d4d4-0000-0000-0000-000000000002'::uuid, 'd1d1d1d1-0000-0000-0000-000000000003'::uuid, 'd1d1d1d1-0000-0000-0000-000000000004'::uuid, 'RFSTST-2', 'active', '2024-01-01'),
    ('d4d4d4d4-0000-0000-0000-000000000003'::uuid, 'd1d1d1d1-0000-0000-0000-000000000005'::uuid, 'd1d1d1d1-0000-0000-0000-000000000006'::uuid, 'RFSTST-3', 'active', '2024-01-01');

  -- ---- 1. start_refocus: member opens a session ------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select ok(
    public.start_refocus('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'the dishes thing', 'i felt like i was carrying the mess alone this week') is not null,
    'start_refocus succeeds for a member and returns a session id'
  );

  reset role;

  select is(
    (select state from public.refocus_sessions where couple_id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid),
    'waiting_partner',
    'a new session starts in state waiting_partner'
  );
  select is(
    (select initiator from public.refocus_sessions where couple_id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid),
    'd1d1d1d1-0000-0000-0000-000000000001'::uuid,
    'the initiator is the caller (from auth.uid())'
  );
  select is(
    (select topic from public.refocus_sessions where couple_id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid),
    'the dishes thing',
    'the topic label is stored'
  );
  select is(
    (select count(*)::int from public.activity
      where couple_id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid and kind = 'refocus'),
    1,
    'start_refocus logs exactly one refocus activity'
  );
  select is(
    (select payload->>'topic' from public.activity
      where couple_id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid and kind = 'refocus'),
    'the dishes thing',
    'the refocus activity payload carries the topic'
  );

  -- ---- 2. one open session per couple ----------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select throws_ok(
    $$select public.start_refocus('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'another thing', 'more words')$$,
    'refocus_session_already_open',
    'the initiator cannot open a second session while one is waiting'
  );

  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select throws_ok(
    $$select public.start_refocus('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'another thing', 'more words')$$,
    'refocus_session_already_open',
    'the other member is also blocked (the rule is per couple)'
  );

  -- ---- 3. start_refocus rejects a non-member ----------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select throws_ok(
    $$select public.start_refocus('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'sneaky', 'not my couple')$$,
    'Unauthorized: not a member of this couple',
    'start_refocus rejects a non-member'
  );

  reset role;

  -- ---- 4. add_refocus_side guards (fixed-id session on couple 3) --------------
  insert into public.refocus_sessions (id, couple_id, initiator, topic, initiator_side)
  values ('d5d5d5d5-0000-0000-0000-000000000001'::uuid,
          'd4d4d4d4-0000-0000-0000-000000000003'::uuid,
          'd1d1d1d1-0000-0000-0000-000000000005'::uuid,
          'the weekend plans', 'i keep making the plans and it feels one-sided');

  set local role authenticated;

  -- non-member (dave, couple 2) rejected
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000004','role','authenticated')::text, true);
  select throws_ok(
    $$select public.add_refocus_side('d5d5d5d5-0000-0000-0000-000000000001'::uuid, 'my side')$$,
    'Unauthorized: not a member of this couple',
    'add_refocus_side rejects a non-member'
  );

  -- the initiator (eve) cannot add the partner side
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select throws_ok(
    $$select public.add_refocus_side('d5d5d5d5-0000-0000-0000-000000000001'::uuid, 'also my side')$$,
    'refocus_initiator_cannot_add_partner_side',
    'the initiator cannot add the partner side'
  );

  -- the partner (frank): empty input rejected, unknown session rejected, real add works
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000006','role','authenticated')::text, true);
  select throws_ok(
    $$select public.add_refocus_side('d5d5d5d5-0000-0000-0000-000000000001'::uuid, '   ')$$,
    'refocus_input_required',
    'a blank partner side is rejected'
  );
  select throws_ok(
    $$select public.add_refocus_side('d5d5d5d5-0000-0000-0000-0000000000ff'::uuid, 'my side')$$,
    'refocus_session_not_found',
    'an unknown session id is rejected'
  );
  select lives_ok(
    $$select public.add_refocus_side('d5d5d5d5-0000-0000-0000-000000000001'::uuid, 'i plan things because silence stresses me out')$$,
    'the non-initiator member adds their side'
  );

  reset role;

  select is(
    (select state from public.refocus_sessions where id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid),
    'ready',
    'adding the partner side flips state to ready'
  );
  select is(
    (select partner_side from public.refocus_sessions where id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid),
    'i plan things because silence stresses me out',
    'the partner side is stored'
  );
  select ok(
    (select partner_joined_at from public.refocus_sessions where id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid) is not null,
    'partner_joined_at is stamped'
  );

  -- ---- 5. state transitions are exact -----------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000006','role','authenticated')::text, true);
  select throws_ok(
    $$select public.add_refocus_side('d5d5d5d5-0000-0000-0000-000000000001'::uuid, 'twice')$$,
    'refocus_session_not_waiting',
    'a side cannot be added once the session is ready'
  );

  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select throws_ok(
    $$select public.start_refocus('d4d4d4d4-0000-0000-0000-000000000003'::uuid, 'next thing', 'words')$$,
    'refocus_session_already_open',
    'a ready session also blocks a new start (still open)'
  );

  -- ---- 6. RLS read scoping ------------------------------------------------------
  select is(
    (select count(*)::int from public.refocus_sessions where couple_id = 'd4d4d4d4-0000-0000-0000-000000000003'::uuid),
    1,
    'a member reads their couple''s session'
  );
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000004','role','authenticated')::text, true);
  select is(
    (select count(*)::int from public.refocus_sessions where couple_id = 'd4d4d4d4-0000-0000-0000-000000000003'::uuid),
    0,
    'a non-member reads 0 rows of another couple''s sessions'
  );

  -- ---- 7. clients cannot write the table directly --------------------------------
  select throws_ok(
    $$insert into public.refocus_sessions (couple_id, initiator, topic, initiator_side)
      values ('d4d4d4d4-0000-0000-0000-000000000002'::uuid, 'd1d1d1d1-0000-0000-0000-000000000004'::uuid, 'direct', 'insert')$$,
    '42501',
    'permission denied for table refocus_sessions',
    'a client cannot insert a session directly (no grant)'
  );
  select throws_ok(
    $$update public.refocus_sessions set state = 'revealed' where id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid$$,
    '42501',
    'permission denied for table refocus_sessions',
    'a client cannot update a session directly (no grant)'
  );

  -- ---- 8. the service role writes the reveal (edge function path) ----------------
  set local role service_role;
  select lives_ok(
    $$update public.refocus_sessions
      set ai_result = '{"type":"mediation","shared_ground":"you both care about the same weekend"}'::jsonb,
          state = 'revealed',
          revealed_at = now()
      where id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid and state = 'ready'$$,
    'the service role can write ai_result + state=revealed'
  );

  reset role;

  select is(
    (select state from public.refocus_sessions where id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid),
    'revealed',
    'the session is revealed after the service-role write'
  );
  select is(
    (select ai_result->>'type' from public.refocus_sessions where id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid),
    'mediation',
    'ai_result is stored on the session'
  );

  -- ---- 9. expire_stale_refocus ------------------------------------------------------
  -- a stale waiting session on couple 2 (carol), 73h old
  insert into public.refocus_sessions (id, couple_id, initiator, topic, initiator_side, created_at)
  values ('d5d5d5d5-0000-0000-0000-000000000002'::uuid,
          'd4d4d4d4-0000-0000-0000-000000000002'::uuid,
          'd1d1d1d1-0000-0000-0000-000000000003'::uuid,
          'the thing that fizzled', 'my side went unanswered', now() - interval '73 hours');

  -- clients cannot call it
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $$select public.expire_stale_refocus()$$,
    '42501',
    'permission denied for function expire_stale_refocus',
    'expire_stale_refocus is not executable by authenticated'
  );

  reset role;
  set local role service_role;
  select is(
    public.expire_stale_refocus(),
    1,
    'expire_stale_refocus expires exactly the one stale waiting session'
  );
  reset role;

  select is(
    (select state from public.refocus_sessions where id = 'd5d5d5d5-0000-0000-0000-000000000002'::uuid),
    'expired',
    'the >72h waiting session is expired'
  );
  select is(
    (select state from public.refocus_sessions where couple_id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid),
    'waiting_partner',
    'a fresh waiting session is NOT expired'
  );

  -- after expiry the couple can start fresh (expired does not count as open)
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select ok(
    public.start_refocus('d4d4d4d4-0000-0000-0000-000000000002'::uuid, 'round two', 'trying again with fresh words') is not null,
    'an expired session frees the couple to start fresh'
  );

  reset role;

  select * from finish();
rollback;
