-- repair_checkin_lifecycle_test.sql (0044)
-- Proves the full F2 lifecycle around 0040's table:
--   1. ensure_repair_checkin creates the due check-in 24h after a revealed
--      two-sided session (anchor = both-sides-in, not mediation time)
--   2. it is idempotent (same day folds via the unique key)
--   3. get_repair_checkin's reveal gate: pre-reveal a partner sees only
--      "partner_answered", never the verdict; post-reveal both see both
--   4. submit_repair_verdict routes each caller to their own column and
--      flips to 'revealed' when both are in; closed check-ins reject verdicts
--   5. deterministic role fallback (null session -> member_a owns initiator)
--   6. solo path: bridge_sent_at gates eligibility (mark_bridge_sent,
--      author-only), due 24h after the bridge was sent
--   7. sessions older than 7 days never resurrect a card
--
-- Hermetic: own UUIDs; transaction rolls back at the end.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(24);

  -- ---- SETUP (as superuser): 6 users, 3 couples -----------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d4d4d4d4-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'rcl-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 6) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('d4d4d4d4-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Rcl' || n
  from generate_series(1, 6) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, tz)
  values
    ('dcdcdcdc-0000-0000-0000-000000000001'::uuid,
     'd4d4d4d4-0000-0000-0000-000000000001'::uuid, 'd4d4d4d4-0000-0000-0000-000000000002'::uuid,
     'RCL-C1', 'active', '2024-01-01', 'Asia/Singapore'),
    ('dcdcdcdc-0000-0000-0000-000000000002'::uuid,
     'd4d4d4d4-0000-0000-0000-000000000003'::uuid, 'd4d4d4d4-0000-0000-0000-000000000004'::uuid,
     'RCL-C2', 'active', '2024-01-01', 'Asia/Singapore'),
    ('dcdcdcdc-0000-0000-0000-000000000003'::uuid,
     'd4d4d4d4-0000-0000-0000-000000000005'::uuid, 'd4d4d4d4-0000-0000-0000-000000000006'::uuid,
     'RCL-C3', 'active', '2024-01-01', 'Asia/Singapore');

  -- Couple 1: a two-sided session revealed, both sides in >24h ago.
  insert into public.refocus_sessions
    (id, couple_id, initiator, topic, initiator_side, partner_side, state,
     ai_result, created_at, partner_joined_at, revealed_at)
  values
    ('5e5e5e5e-0000-0000-0000-000000000001'::uuid,
     'dcdcdcdc-0000-0000-0000-000000000001'::uuid,
     'd4d4d4d4-0000-0000-0000-000000000001'::uuid,
     'the dishes thing', 'side a', 'side b', 'revealed',
     '{"type":"mediation"}'::jsonb,
     now() - interval '30 hours', now() - interval '26 hours', now() - interval '2 hours');

  -- Couple 3: a two-sided session revealed 8 days ago (stale).
  insert into public.refocus_sessions
    (id, couple_id, initiator, topic, initiator_side, partner_side, state,
     ai_result, created_at, partner_joined_at, revealed_at)
  values
    ('5e5e5e5e-0000-0000-0000-000000000003'::uuid,
     'dcdcdcdc-0000-0000-0000-000000000003'::uuid,
     'd4d4d4d4-0000-0000-0000-000000000005'::uuid,
     'old fight', 'side a', 'side b', 'revealed',
     '{"type":"mediation"}'::jsonb,
     now() - interval '9 days', now() - interval '8 days', now() - interval '8 days');

  -- ---- 1+2. ensure creates the due check-in, idempotently -------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select isnt(
    public.ensure_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid),
    null::uuid,
    'ensure creates a check-in for the due session'
  );

  select is(
    public.ensure_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid),
    null::uuid,
    'a second ensure folds into the existing day (idempotent)'
  );

  reset role;

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdcdcdc-0000-0000-0000-000000000001'::uuid),
    1,
    'exactly one check-in row exists for the couple'
  );

  select is(
    (select couple_local_date from public.repair_checkins
     where couple_id = 'dcdcdcdc-0000-0000-0000-000000000001'::uuid),
    ((now() - interval '26 hours') at time zone 'Asia/Singapore')::date,
    'the check-in is keyed to the day both sides were in (couple-local)'
  );

  -- ---- 3. projection + reveal gate ------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'state',
    'open',
    'initiator sees the open check-in'
  );

  -- 0046: open rows are raw-invisible to everyone — the app (and this test)
  -- addresses the check-in via the DEFINER projection's id
  select lives_ok(
    $q$select public.submit_repair_verdict(
      ((public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'id')::uuid,
      'yes')$q$,
    'initiator submits their verdict'
  );

  -- Partner's view pre-reveal: knows the other answered, never what.
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'partner_answered',
    'true',
    'partner sees that the other answered'
  );

  select is(
    (public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'their_verdict',
    null::text,
    'REVEAL GATE: the verdict never crosses the wire pre-reveal'
  );

  -- ---- 4. mutual answers -> revealed, both verdicts visible ------------------
  -- the partner addresses the check-in via the DEFINER projection (RLS
  -- hides the open row from them — that's the gate working)
  select lives_ok(
    $q$select public.submit_repair_verdict(
      ((public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'id')::uuid,
      'getting_there')$q$,
    'partner submits their verdict'
  );

  select is(
    (public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'state',
    'revealed',
    'both in -> revealed'
  );

  select is(
    (public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'their_verdict',
    'yes',
    'post-reveal the partner reads the initiator''s verdict'
  );

  select throws_ok(
    $q$select public.submit_repair_verdict(
      ((public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000001'::uuid))->>'id')::uuid,
      'yes')$q$,
    'repair_checkin_closed',
    'a revealed check-in rejects further verdicts'
  );

  reset role;

  -- ---- 5. deterministic role fallback (null session -> member_a) ------------
  insert into public.repair_checkins (id, couple_id, session_id, couple_local_date)
  values ('cccccccc-0000-0000-0000-000000000002'::uuid,
          'dcdcdcdc-0000-0000-0000-000000000002'::uuid, null, '2026-01-01');

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_repair_verdict('cccccccc-0000-0000-0000-000000000002'::uuid, 'yes')$q$,
    'member_a submits on a session-less check-in'
  );
  reset role;

  select is(
    (select initiator_verdict from public.repair_checkins
     where id = 'cccccccc-0000-0000-0000-000000000002'::uuid),
    'yes',
    'null-session fallback routes member_a to initiator_verdict (0040 fix)'
  );

  -- ---- 6. solo path: bridge gates eligibility --------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000005','role','authenticated')::text, true);

  -- couple 3's only other session is stale; solo first: save then bridge
  select lives_ok(
    $q$select public.save_solo_refocus(
      'dcdcdcdc-0000-0000-0000-000000000003'::uuid,
      'my quiet thing', 'i shut down when rushed', '{"underneath":"space"}'::jsonb)$q$,
    'author saves a solo reflection'
  );

  -- no bridge sent, and the two-sided session is stale -> nothing due
  select is(
    public.ensure_repair_checkin('dcdcdcdc-0000-0000-0000-000000000003'::uuid),
    null::uuid,
    'no check-in: solo bridge not sent, two-sided session >7 days old'
  );

  select lives_ok(
    $q$select public.mark_bridge_sent(
      (select id from public.refocus_sessions
       where couple_id = 'dcdcdcdc-0000-0000-0000-000000000003'::uuid and is_solo))$q$,
    'author marks the bridge sent'
  );

  -- bridge sent just now -> not due for 24h
  select is(
    public.ensure_repair_checkin('dcdcdcdc-0000-0000-0000-000000000003'::uuid),
    null::uuid,
    'a just-sent bridge is not due yet (24h)'
  );

  reset role;

  -- backdate the bridge, then the check-in becomes due
  update public.refocus_sessions
  set bridge_sent_at = now() - interval '25 hours'
  where couple_id = 'dcdcdcdc-0000-0000-0000-000000000003'::uuid and is_solo;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000005','role','authenticated')::text, true);

  select isnt(
    public.ensure_repair_checkin('dcdcdcdc-0000-0000-0000-000000000003'::uuid),
    null::uuid,
    'the solo check-in is created 24h after the bridge was sent'
  );

  -- the non-author partner cannot mark a bridge
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000006','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.mark_bridge_sent(
      (select rs.id from public.refocus_sessions rs
       where rs.couple_id = 'dcdcdcdc-0000-0000-0000-000000000003'::uuid and rs.is_solo))$q$,
    'refocus_session_not_found',
    'the non-author cannot even address the solo row (RLS hides it)'
  );
  reset role;

  -- ---- 8. RAW-ROW REVEAL GATE (0046): non-revealed rows are invisible --------
  -- Couple 2's check-in is 'open' with one verdict in; couple 3's is 'open'
  -- with none. Neither partner may raw-read either row — verdicts only cross
  -- the wire via get_repair_checkin until state='revealed'.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000004','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdcdcdc-0000-0000-0000-000000000002'::uuid),
    0,
    'RAW GATE: the partner reads 0 open rows (one verdict already in)'
  );

  reset role;

  -- 48h transform: force the reflection state; the one-sided verdict inside
  -- must stay invisible to raw reads from BOTH partners.
  update public.repair_checkins
  set state = 'reflection'
  where id = 'cccccccc-0000-0000-0000-000000000002'::uuid;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000004','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdcdcdc-0000-0000-0000-000000000002'::uuid),
    0,
    'RAW GATE: the non-answering partner reads 0 reflection rows (0046 fix)'
  );

  -- ...while the DEFINER projection still serves the answerer their reflection
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (public.get_repair_checkin('dcdcdcdc-0000-0000-0000-000000000002'::uuid))->>'reflection_mine',
    'true',
    'the answerer still gets their reflection via the projection'
  );

  -- and the mutually-revealed check-in (couple 1) stays raw-readable
  select set_config('request.jwt.claims', json_build_object('sub','d4d4d4d4-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.repair_checkins
     where couple_id = 'dcdcdcdc-0000-0000-0000-000000000001'::uuid
       and state = 'revealed'),
    1,
    'revealed rows stay readable for the growth stats'
  );

  reset role;

  select * from finish();
rollback;
