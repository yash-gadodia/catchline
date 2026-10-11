-- ============================================================================
-- RPC HARDENING TEST
-- Proves the 0006 hardening: submit_answers validates its inputs, and
-- add_learning is idempotent on (couple, about, origin).
-- Runs as `authenticated` impersonating a real member.
-- Hermetic: own uuids, rolled back.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(5);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'h-alice@test.com', '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'h-bob@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, 'HAlice'),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, 'HBob')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.drops (id, code, title, theme)
  values ('b2b2b2b2-0000-0000-0000-000000000001'::uuid, 'h-drop', 'H Drop', 'romantic');

  -- prompt with exactly 2 options (valid indices: 0,1)
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values ('b3b3b3b3-0000-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid, 1, '💕', 'Q1?', array['A','B']);

  -- a prompt belonging to a DIFFERENT drop (to test the belongs-to-drop guard)
  insert into public.drops (id, code, title, theme)
  values ('b2b2b2b2-0000-0000-0000-000000000099'::uuid, 'h-other', 'Other', 'romantic');
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values ('b3b3b3b3-0000-0000-0000-000000000099'::uuid, 'b2b2b2b2-0000-0000-0000-000000000099'::uuid, 1, '🙃', 'Other?', array['A','B']);

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('b4b4b4b4-0000-0000-0000-000000000001'::uuid,
          'b1b1b1b1-0000-0000-0000-000000000001'::uuid,
          'b1b1b1b1-0000-0000-0000-000000000002'::uuid,
          'HARD-01', 'active', '2024-01-01');

  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('b5b5b5b5-0000-0000-0000-000000000001'::uuid, 'b4b4b4b4-0000-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid, current_date, 'open');

  -- impersonate Alice
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  -- valid submission succeeds
  select lives_ok(
    $$ select public.submit_answers('b5b5b5b5-0000-0000-0000-000000000001'::uuid,
         '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":0,"hunch":1}]'::jsonb) $$,
    'submit_answers accepts a valid in-range answer');

  -- pick out of range is rejected
  select throws_ok(
    $$ select public.submit_answers('b5b5b5b5-0000-0000-0000-000000000001'::uuid,
         '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":5,"hunch":0}]'::jsonb) $$,
    null, 'submit_answers rejects an out-of-range pick');

  -- prompt from another drop is rejected
  select throws_ok(
    $$ select public.submit_answers('b5b5b5b5-0000-0000-0000-000000000001'::uuid,
         '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000099","pick":0,"hunch":0}]'::jsonb) $$,
    null, 'submit_answers rejects a prompt that belongs to another drop');

  -- add_learning is idempotent on (couple, about, origin)
  select public.add_learning('b4b4b4b4-0000-0000-0000-000000000001'::uuid,
    'b1b1b1b1-0000-0000-0000-000000000001'::uuid, '🤍', 'need one', 'detail one', 'refocus', 'origin-x');
  select public.add_learning('b4b4b4b4-0000-0000-0000-000000000001'::uuid,
    'b1b1b1b1-0000-0000-0000-000000000001'::uuid, '🤍', 'need two', 'detail two', 'refocus', 'origin-x');

  select is(
    (select count(*)::int from public.learnings
       where couple_id = 'b4b4b4b4-0000-0000-0000-000000000001'::uuid and origin = 'origin-x'),
    1, 'add_learning upserts: same (couple,about,origin) yields ONE row');

  select is(
    (select need from public.learnings
       where couple_id = 'b4b4b4b4-0000-0000-0000-000000000001'::uuid and origin = 'origin-x'),
    'need two', 'add_learning upsert refreshes the existing row');

  reset role;
  select * from finish();
rollback;
