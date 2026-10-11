-- ============================================================================
-- CONTENT ROTATION TEST (0015): the DB-backed catalog + per-couple rotation.
--
-- Proves, with role impersonation (auth.uid() = real members):
--   1. the seeded catalog: exactly 90 drops at positions 0..89, each with
--      exactly 3 prompts (positions 0..2) of exactly 5 options
--   2. day 2 gets a DIFFERENT drop than day 1 (next unused by position)
--   3. no repeats: after N used drops, the pick is not in the couple's history
--   4. idempotent: two calls the same day return the same couple_drop id
--   5. spice respected: a both-sweet couple never gets a spice>0 drop, and a
--      pending couple uses member_a's level alone
--   6. cycle: when every eligible drop is used, the least-recently-used
--      eligible drop comes around again
--   7. membership guard: non-members are rejected (0014 parity)
--
-- Hermetic: own uuids; catalog assertions scope to position 0..89 (ad-hoc /
-- dev drops have null position); rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(15);

  -- ---- 1. The seeded catalog --------------------------------------------------
  select is(
    (select count(*)::int from public.drops where position between 0 and 89),
    90,
    'catalog: exactly 90 drops at positions 0..89'
  );
  select is(
    (select count(distinct position)::int from public.drops where position between 0 and 89),
    90,
    'catalog: positions 0..89 are all distinct'
  );
  select is(
    (select count(*)::int
     from public.drops d
     where d.position between 0 and 89
       and (select count(*) from public.drop_prompts dp where dp.drop_id = d.id) = 3
       and (select count(distinct dp.position) from public.drop_prompts dp
            where dp.drop_id = d.id and dp.position between 0 and 2) = 3),
    90,
    'catalog: every drop has exactly 3 prompts at positions 0..2'
  );
  select is(
    (select count(*)::int
     from public.drop_prompts dp
     join public.drops d on d.id = dp.drop_id
     where d.position between 0 and 89),
    270,
    'catalog: 270 prompts in total'
  );
  select is(
    (select count(*)::int
     from public.drop_prompts dp
     join public.drops d on d.id = dp.drop_id
     where d.position between 0 and 89
       and coalesce(array_length(dp.options, 1), 0) <> 5),
    0,
    'catalog: every prompt has exactly 5 options'
  );

  -- ---- SETUP (as superuser) ---------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-flora@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-finn@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-nora@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-nick@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000005'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-sana@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000006'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-sami@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000007'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-pia@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000008'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'cr-eve@test.com', '', now(), now(), now())
  on conflict do nothing;

  -- flora/finn keep the column default ('flirty'); sana/sami/pia are sweet.
  insert into public.profiles (id, display_name)
  values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'CRFlora'),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, 'CRFinn'),
    ('c1c1c1c1-0000-0000-0000-000000000003'::uuid, 'CRNora'),
    ('c1c1c1c1-0000-0000-0000-000000000004'::uuid, 'CRNick'),
    ('c1c1c1c1-0000-0000-0000-000000000008'::uuid, 'CREve')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.profiles (id, display_name, spice_level)
  values
    ('c1c1c1c1-0000-0000-0000-000000000005'::uuid, 'CRSana', 'sweet'),
    ('c1c1c1c1-0000-0000-0000-000000000006'::uuid, 'CRSami', 'sweet'),
    ('c1c1c1c1-0000-0000-0000-000000000007'::uuid, 'CRPia', 'sweet')
  on conflict (id) do update set display_name = excluded.display_name, spice_level = excluded.spice_level;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values
    -- couple A: flora + finn (flirty), had the position-1 drop yesterday
    ('c4c4c4c4-0000-0000-0000-000000000001'::uuid, 'c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'c1c1c1c1-0000-0000-0000-000000000002'::uuid, 'CR-ROT-01', 'active', '2024-01-01'),
    -- couple B: nora + nick (flirty), used positions 0..4 already
    ('c4c4c4c4-0000-0000-0000-000000000002'::uuid, 'c1c1c1c1-0000-0000-0000-000000000003'::uuid, 'c1c1c1c1-0000-0000-0000-000000000004'::uuid, 'CR-ROT-02', 'active', '2024-01-01'),
    -- couple C: sana + sami (both sweet)
    ('c4c4c4c4-0000-0000-0000-000000000003'::uuid, 'c1c1c1c1-0000-0000-0000-000000000005'::uuid, 'c1c1c1c1-0000-0000-0000-000000000006'::uuid, 'CR-ROT-03', 'active', '2024-01-01');

  -- couple D: pia solo on a PENDING couple (sweet) — cycle + member_a-level test
  insert into public.couples (id, member_a, member_b, invite_code, status)
  values ('c4c4c4c4-0000-0000-0000-000000000004'::uuid, 'c1c1c1c1-0000-0000-0000-000000000007'::uuid, null, 'CR-ROT-04', 'pending');

  -- couple A history: position-1 drop yesterday (couple-local, tz default SGT)
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('c4c4c4c4-0000-0000-0000-000000000001'::uuid,
          '22222222-2222-2222-2222-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date - 1, 'revealed');

  -- couple B history: positions 0..4 over the last five days
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'c4c4c4c4-0000-0000-0000-000000000002'::uuid, d.id,
         (now() at time zone 'Asia/Singapore')::date - (5 - d.position), 'revealed'
  from public.drops d
  where d.position between 0 and 4;

  -- couple D history: EVERY sweet-eligible drop already used; the lowest
  -- position gets the oldest date, so it is the least-recently-used one.
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'c4c4c4c4-0000-0000-0000-000000000004'::uuid, d.id,
         (now() at time zone 'Asia/Singapore')::date - 1
           - (row_number() over (order by d.position desc))::int,
         'revealed'
  from public.drops d
  where d.position is not null and d.spice = 0;

  -- ---- 2. Day 2 is a different drop (couple A) ---------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select public.ensure_today_drop('c4c4c4c4-0000-0000-0000-000000000001'::uuid);
  reset role;

  select isnt(
    (select drop_id from public.couple_drops
     where couple_id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid
       and date = (now() at time zone 'Asia/Singapore')::date),
    '22222222-2222-2222-2222-000000000001'::uuid,
    'day 2: a different drop than day 1'
  );
  select is(
    (select drop_id from public.couple_drops
     where couple_id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid
       and date = (now() at time zone 'Asia/Singapore')::date),
    '11111111-1111-1111-1111-111111111111'::uuid,
    'day 2: the lowest-position unused eligible drop (DROP 27, position 0)'
  );

  -- ---- 3. Idempotent same-day calls (couple A) ---------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select is(
    public.ensure_today_drop('c4c4c4c4-0000-0000-0000-000000000001'::uuid),
    public.ensure_today_drop('c4c4c4c4-0000-0000-0000-000000000001'::uuid),
    'idempotent: two calls the same day return the same couple_drop id'
  );
  reset role;

  -- ---- 4. No repeats after N used drops (couple B) -------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select public.ensure_today_drop('c4c4c4c4-0000-0000-0000-000000000002'::uuid);
  reset role;

  select is(
    (select drop_id from public.couple_drops
     where couple_id = 'c4c4c4c4-0000-0000-0000-000000000002'::uuid
       and date = (now() at time zone 'Asia/Singapore')::date),
    '22222222-2222-2222-2222-000000000005'::uuid,
    'no repeats: with positions 0..4 used, today is the position-5 drop'
  );
  select ok(
    (select drop_id from public.couple_drops
     where couple_id = 'c4c4c4c4-0000-0000-0000-000000000002'::uuid
       and date = (now() at time zone 'Asia/Singapore')::date)
    not in (select drop_id from public.couple_drops
            where couple_id = 'c4c4c4c4-0000-0000-0000-000000000002'::uuid
              and date < (now() at time zone 'Asia/Singapore')::date),
    'no repeats: today''s drop is not in the couple''s history'
  );

  -- ---- 5. Spice respected (couple C, both sweet) ---------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select public.ensure_today_drop('c4c4c4c4-0000-0000-0000-000000000003'::uuid);
  reset role;

  select is(
    (select d.spice from public.couple_drops cd
     join public.drops d on d.id = cd.drop_id
     where cd.couple_id = 'c4c4c4c4-0000-0000-0000-000000000003'::uuid
       and cd.date = (now() at time zone 'Asia/Singapore')::date),
    0,
    'spice: a both-sweet couple only gets a spice-0 drop'
  );
  select is(
    (select drop_id from public.couple_drops
     where couple_id = 'c4c4c4c4-0000-0000-0000-000000000003'::uuid
       and date = (now() at time zone 'Asia/Singapore')::date),
    '22222222-2222-2222-2222-000000000001'::uuid,
    'spice: DROP 27 (spice 1, position 0) is skipped for a sweet couple'
  );

  -- ---- 6. Cycle: all eligible used -> least-recently-used (couple D, pending) ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000007','role','authenticated')::text, true);
  select public.ensure_today_drop('c4c4c4c4-0000-0000-0000-000000000004'::uuid);
  reset role;

  select is(
    (select d.spice from public.couple_drops cd
     join public.drops d on d.id = cd.drop_id
     where cd.couple_id = 'c4c4c4c4-0000-0000-0000-000000000004'::uuid
       and cd.date = (now() at time zone 'Asia/Singapore')::date),
    0,
    'cycle: a pending sweet couple (member_a''s level) still only gets spice 0'
  );
  select is(
    (select drop_id from public.couple_drops
     where couple_id = 'c4c4c4c4-0000-0000-0000-000000000004'::uuid
       and date = (now() at time zone 'Asia/Singapore')::date),
    '22222222-2222-2222-2222-000000000001'::uuid,
    'cycle: with every eligible drop used, the least-recently-used one repeats'
  );

  -- ---- 7. Membership guard (0014 parity) ------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000008','role','authenticated')::text, true);
  select throws_ok(
    $$select public.ensure_today_drop('c4c4c4c4-0000-0000-0000-000000000001'::uuid)$$,
    'Unauthorized: not a member of this couple',
    'ensure_today_drop rejects a non-member'
  );
  reset role;

  select * from finish();
rollback;
