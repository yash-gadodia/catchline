-- ============================================================================
-- PENDING-HOLD TEST (answer-ahead reveal gate)
--
-- Proves the 0011 rule: a solo user on a *pending* couple can answer their own
-- half early, but the reveal stays HELD ('one_done', never 'revealed') until the
-- partner joins (status->active) and answers too. The dissolved-survivor release
-- from 0010 must still work (regression).
--
-- submit_answers is SECURITY DEFINER + uses auth.uid(); we switch to the
-- authenticated role and set request.jwt.claims to act as each member.
-- Hermetic: own uuids, rolled back by the harness.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(6);

  -- ---- SETUP (as superuser) -------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'ph-anna@test.com', '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'ph-ben@test.com', '', now(), now(), now()),
    ('b1b1b1b1-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'ph-survivor@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('b1b1b1b1-0000-0000-0000-000000000001'::uuid, 'PHAnna'),
    ('b1b1b1b1-0000-0000-0000-000000000002'::uuid, 'PHBen'),
    ('b1b1b1b1-0000-0000-0000-000000000003'::uuid, 'PHSurvivor')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.drops (id, code, title, theme)
  values ('b2b2b2b2-0000-0000-0000-000000000001'::uuid, 'ph-drop', 'PH Drop', 'romantic');

  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('b3b3b3b3-0000-0000-0000-000000000001'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid, 1, '💕', 'Q1?', array['A','B']),
    ('b3b3b3b3-0000-0000-0000-000000000002'::uuid, 'b2b2b2b2-0000-0000-0000-000000000001'::uuid, 2, '💭', 'Q2?', array['A','B']);

  -- A PENDING couple: Anna created the invite, Ben hasn't joined (member_b null).
  insert into public.couples (id, member_a, member_b, invite_code, status)
  values ('b4b4b4b4-0000-0000-0000-000000000001'::uuid,
          'b1b1b1b1-0000-0000-0000-000000000001'::uuid,
          null, 'PH-PEND-01', 'pending');

  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('b5b5b5b5-0000-0000-0000-000000000001'::uuid,
          'b4b4b4b4-0000-0000-0000-000000000001'::uuid,
          'b2b2b2b2-0000-0000-0000-000000000001'::uuid, current_date, 'open');

  -- A DISSOLVED couple: Survivor's partner deleted their account (member_b null).
  insert into public.couples (id, member_a, member_b, invite_code, status)
  values ('b4b4b4b4-0000-0000-0000-000000000002'::uuid,
          'b1b1b1b1-0000-0000-0000-000000000003'::uuid,
          null, 'PH-DISS-01', 'dissolved');

  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('b5b5b5b5-0000-0000-0000-000000000002'::uuid,
          'b4b4b4b4-0000-0000-0000-000000000002'::uuid,
          'b2b2b2b2-0000-0000-0000-000000000001'::uuid, current_date, 'open');

  -- ---- CASE 1: PENDING solo answer-ahead → HELD ----------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(
    (public.submit_answers(
      'b5b5b5b5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":0,"hunch":1},
        {"prompt_id":"b3b3b3b3-0000-0000-0000-000000000002","pick":1,"hunch":0}]'::jsonb
    )->>'new_state'),
    'one_done', 'PENDING: Anna answers all her prompts but reveal is HELD (one_done, not revealed)');

  reset role;
  select is(
    (select state from public.couple_drops where id = 'b5b5b5b5-0000-0000-0000-000000000001'::uuid),
    'one_done', 'PENDING: couple_drop persisted as held (one_done), partner data not yet revealed');

  -- ---- CASE 2: partner joins (->active) and answers → REVEALED --------------
  update public.couples
  set member_b = 'b1b1b1b1-0000-0000-0000-000000000002'::uuid, status = 'active', together_since = current_date
  where id = 'b4b4b4b4-0000-0000-0000-000000000001'::uuid;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select is(
    (public.submit_answers(
      'b5b5b5b5-0000-0000-0000-000000000001'::uuid,
      '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":1,"hunch":0},
        {"prompt_id":"b3b3b3b3-0000-0000-0000-000000000002","pick":0,"hunch":1}]'::jsonb
    )->>'new_state'),
    'revealed', 'JOINED: once Ben joins (active) and answers, the held drop REVEALS');

  reset role;
  select is(
    (select state from public.couple_drops where id = 'b5b5b5b5-0000-0000-0000-000000000001'::uuid),
    'revealed', 'JOINED: couple_drop now revealed for both partners');

  -- ---- CASE 3 (regression): DISSOLVED survivor still releases ---------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','b1b1b1b1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (public.submit_answers(
      'b5b5b5b5-0000-0000-0000-000000000002'::uuid,
      '[{"prompt_id":"b3b3b3b3-0000-0000-0000-000000000001","pick":0,"hunch":0},
        {"prompt_id":"b3b3b3b3-0000-0000-0000-000000000002","pick":1,"hunch":1}]'::jsonb
    )->>'new_state'),
    'revealed', 'DISSOLVED: survivor (null partner) is NOT stranded — drop reveals (0010 preserved)');

  reset role;
  select is(
    (select state from public.couple_drops where id = 'b5b5b5b5-0000-0000-0000-000000000002'::uuid),
    'revealed', 'DISSOLVED: couple_drop revealed so the survivor can finish');

  select * from finish();
rollback;
