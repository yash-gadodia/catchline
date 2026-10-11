-- ============================================================================
-- STREAK GRACE TEST (0021): catch-up + earned freezes + submit hardening.
--
-- Proves, with role impersonation:
--   1.  yesterday's drop is submittable (catch-up window open)
--   2.  get_today_state surfaces catch_up_available honestly
--   3.  completing it flags caught_up + scores wave at 80%
--   4.  the streak chain is repaired (pre-midnight, post-reset, freeze-refund)
--   5.  weekly freeze earn-back on the normal path
--   6.  reset_stale_streaks records the lapse it kills
--   7.  hardening: revealed drops and >1-day-old drops reject submits
--   8.  ensure_yesterday_drop creates/gates correctly (incl. pending hold)
--
-- Hermetic: own uuids; the whole file is one rolled-back transaction.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(25);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('c1c1c1c1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'grace-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 18) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('c1c1c1c1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Grace' || n
  from generate_series(1, 18) n
  on conflict (id) do update set display_name = excluded.display_name;

  -- Ad-hoc drop (no position: never enters rotation) with 2 prompts.
  insert into public.drops (id, code, title, theme)
  values ('c2c2c2c2-0000-0000-0000-000000000001'::uuid, 'grace-drop', 'Grace Drop', null);
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('c3c3c3c3-0000-0000-0000-000000000001'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, 0, '☕', 'Q1?', array['A','B','C']),
    ('c3c3c3c3-0000-0000-0000-000000000002'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, 1, '🌧', 'Q2?', array['A','B','C']);

  -- C1 alice(01)+bob(02): pre-midnight catch-up. streak 3, played day before
  -- yesterday, yesterday's drop open, no freezes.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000001'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'c1c1c1c1-0000-0000-0000-000000000002'::uuid,
          'GRACE-C1', 'active', '2024-01-01', 3,
          (now() at time zone 'Asia/Singapore')::date - 2, 0);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('c5c5c5c5-0000-0000-0000-000000000001'::uuid, 'c4c4c4c4-0000-0000-0000-000000000001'::uuid,
          'c2c2c2c2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 1, 'open');

  -- C2 (03+04): drop dated 2 days ago — window closed.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000002'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000003'::uuid, 'c1c1c1c1-0000-0000-0000-000000000004'::uuid,
          'GRACE-C2', 'active', '2024-01-01', 0, null, 0);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('c5c5c5c5-0000-0000-0000-000000000002'::uuid, 'c4c4c4c4-0000-0000-0000-000000000002'::uuid,
          'c2c2c2c2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 2, 'open');

  -- C3 (05+06): the midnight reset already lapsed a 5-streak today.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, lapsed_streak, lapsed_on)
  values ('c4c4c4c4-0000-0000-0000-000000000003'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000005'::uuid, 'c1c1c1c1-0000-0000-0000-000000000006'::uuid,
          'GRACE-C3', 'active', '2024-01-01', 0,
          (now() at time zone 'Asia/Singapore')::date - 2, 0, 5, (now() at time zone 'Asia/Singapore')::date);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('c5c5c5c5-0000-0000-0000-000000000003'::uuid, 'c4c4c4c4-0000-0000-0000-000000000003'::uuid,
          'c2c2c2c2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 1, 'open');

  -- C4 (07+08): a freeze bridged yesterday overnight (last_played = yesterday,
  -- drop still open). Catch-up should refund it.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000004'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000007'::uuid, 'c1c1c1c1-0000-0000-0000-000000000008'::uuid,
          'GRACE-C4', 'active', '2024-01-01', 9,
          (now() at time zone 'Asia/Singapore')::date - 1, 1);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('c5c5c5c5-0000-0000-0000-000000000004'::uuid, 'c4c4c4c4-0000-0000-0000-000000000004'::uuid,
          'c2c2c2c2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 1, 'open');

  -- C5 (09+10): normal path about to hit a week — streak 6, today's drop open.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000005'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000009'::uuid, 'c1c1c1c1-0000-0000-0000-000000000010'::uuid,
          'GRACE-C5', 'active', '2024-01-01', 6,
          (now() at time zone 'Asia/Singapore')::date - 1, 0);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('c5c5c5c5-0000-0000-0000-000000000005'::uuid, 'c4c4c4c4-0000-0000-0000-000000000005'::uuid,
          'c2c2c2c2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date, 'open');

  -- C6 (11+12): stale, no freezes — the reset should record the lapse.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000006'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000011'::uuid, 'c1c1c1c1-0000-0000-0000-000000000012'::uuid,
          'GRACE-C6', 'active', '2024-01-01', 4,
          (now() at time zone 'Asia/Singapore')::date - 2, 0);

  -- C7 (13+14): history but never opened yesterday — ensure_yesterday_drop
  -- must mint the row from the catalog.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000007'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000013'::uuid, 'c1c1c1c1-0000-0000-0000-000000000014'::uuid,
          'GRACE-C7', 'active', '2024-01-01', 0,
          (now() at time zone 'Asia/Singapore')::date - 3, 0);

  -- C8 (15): pending — catch-up held.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000008'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000015'::uuid, null,
          'GRACE-C8', 'pending', '2024-01-01', 0,
          (now() at time zone 'Asia/Singapore')::date - 3, 0);

  -- C9 (17+18): brand new — nothing to catch up.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000009'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000017'::uuid, 'c1c1c1c1-0000-0000-0000-000000000018'::uuid,
          'GRACE-C9', 'active', '2024-01-01', 0, null, 2);

  -- ---- C1: pre-midnight catch-up -------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (public.submit_answers('c5c5c5c5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb
    ))->>'new_state',
    'one_done',
    'catch-up: first submit on yesterday''s drop is accepted (one_done)'
  );

  select is(
    (public.get_today_state('c4c4c4c4-0000-0000-0000-000000000001'::uuid))->>'catch_up_available',
    'true',
    'get_today_state reports catch_up_available while yesterday is unfinished'
  );

  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (public.submit_answers('c5c5c5c5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb
    ))->>'caught_up',
    'true',
    'catch-up: completing yesterday reports caught_up'
  );

  reset role;

  select is(
    (select wave_pct from public.couple_drops where id = 'c5c5c5c5-0000-0000-0000-000000000001'::uuid),
    80,
    'catch-up wave is scored at 80% (perfect round: 100 -> 80)'
  );

  select is(
    (select caught_up from public.couple_drops where id = 'c5c5c5c5-0000-0000-0000-000000000001'::uuid),
    true,
    'catch-up rounds are flagged on couple_drops'
  );

  select is(
    (select streak from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid),
    4,
    'pre-midnight catch-up extends the live chain (3 -> 4)'
  );

  select is(
    (select last_played_on from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid),
    (now() at time zone 'Asia/Singapore')::date - 1,
    'catch-up marks yesterday as the last played day'
  );

  -- ---- hardening -------------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":1,"hunch":1}]'::jsonb)$q$,
    'this drop is already revealed',
    'revealed drops reject further submits (answers are immutable post-reveal)'
  );

  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000002'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0}]'::jsonb)$q$,
    'the catch-up window for this drop has closed',
    'drops older than yesterday reject submits'
  );

  -- ---- C3: catch-up restores a lapsed streak ---------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000003'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb)$q$,
    'lapsed couple: first member catch-up submit succeeds'
  );
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000006','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000003'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb)$q$,
    'lapsed couple: second member catch-up submit succeeds'
  );

  reset role;
  select is(
    (select streak from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000003'::uuid),
    6,
    'catch-up restores the streak the midnight reset killed (5 -> 6)'
  );
  select is(
    (select lapsed_on from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000003'::uuid),
    null,
    'the lapse record is cleared after restoration'
  );

  -- ---- C4: freeze refund ------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000007','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000004'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb)$q$,
    'freeze-bridged couple: first member catch-up submit succeeds'
  );
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000008','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000004'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb)$q$,
    'freeze-bridged couple: second member catch-up submit succeeds'
  );

  reset role;
  select is(
    (select freezes_remaining from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000004'::uuid),
    2,
    'catching up for real refunds the freeze the reset spent (1 -> 2)'
  );

  -- ---- C5: weekly freeze earn-back on the normal path ------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000009','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000005'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb)$q$,
    'week couple: first member submits today'
  );
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000010','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('c5c5c5c5-0000-0000-0000-000000000005'::uuid,
      '[{"prompt_id":"c3c3c3c3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"c3c3c3c3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb)$q$,
    'week couple: second member submits today'
  );

  reset role;
  select is(
    (select freezes_remaining from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000005'::uuid),
    1,
    'a full week of streak earns a freeze back (0 -> 1 at streak 7)'
  );

  -- ---- C6: the reset records what it kills ------------------------------------
  select is(public.reset_stale_streaks() >= 1, true, 'reset_stale_streaks resets at least the stale test couple');
  select is(
    (select (streak, lapsed_streak, lapsed_on) = (0, 4, (now() at time zone 'Asia/Singapore')::date)
     from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000006'::uuid),
    true,
    'the reset zeroes the streak but records lapsed_streak + lapsed_on'
  );

  -- ---- C7/C8: ensure_yesterday_drop -------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000013','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.ensure_yesterday_drop('c4c4c4c4-0000-0000-0000-000000000007'::uuid)$q$,
    'ensure_yesterday_drop mints a drop when yesterday was never opened'
  );
  -- Separate statement: the mint above is only visible to a fresh snapshot.
  select is(
    (select cd.date from public.couple_drops cd
     where cd.couple_id = 'c4c4c4c4-0000-0000-0000-000000000007'::uuid),
    (now() at time zone 'Asia/Singapore')::date - 1,
    'the minted drop is dated yesterday, from the catalog rotation'
  );

  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000015','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.ensure_yesterday_drop('c4c4c4c4-0000-0000-0000-000000000008'::uuid)$q$,
    'catch-up opens once you are paired',
    'pending couples cannot open the catch-up door'
  );

  -- ---- C9: nothing to catch up --------------------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000017','role','authenticated')::text, true);
  select is(
    (public.get_today_state('c4c4c4c4-0000-0000-0000-000000000009'::uuid))->>'catch_up_available',
    'false',
    'a brand-new couple is not offered a catch-up'
  );

  select * from finish();
rollback;
