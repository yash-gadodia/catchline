-- ============================================================================
-- STREAK GRACE FIXES TEST (0026): the four adversarial-review fixes.
--
-- Proves, with role impersonation:
--   1. a fresh-start play preserves the lapse record (streak resets to 1,
--      lapsed_* intact) — paid repair + catch-up still possible after it
--   2. play-today-then-catch-up-yesterday restores lapsed + 2
--   3. repair_streak folds in a rebuilt fresh chain (lapsed + streak when
--      last played today/yesterday); 7-day window + 30-day ledger still hold
--   4. catch_up_available: true when yesterday has no row but the couple has
--      history (freeze-bridged, played-today); false for a brand-new couple
--   5. an exhausted pack override is NOT consumed and a generic drop mints
--   6. a yesterday (catch-up) mint ignores the override; it survives for
--      today's mint, which consumes it
--   7. send_pack rejects a theme with nothing unplayed/spice-eligible left
--
-- Hermetic: own uuids; the whole file is one rolled-back transaction.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(28);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('e1e1e1e1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'fix-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 20) n
  on conflict do nothing;

  insert into public.profiles (id, display_name, spice_level)
  select ('e1e1e1e1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Fix' || n,
         case when n in (19, 20) then 'sweet' else null end
  from generate_series(1, 20) n
  on conflict (id) do update set display_name = excluded.display_name, spice_level = excluded.spice_level;

  -- Ad-hoc drops (no position: never enter rotation), 1 prompt each.
  insert into public.drops (id, code, title, theme)
  values
    ('e2e2e2e2-0000-0000-0000-000000000001'::uuid, 'fix-today', 'Fix Today', null),
    ('e2e2e2e2-0000-0000-0000-000000000002'::uuid, 'fix-yday',  'Fix Yday',  null);
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('e3e3e3e3-0000-0000-0000-000000000001'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, 0, '☕', 'Q1?', array['A','B']),
    ('e3e3e3e3-0000-0000-0000-000000000002'::uuid, 'e2e2e2e2-0000-0000-0000-000000000002'::uuid, 0, '🌧', 'Q2?', array['A','B']);

  -- Probe catalog drops past the real catalog. Unique zfix-* themes so no
  -- real catalog drop can satisfy them.
  insert into public.drops (id, code, title, theme, position, spice)
  values
    ('e2e2e2e2-0000-0000-0000-000000000011'::uuid, 'fix-ex',   'Fix Exhausted', 'zfix-ex',   9501, 0),
    ('e2e2e2e2-0000-0000-0000-000000000012'::uuid, 'fix-gen',  'Fix Generic',   'zfix-gen',  9502, 0),
    ('e2e2e2e2-0000-0000-0000-000000000013'::uuid, 'fix-gen2', 'Fix Generic 2', 'zfix-gen2', 9601, 0),
    ('e2e2e2e2-0000-0000-0000-000000000014'::uuid, 'fix-pk',   'Fix Pack',      'zfix-pk',   9602, 0),
    ('e2e2e2e2-0000-0000-0000-000000000015'::uuid, 'fix-solo', 'Fix Solo',      'zfix-solo', 9701, 0),
    ('e2e2e2e2-0000-0000-0000-000000000016'::uuid, 'fix-hot',  'Fix Hot',       'zfix-hot',  9702, 2),
    ('e2e2e2e2-0000-0000-0000-000000000017'::uuid, 'fix-ok',   'Fix Ok',        'zfix-ok',   9703, 0);

  -- F1 (01+02): lapsed 5 today (post-reset), last played 3 days ago. Today's
  -- and yesterday's drops both open — the play-today-then-catch-up ordering.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, lapsed_streak, lapsed_on)
  values ('e4e4e4e4-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000001'::uuid, 'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
          'FIX-F1', 'active', '2024-01-01', 0,
          (now() at time zone 'Asia/Singapore')::date - 3, 0, 5, (now() at time zone 'Asia/Singapore')::date);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values
    ('e5e5e5e5-0000-0000-0000-000000000001'::uuid, 'e4e4e4e4-0000-0000-0000-000000000001'::uuid,
     'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date, 'open'),
    ('e5e5e5e5-0000-0000-0000-000000000002'::uuid, 'e4e4e4e4-0000-0000-0000-000000000001'::uuid,
     'e2e2e2e2-0000-0000-0000-000000000002'::uuid, (now() at time zone 'Asia/Singapore')::date - 1, 'open');

  -- F2 (03+04): lapsed 10 two days ago, then rebuilt a 2-day fresh chain
  -- (played yesterday + today). Never repaired.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, lapsed_streak, lapsed_on)
  values ('e4e4e4e4-0000-0000-0000-000000000002'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000003'::uuid, 'e1e1e1e1-0000-0000-0000-000000000004'::uuid,
          'FIX-F2', 'active', '2024-01-01', 2,
          (now() at time zone 'Asia/Singapore')::date, 0, 10, (now() at time zone 'Asia/Singapore')::date - 2);

  -- F3 (05+06): lapsed 8 days ago — outside the 7-day window.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, lapsed_streak, lapsed_on)
  values ('e4e4e4e4-0000-0000-0000-000000000003'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000005'::uuid, 'e1e1e1e1-0000-0000-0000-000000000006'::uuid,
          'FIX-F3', 'active', '2024-01-01', 0,
          (now() at time zone 'Asia/Singapore')::date - 9, 0, 4, (now() at time zone 'Asia/Singapore')::date - 8);

  -- F4 (07+08): repairable lapse but repaired 10 days ago — ledger blocks.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, lapsed_streak, lapsed_on, last_repair_on)
  values ('e4e4e4e4-0000-0000-0000-000000000004'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000007'::uuid, 'e1e1e1e1-0000-0000-0000-000000000008'::uuid,
          'FIX-F4', 'active', '2024-01-01', 0,
          (now() at time zone 'Asia/Singapore')::date - 2, 0, 4, (now() at time zone 'Asia/Singapore')::date - 1,
          (now() at time zone 'Asia/Singapore')::date - 10);

  -- F5 (09+10): freeze bridged yesterday (last_played = yesterday, NO row).
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('e4e4e4e4-0000-0000-0000-000000000005'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000009'::uuid, 'e1e1e1e1-0000-0000-0000-000000000010'::uuid,
          'FIX-F5', 'active', '2024-01-01', 5,
          (now() at time zone 'Asia/Singapore')::date - 1, 1);

  -- F6 (11+12): already played today, yesterday never minted.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('e4e4e4e4-0000-0000-0000-000000000006'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000011'::uuid, 'e1e1e1e1-0000-0000-0000-000000000012'::uuid,
          'FIX-F6', 'active', '2024-01-01', 1,
          (now() at time zone 'Asia/Singapore')::date, 0);

  -- F7 (13+14): brand new — no history at all.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('e4e4e4e4-0000-0000-0000-000000000007'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000013'::uuid, 'e1e1e1e1-0000-0000-0000-000000000014'::uuid,
          'FIX-F7', 'active', '2024-01-01', 0, null, 2);

  -- F8 (15+16): override set to a theme the couple has fully played.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, pack_override)
  values ('e4e4e4e4-0000-0000-0000-000000000008'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000015'::uuid, 'e1e1e1e1-0000-0000-0000-000000000016'::uuid,
          'FIX-F8', 'active', '2024-01-01', 0, null, 0, 'zfix-ex');
  -- Every catalog drop below the probes played long ago, plus the only
  -- zfix-ex drop — the override theme is exhausted for F8.
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'e4e4e4e4-0000-0000-0000-000000000008'::uuid, d.id,
         '2020-01-01'::date - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d
  where d.position is not null and d.position < 9501;
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('e4e4e4e4-0000-0000-0000-000000000008'::uuid,
          'e2e2e2e2-0000-0000-0000-000000000011'::uuid, '2020-06-01'::date, 'revealed');

  -- F9 (17+18): override set to a theme with an UNPLAYED drop; the couple
  -- has played everything below the 9601/9602 probes.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, pack_override)
  values ('e4e4e4e4-0000-0000-0000-000000000009'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000017'::uuid, 'e1e1e1e1-0000-0000-0000-000000000018'::uuid,
          'FIX-F9', 'active', '2024-01-01', 0, null, 0, 'zfix-pk');
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'e4e4e4e4-0000-0000-0000-000000000009'::uuid, d.id,
         '2020-01-01'::date - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d
  where d.position is not null and d.position < 9601;

  -- F10 (19+20, both sweet): played the only zfix-solo drop; zfix-hot is
  -- spice 2 (out of their range); zfix-ok is open.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('e4e4e4e4-0000-0000-0000-000000000010'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000019'::uuid, 'e1e1e1e1-0000-0000-0000-000000000020'::uuid,
          'FIX-F10', 'active', '2024-01-01', 0, null, 0);
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('e4e4e4e4-0000-0000-0000-000000000010'::uuid,
          'e2e2e2e2-0000-0000-0000-000000000015'::uuid, '2020-06-02'::date, 'revealed');

  -- ---- F1 part 1: a fresh-start play preserves the lapse -----------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('e5e5e5e5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"e3e3e3e3-0000-0000-0000-000000000001","pick":0,"hunch":0}]'::jsonb)$q$,
    'lapsed couple: first member plays today'
  );
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select is(
    (public.submit_answers('e5e5e5e5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"e3e3e3e3-0000-0000-0000-000000000001","pick":0,"hunch":0}]'::jsonb
    ))->>'new_state',
    'revealed',
    'lapsed couple: second member completes today (reveal)'
  );

  reset role;
  select is(
    (select streak from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000001'::uuid),
    1,
    'a fresh-start play resets the streak to 1'
  );
  select is(
    (select lapsed_streak = 5 and lapsed_on = (now() at time zone 'Asia/Singapore')::date
     from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000001'::uuid),
    true,
    'the lapse record SURVIVES a fresh-start play (repair still possible)'
  );

  -- ---- F1 part 2: play today, then catch up yesterday => lapsed + 2 ------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.submit_answers('e5e5e5e5-0000-0000-0000-000000000002'::uuid,
      '[{"prompt_id":"e3e3e3e3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb)$q$,
    'lapsed couple: first member catches up yesterday after playing today'
  );
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select is(
    (public.submit_answers('e5e5e5e5-0000-0000-0000-000000000002'::uuid,
      '[{"prompt_id":"e3e3e3e3-0000-0000-0000-000000000002","pick":0,"hunch":0}]'::jsonb
    ))->>'caught_up',
    'true',
    'lapsed couple: second member completes the catch-up'
  );

  reset role;
  select is(
    (select streak from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000001'::uuid),
    7,
    'play-today-then-catch-up restores lapsed + 2 (5 + yesterday + today = 7)'
  );
  select is(
    (select lapsed_streak is null and lapsed_on is null
     from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000001'::uuid),
    true,
    'the lapse record is cleared once the chain is restored'
  );

  -- ---- F2: paid repair folds in a rebuilt 2-day fresh chain --------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.repair_streak('e4e4e4e4-0000-0000-0000-000000000002'::uuid)$q$,
    'a member repairs after rebuilding a 2-day fresh chain'
  );

  reset role;
  select is(
    (select streak = 12
        and lapsed_streak is null
        and lapsed_on is null
        and last_repair_on = (now() at time zone 'Asia/Singapore')::date
     from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000002'::uuid),
    true,
    'repair yields lapsed + live chain (10 + 2 = 12), clears the lapse, stamps the ledger'
  );

  -- ---- F3/F4: window + ledger still enforced ------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.repair_streak('e4e4e4e4-0000-0000-0000-000000000003'::uuid)$q$,
    'nothing repairable — no streak lapsed in the last 7 days',
    'a lapse older than 7 days is not repairable'
  );
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000007','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.repair_streak('e4e4e4e4-0000-0000-0000-000000000004'::uuid)$q$,
    'streak repair is available once every 30 days',
    'the 30-day repair ledger still blocks a second repair'
  );

  -- ---- F5/F6/F7: catch_up_available without a yesterday row ----------------------
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000009','role','authenticated')::text, true);
  select is(
    (public.get_today_state('e4e4e4e4-0000-0000-0000-000000000005'::uuid))->>'catch_up_available',
    'true',
    'freeze-bridged couple (last played yesterday, no row) is offered the catch-up'
  );
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000011','role','authenticated')::text, true);
  select is(
    (public.get_today_state('e4e4e4e4-0000-0000-0000-000000000006'::uuid))->>'catch_up_available',
    'true',
    'a couple that already played today (yesterday never minted) is offered the catch-up'
  );
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000013','role','authenticated')::text, true);
  select is(
    (public.get_today_state('e4e4e4e4-0000-0000-0000-000000000007'::uuid))->>'catch_up_available',
    'false',
    'a brand-new couple (no history, no rows) is not offered the catch-up'
  );

  -- ---- F8: an exhausted override is not consumed; a generic drop mints -----------
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000015','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.ensure_today_drop('e4e4e4e4-0000-0000-0000-000000000008'::uuid)$q$,
    'today mints even though the override theme is exhausted'
  );

  reset role;
  select is(
    (select cd.drop_id from public.couple_drops cd
     where cd.couple_id = 'e4e4e4e4-0000-0000-0000-000000000008'::uuid
       and cd.date = (now() at time zone 'Asia/Singapore')::date),
    'e2e2e2e2-0000-0000-0000-000000000012'::uuid,
    'the mint fell through to the next generic catalog drop'
  );
  select is(
    (select pack_override from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000008'::uuid),
    'zfix-ex',
    'the exhausted override is NOT consumed'
  );

  -- ---- F9: a yesterday mint ignores the override; today consumes it --------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000017','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.ensure_yesterday_drop('e4e4e4e4-0000-0000-0000-000000000009'::uuid)$q$,
    'yesterday mints for the override-holding couple'
  );

  reset role;
  select is(
    (select cd.drop_id from public.couple_drops cd
     where cd.couple_id = 'e4e4e4e4-0000-0000-0000-000000000009'::uuid
       and cd.date = (now() at time zone 'Asia/Singapore')::date - 1),
    'e2e2e2e2-0000-0000-0000-000000000013'::uuid,
    'the catch-up mint took the generic rotation drop, not the sent pack'
  );
  select is(
    (select pack_override from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000009'::uuid),
    'zfix-pk',
    'the override survives the yesterday mint (still queued for today)'
  );

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000017','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.ensure_today_drop('e4e4e4e4-0000-0000-0000-000000000009'::uuid)$q$,
    'today mints for the override-holding couple'
  );

  reset role;
  select is(
    (select cd.drop_id from public.couple_drops cd
     where cd.couple_id = 'e4e4e4e4-0000-0000-0000-000000000009'::uuid
       and cd.date = (now() at time zone 'Asia/Singapore')::date),
    'e2e2e2e2-0000-0000-0000-000000000014'::uuid,
    'today''s mint honors the sent pack'
  );
  select is(
    (select pack_override from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000009'::uuid),
    null,
    'the override is consumed by today''s mint'
  );

  -- ---- F10: send_pack rejects unavailable themes ----------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000019','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.send_pack('e4e4e4e4-0000-0000-0000-000000000010'::uuid, 'zfix-solo')$q$,
    'that pack has nothing new for you two right now',
    'send_pack rejects a theme the couple has fully played'
  );
  select throws_ok(
    $q$select public.send_pack('e4e4e4e4-0000-0000-0000-000000000010'::uuid, 'zfix-hot')$q$,
    'that pack has nothing new for you two right now',
    'send_pack rejects a theme with no spice-eligible drop for this couple'
  );
  select lives_ok(
    $q$select public.send_pack('e4e4e4e4-0000-0000-0000-000000000010'::uuid, 'zfix-ok')$q$,
    'send_pack still accepts an available theme'
  );

  reset role;
  select is(
    (select pack_override from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000010'::uuid),
    'zfix-ok',
    'the available send recorded the steer'
  );

  select * from finish();
rollback;
