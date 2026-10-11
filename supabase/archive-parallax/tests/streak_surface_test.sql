-- ============================================================================
-- STREAK SURFACE TEST (0017): the honest streak screen + milestone producer.
--
-- Proves, with role impersonation (auth.uid() = real members):
--   1. get_streak_surface returns the EXACT week grid from couple_drops
--      history (oldest first, today last; only state='revealed' days count)
--   2. streak / longest_streak / freezes_remaining pass through exactly
--   3. _increment_streak emits a 'milestone' activity (payload days) when the
--      new streak hits the 3-day threshold — and does NOT at 4
--   4. 0014 behavior preserved: increment + idempotency + 'played' log
--   5. get_streak_surface rejects a non-member
--
-- Hermetic: own uuids; rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(13);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('e1e1e1e1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'ss-alice@test.com', '', now(), now(), now()),
    ('e1e1e1e1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'ss-bob@test.com', '', now(), now(), now()),
    ('e1e1e1e1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'ss-eve@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('e1e1e1e1-0000-0000-0000-000000000001'::uuid, 'SSAlice'),
    ('e1e1e1e1-0000-0000-0000-000000000002'::uuid, 'SSBob'),
    ('e1e1e1e1-0000-0000-0000-000000000003'::uuid, 'SSEve')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.drops (id, code, title, theme)
  values ('e2e2e2e2-0000-0000-0000-000000000001'::uuid, 'ss-drop', 'Streak Surface Drop', null);

  -- Couple 1: seeded stats + a real 7-day history (tz defaults to Asia/Singapore).
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, longest_streak, freezes_remaining, last_played_on)
  values ('e4e4e4e4-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
          'SURFACE-1', 'active', '2024-01-01', 5, 9, 2,
          (now() at time zone 'Asia/Singapore')::date - 1);

  -- History relative to couple-local today T:
  --   T-6 revealed · T-5 (none) · T-4 revealed · T-3 open (must NOT count) ·
  --   T-2 revealed · T-1 revealed · T (none)
  -- Expected week (oldest first, today last): [t,f,t,f,t,t,f]
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values
    ('e5e5e5e5-0000-0000-0000-000000000001'::uuid, 'e4e4e4e4-0000-0000-0000-000000000001'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 6, 'revealed'),
    ('e5e5e5e5-0000-0000-0000-000000000002'::uuid, 'e4e4e4e4-0000-0000-0000-000000000001'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 4, 'revealed'),
    ('e5e5e5e5-0000-0000-0000-000000000003'::uuid, 'e4e4e4e4-0000-0000-0000-000000000001'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 3, 'open'),
    ('e5e5e5e5-0000-0000-0000-000000000004'::uuid, 'e4e4e4e4-0000-0000-0000-000000000001'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 2, 'revealed'),
    ('e5e5e5e5-0000-0000-0000-000000000005'::uuid, 'e4e4e4e4-0000-0000-0000-000000000001'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date - 1, 'revealed');

  -- Couple 2 (alice+bob again — no member uniqueness at the DB level): streak 2,
  -- played yesterday, so the next increment lands exactly on the 3-day threshold.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, longest_streak, freezes_remaining, last_played_on)
  values ('e4e4e4e4-0000-0000-0000-000000000002'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
          'SURFACE-2', 'active', '2024-01-01', 2, 2, 2,
          (now() at time zone 'Asia/Singapore')::date - 1);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('e5e5e5e5-0000-0000-0000-000000000012'::uuid, 'e4e4e4e4-0000-0000-0000-000000000002'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date, 'open');

  -- Couple 3: streak 3, played yesterday — the next increment (to 4) is NOT a threshold.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, longest_streak, freezes_remaining, last_played_on)
  values ('e4e4e4e4-0000-0000-0000-000000000003'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
          'SURFACE-3', 'active', '2024-01-01', 3, 3, 2,
          (now() at time zone 'Asia/Singapore')::date - 1);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('e5e5e5e5-0000-0000-0000-000000000013'::uuid, 'e4e4e4e4-0000-0000-0000-000000000003'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date, 'open');

  -- ---- 1+2. get_streak_surface as Alice --------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    ((public.get_streak_surface('e4e4e4e4-0000-0000-0000-000000000001'::uuid))->'week')::jsonb,
    '[true,false,true,false,true,true,false]'::jsonb,
    'week grid = exact per-day history, oldest first / today last; open day and empty days are false'
  );
  select is(
    (public.get_streak_surface('e4e4e4e4-0000-0000-0000-000000000001'::uuid))->>'streak',
    '5',
    'streak passes through exactly'
  );
  select is(
    (public.get_streak_surface('e4e4e4e4-0000-0000-0000-000000000001'::uuid))->>'longest_streak',
    '9',
    'longest_streak passes through exactly'
  );
  select is(
    (public.get_streak_surface('e4e4e4e4-0000-0000-0000-000000000001'::uuid))->>'freezes_remaining',
    '2',
    'freezes_remaining passes through exactly'
  );

  -- ---- 3. Milestone emitted at the 3-day threshold ---------------------------
  select lives_ok(
    $$select public.complete_streak('e5e5e5e5-0000-0000-0000-000000000012'::uuid)$$,
    'complete_streak increments couple 2 (2 -> 3)'
  );

  reset role;

  select is(
    (select streak from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000002'::uuid),
    3,
    '0014 preserved: streak incremented to 3'
  );
  select is(
    (select count(*)::int from public.activity where couple_id = 'e4e4e4e4-0000-0000-0000-000000000002'::uuid and kind = 'milestone'),
    1,
    'exactly one milestone activity emitted at the 3-day threshold'
  );
  select is(
    (select payload->>'days' from public.activity where couple_id = 'e4e4e4e4-0000-0000-0000-000000000002'::uuid and kind = 'milestone'),
    '3',
    'milestone payload carries days = 3'
  );
  select is(
    (select count(*)::int from public.activity where couple_id = 'e4e4e4e4-0000-0000-0000-000000000002'::uuid and kind = 'played'),
    1,
    '0014 preserved: played activity still logged once'
  );

  -- Idempotency: a second reveal-complete today must not double anything.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select public.complete_streak('e5e5e5e5-0000-0000-0000-000000000012'::uuid);
  reset role;

  select is(
    (select count(*)::int from public.activity where couple_id = 'e4e4e4e4-0000-0000-0000-000000000002'::uuid and kind = 'milestone'),
    1,
    'idempotent: same-day re-complete does not emit a second milestone'
  );

  -- ---- 4. NOT emitted at 4 days ----------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select public.complete_streak('e5e5e5e5-0000-0000-0000-000000000013'::uuid);
  reset role;

  select is(
    (select streak from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000003'::uuid),
    4,
    'couple 3 incremented to 4'
  );
  select is(
    (select count(*)::int from public.activity where couple_id = 'e4e4e4e4-0000-0000-0000-000000000003'::uuid and kind = 'milestone'),
    0,
    'no milestone activity at 4 days (not a threshold)'
  );

  -- ---- 5. Non-member rejected -------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $$select public.get_streak_surface('e4e4e4e4-0000-0000-0000-000000000001'::uuid)$$,
    'Unauthorized: not a member of this couple',
    'get_streak_surface rejects a non-member'
  );
  reset role;

  select * from finish();
rollback;
