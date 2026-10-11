-- ============================================================================
-- REACTIONS TEST (0018): per-prompt reveal reactions, RLS-enforced.
--
-- Proves, with role impersonation (auth.uid() = real members):
--   1. reacting BEFORE the reveal is impossible (RLS rejects the insert)
--   2. a member can react once the couple_drop is revealed
--   3. the upsert replaces the author's own reaction (no duplicates)
--   4. the partner can read my reaction post-reveal
--   5. a non-member can neither read nor write reactions
--   6. forging a reaction as the partner (author != auth.uid()) is rejected
--
-- Hermetic: own uuids; rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(11);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rx-alice@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rx-bob@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'rx-eve@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'RxAlice'),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, 'RxBob'),
    ('c1c1c1c1-0000-0000-0000-000000000003'::uuid, 'RxEve')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.drops (id, code, title, theme)
  values ('c2c2c2c2-0000-0000-0000-000000000001'::uuid, 'rx-drop', 'Reactions Drop', null);

  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('c3c3c3c3-0000-0000-0000-000000000001'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, 0, '☕', 'Q1?', array['A','B','C']),
    ('c3c3c3c3-0000-0000-0000-000000000002'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, 1, '🌧', 'Q2?', array['A','B','C']);

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('c4c4c4c4-0000-0000-0000-000000000001'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000001'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000002'::uuid,
          'REACT-1', 'active', '2024-01-01');

  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('c5c5c5c5-0000-0000-0000-000000000001'::uuid,
          'c4c4c4c4-0000-0000-0000-000000000001'::uuid,
          'c2c2c2c2-0000-0000-0000-000000000001'::uuid,
          (now() at time zone 'Asia/Singapore')::date, 'one_done');

  -- ---- 1. Reaction BEFORE reveal is impossible -------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select throws_ok(
    $$insert into public.reactions (couple_drop_id, prompt_id, author, emoji)
      values ('c5c5c5c5-0000-0000-0000-000000000001','c3c3c3c3-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000001','🥹')$$,
    '42501',
    null,
    'member cannot react before the drop is revealed'
  );

  reset role;

  -- ---- reveal happens (server-side state flip) --------------------------------
  update public.couple_drops
  set state = 'revealed'
  where id = 'c5c5c5c5-0000-0000-0000-000000000001'::uuid;

  -- ---- 2. Member reacts post-reveal -------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $$insert into public.reactions (couple_drop_id, prompt_id, author, emoji)
      values ('c5c5c5c5-0000-0000-0000-000000000001','c3c3c3c3-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000001','🥹')$$,
    'member can react once revealed'
  );

  select is(
    (select emoji from public.reactions
     where couple_drop_id = 'c5c5c5c5-0000-0000-0000-000000000001'
       and prompt_id = 'c3c3c3c3-0000-0000-0000-000000000001'
       and author = 'c1c1c1c1-0000-0000-0000-000000000001'),
    '🥹',
    'the reaction stores the tapped emoji'
  );

  -- ---- 3. Upsert replaces own reaction (the client tap-again path) ------------
  select lives_ok(
    $$insert into public.reactions (couple_drop_id, prompt_id, author, emoji)
      values ('c5c5c5c5-0000-0000-0000-000000000001','c3c3c3c3-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000001','😂')
      on conflict (couple_drop_id, prompt_id, author) do update set emoji = excluded.emoji$$,
    'upserting the same prompt replaces the reaction'
  );

  select is(
    (select emoji from public.reactions
     where couple_drop_id = 'c5c5c5c5-0000-0000-0000-000000000001'
       and prompt_id = 'c3c3c3c3-0000-0000-0000-000000000001'
       and author = 'c1c1c1c1-0000-0000-0000-000000000001'),
    '😂',
    'the upsert swapped the emoji'
  );

  select is(
    (select count(*)::int from public.reactions
     where couple_drop_id = 'c5c5c5c5-0000-0000-0000-000000000001'
       and prompt_id = 'c3c3c3c3-0000-0000-0000-000000000001'
       and author = 'c1c1c1c1-0000-0000-0000-000000000001'),
    1,
    'upsert never duplicates a reaction'
  );

  -- ---- 4. Forging the partner as author is rejected ----------------------------
  select throws_ok(
    $$insert into public.reactions (couple_drop_id, prompt_id, author, emoji)
      values ('c5c5c5c5-0000-0000-0000-000000000001','c3c3c3c3-0000-0000-0000-000000000002','c1c1c1c1-0000-0000-0000-000000000002','👀')$$,
    '42501',
    null,
    'cannot insert a reaction authored as the partner'
  );

  reset role;

  -- ---- 5. Partner (Bob) reads Alice's reaction post-reveal ---------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.reactions
     where couple_drop_id = 'c5c5c5c5-0000-0000-0000-000000000001'),
    1,
    'partner sees exactly the one reaction'
  );

  select is(
    (select emoji from public.reactions
     where couple_drop_id = 'c5c5c5c5-0000-0000-0000-000000000001'
       and author = 'c1c1c1c1-0000-0000-0000-000000000001'),
    '😂',
    'partner reads my reaction emoji post-reveal'
  );

  reset role;

  -- ---- 6. Non-member (Eve) can neither read nor write --------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.reactions
     where couple_drop_id = 'c5c5c5c5-0000-0000-0000-000000000001'),
    0,
    'non-member reads 0 reactions'
  );

  select throws_ok(
    $$insert into public.reactions (couple_drop_id, prompt_id, author, emoji)
      values ('c5c5c5c5-0000-0000-0000-000000000001','c3c3c3c3-0000-0000-0000-000000000001','c1c1c1c1-0000-0000-0000-000000000003','❤️')$$,
    '42501',
    null,
    'non-member cannot react'
  );

  reset role;

  select * from finish();
rollback;
