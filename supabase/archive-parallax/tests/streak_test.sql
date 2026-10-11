-- ============================================================================
-- STREAK TEST
-- Proves the streak logic (0007, couple-local dates since 0014): gap-aware
-- complete_streak + reset_stale_streaks (freeze forgiveness then reset).
-- Dates are seeded in the couple's timezone (default Asia/Singapore) because
-- that is what the functions compare against. Hermetic, rolled back.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(6);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 's-a@test.com', '', now(), now(), now()),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 's-b@test.com', '', now(), now(), now())
  on conflict do nothing;
  insert into public.profiles (id, display_name) values
    ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'SA'),
    ('c1c1c1c1-0000-0000-0000-000000000002'::uuid, 'SB')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.drops (id, code, title, theme)
  values ('c2c2c2c2-0000-0000-0000-000000000001'::uuid, 's-drop', 'S Drop', 'romantic');

  -- Couple that played YESTERDAY with streak 5, freeze available.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, longest_streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000001'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'c1c1c1c1-0000-0000-0000-000000000002'::uuid,
          'STRK-01', 'active', '2024-01-01', 5, 9, (now() at time zone 'Asia/Singapore')::date - 1, 2);

  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('c5c5c5c5-0000-0000-0000-000000000001'::uuid, 'c4c4c4c4-0000-0000-0000-000000000001'::uuid, 'c2c2c2c2-0000-0000-0000-000000000001'::uuid, (now() at time zone 'Asia/Singapore')::date, 'revealed');

  -- complete_streak as a member: consecutive day -> 6
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select lives_ok($$ select public.complete_streak('c5c5c5c5-0000-0000-0000-000000000001'::uuid) $$, 'complete_streak runs for a member');
  reset role;

  select is((select streak from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid),
            6, 'consecutive-day play increments streak 5 -> 6');

  -- A second couple that MISSED exactly one day (played 2 days ago), has a freeze.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, longest_streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000002'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'c1c1c1c1-0000-0000-0000-000000000002'::uuid,
          'STRK-02', 'active', '2024-01-01', 7, 7, (now() at time zone 'Asia/Singapore')::date - 2, 1);

  -- A third couple that missed TWO days, no freeze -> must reset.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, longest_streak, last_played_on, freezes_remaining)
  values ('c4c4c4c4-0000-0000-0000-000000000003'::uuid,
          'c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'c1c1c1c1-0000-0000-0000-000000000002'::uuid,
          'STRK-03', 'active', '2024-01-01', 4, 8, (now() at time zone 'Asia/Singapore')::date - 3, 0);

  select public.reset_stale_streaks();

  select is((select streak from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000002'::uuid),
            7, 'missed-one-day couple with a freeze KEEPS its streak');
  select is((select freezes_remaining from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000002'::uuid),
            0, 'a freeze was spent to save the streak');
  select is((select streak from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000003'::uuid),
            0, 'missed-two-days couple with no freeze RESETS to 0');
  select is((select streak from public.couples where id = 'c4c4c4c4-0000-0000-0000-000000000001'::uuid),
            6, 'the couple that played today is untouched by the reset job');

  select * from finish();
rollback;
