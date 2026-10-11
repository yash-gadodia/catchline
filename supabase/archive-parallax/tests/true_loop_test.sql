-- ============================================================================
-- TRUE LOOP TEST (0014): the real two-player loop, server-driven.
--
-- Proves, with role impersonation (auth.uid() = real members):
--   1. first submit  -> state 'one_done'
--   2. second submit -> state 'revealed', wave_pct stored (exact value),
--      couple streak incremented, last_played_on = couple-local today
--   3. resubmission is idempotent for the streak
--   4. get_today_state is truthful for each member and rejects non-members
--
-- Hermetic: own uuids; rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(13);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'tl-alice@test.com', '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'tl-bob@test.com', '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'tl-eve@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, 'TLAlice'),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, 'TLBob'),
    ('b1b1b1b1-0000-0000-0000-000000000003'::uuid, 'TLEve')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.drops (id, code, title, theme)
  values ('b2b2b2b2-0000-0000-0000-000000000001'::uuid, 'tl-drop', 'True Loop Drop', null);

  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('b3b3b3b3-0000-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid, 0, '☕', 'Q1?', array['A','B','C']),
    ('b3b3b3b3-0000-0000-0000-000000000002'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid, 1, '🌧', 'Q2?', array['A','B','C']);

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on)
  values ('b4b4b4b4-0000-0000-0000-000000000001'::uuid,
          'b1b1b1b1-0000-0000-0000-000000000001'::uuid,
          'b1b1b1b1-0000-0000-0000-000000000002'::uuid,
          'TRUELOOP-1', 'active', '2024-01-01', 0, null);

  -- couple_drop dated couple-local today (tz defaults to Asia/Singapore)
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('b5b5b5b5-0000-0000-0000-000000000001'::uuid,
          'b4b4b4b4-0000-0000-0000-000000000001'::uuid,
          'b2b2b2b2-0000-0000-0000-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date, 'open');

  -- ---- 1. Alice submits first ------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  -- Alice: Q1 pick 0 / hunch 1 · Q2 pick 0 / hunch 0
  select is(
    (public.submit_answers(
      'b5b5b5b5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":0,"hunch":1},
        {"prompt_id":"b3b3b3b3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb
    ))->>'new_state',
    'one_done',
    'first submit flips state to one_done'
  );

  -- get_today_state as Alice: i_answered true, partner_answered false
  select is(
    (public.get_today_state('b4b4b4b4-0000-0000-0000-000000000001'::uuid))->>'i_answered',
    'true',
    'get_today_state: Alice sees her own submit'
  );
  select is(
    (public.get_today_state('b4b4b4b4-0000-0000-0000-000000000001'::uuid))->>'partner_answered',
    'false',
    'get_today_state: partner honestly not answered yet'
  );

  reset role;

  -- Streak must NOT move on first submit
  select is(
    (select streak from public.couples where id = 'b4b4b4b4-0000-0000-0000-000000000001'::uuid),
    0,
    'streak unchanged after first submit'
  );

  -- ---- 2. Bob submits second — reveal + wave + streak -------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  -- Bob: Q1 pick 1 / hunch 0 · Q2 pick 1 / hunch 1
  -- Q1: Alice hunch 1 == Bob pick 1 HIT · Bob hunch 0 == Alice pick 0 HIT
  -- Q2: Alice hunch 0 <> Bob pick 1 MISS · Bob hunch 1 <> Alice pick 0 MISS
  -- wave = 2 hits / 4 = 50
  select is(
    (public.submit_answers(
      'b5b5b5b5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":1,"hunch":0},
        {"prompt_id":"b3b3b3b3-0000-0000-0000-000000000002","pick":1,"hunch":1}]'::jsonb
    ))->>'new_state',
    'revealed',
    'second submit flips state to revealed'
  );

  select is(
    (public.get_today_state('b4b4b4b4-0000-0000-0000-000000000001'::uuid))->>'wave_pct',
    '50',
    'get_today_state returns the stored wave_pct'
  );
  select is(
    (public.get_today_state('b4b4b4b4-0000-0000-0000-000000000001'::uuid))->>'partner_answered',
    'true',
    'get_today_state: Bob sees Alice answered'
  );

  reset role;

  select is(
    (select wave_pct from public.couple_drops where id = 'b5b5b5b5-0000-0000-0000-000000000001'::uuid),
    50,
    'wave_pct stored server-side on reveal (exactly 50)'
  );
  select is(
    (select streak from public.couples where id = 'b4b4b4b4-0000-0000-0000-000000000001'::uuid),
    1,
    'streak incremented to 1 by the revealing submit'
  );
  select is(
    (select last_played_on from public.couples where id = 'b4b4b4b4-0000-0000-0000-000000000001'::uuid),
    (now() at time zone 'Asia/Singapore')::date,
    'last_played_on = couple-local today'
  );

  -- ---- 3. Post-reveal immutability (0022 hardening supersedes the old
  -- resubmit-idempotency contract: answers can no longer be rewritten at all) --
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.submit_answers(
      'b5b5b5b5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":1,"hunch":0},
        {"prompt_id":"b3b3b3b3-0000-0000-0000-000000000002","pick":1,"hunch":1}]'::jsonb
    )$q$,
    'this drop is already revealed',
    'a revealed drop rejects resubmission outright'
  );
  reset role;

  select is(
    (select streak from public.couples where id = 'b4b4b4b4-0000-0000-0000-000000000001'::uuid),
    1,
    'the streak stays exactly 1 after the rejected resubmit'
  );

  -- ---- 4. Non-member rejected ---------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $$select public.get_today_state('b4b4b4b4-0000-0000-0000-000000000001'::uuid)$$,
    'Unauthorized: not a member of this couple',
    'get_today_state rejects a non-member'
  );
  reset role;

  select * from finish();
rollback;
