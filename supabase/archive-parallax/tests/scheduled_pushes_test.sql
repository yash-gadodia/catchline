-- ============================================================================
-- SCHEDULED PUSHES + EMAIL RE-ENGAGE TEST (0022)
--
-- Proves, with a pinned p_now (2027-01-05, SGT):
--   * streak-saver: candidate only when streak > 0 AND exactly one member
--     played today AND couple-local hour >= 22; targets the non-player with
--     the player's name; tokenless targets don't burn the claim.
--   * drift: only when NEITHER played, past the ritual hour, recently active;
--     both members targeted with crossed partner names.
--   * email: silent 3+ days; 14-day re-email block; ledger expiry re-allows.
--   * the push_ledger claim blocks every same-day rerun.
--   * service-only grants.
--
-- Hermetic: own uuids (d7d7…); assertions are scoped to them (the shared
-- local stack has dev data). One rolled-back transaction.
-- Run: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -q -f supabase/tests/scheduled_pushes_test.sql
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(31);

  -- ---- SETUP (as superuser) ------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'sched-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 26) n
  on conflict do nothing;

  -- handle_new_user already created profile stubs; upsert the fields we need.
  insert into public.profiles (id, display_name)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'P' || n
  from generate_series(1, 26) n
  on conflict (id) do update set display_name = excluded.display_name;

  -- Streak-couple members: token'd, notify_time 23:45 (keeps them out of the
  -- 21:30 drift call). u10 deliberately has NO token.
  update public.profiles set push_token = 'tok-' || right(id::text, 2), notify_time = '23:45'
  where id in (select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 9) n);
  update public.profiles set push_token = null, notify_time = '23:45'
  where id = 'd7d7d7d7-0000-0000-0000-000000000010';
  update public.profiles set display_name = 'Sasha' where id = 'd7d7d7d7-0000-0000-0000-000000000001';
  update public.profiles set display_name = 'Sam'   where id = 'd7d7d7d7-0000-0000-0000-000000000002';

  -- Drift members 11-18: token'd; ritual times per scenario.
  update public.profiles set push_token = 'tok-' || right(id::text, 2)
  where id in (select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(11, 18) n);
  update public.profiles set display_name = 'Dana', notify_time = '20:00' where id = 'd7d7d7d7-0000-0000-0000-000000000011';
  update public.profiles set display_name = 'Dee',  notify_time = '21:00' where id = 'd7d7d7d7-0000-0000-0000-000000000012';
  update public.profiles set notify_time = '23:00' where id in ('d7d7d7d7-0000-0000-0000-000000000013', 'd7d7d7d7-0000-0000-0000-000000000014');
  update public.profiles set notify_time = '20:00' where id in ('d7d7d7d7-0000-0000-0000-000000000015', 'd7d7d7d7-0000-0000-0000-000000000016',
                                                                'd7d7d7d7-0000-0000-0000-000000000017', 'd7d7d7d7-0000-0000-0000-000000000018');
  -- Email members 19-26: keep out of drift via late ritual.
  update public.profiles set notify_time = '23:45'
  where id in (select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(19, 26) n);
  update public.profiles set display_name = 'Eve' where id = 'd7d7d7d7-0000-0000-0000-000000000019';
  update public.profiles set display_name = 'Eli' where id = 'd7d7d7d7-0000-0000-0000-000000000020';

  -- One ad-hoc drop (no position: never enters rotation) with 2 prompts.
  insert into public.drops (id, code, title, theme)
  values ('d7d70000-0000-0000-0000-000000000001'::uuid, 'sched-drop', 'Sched Drop', null);
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('d7d70000-0000-0000-0000-000000000101'::uuid, 'd7d70000-0000-0000-0000-000000000001'::uuid, 0, '☕', 'sched q one?', array['A','B','C']),
    ('d7d70000-0000-0000-0000-000000000102'::uuid, 'd7d70000-0000-0000-0000-000000000001'::uuid, 1, '🌙', 'sched q two?', array['A','B','C']);

  -- ---- Streak-saver couples (today = 2027-01-05 couple-local) ---------------
  -- SS1 (01 Sasha + 02 Sam): streak 3, member_a played -> target Sam.
  -- SS2 (03+04): streak 0, one_done -> excluded.
  -- SS3 (05+06): streak 5, drop open (nobody played) -> excluded.
  -- SS4 (07+08): streak 2, revealed -> excluded.
  -- SS5 (09+10): streak 4, one_done, but target (10) has no token -> no claim.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values
    ('d7d7c000-0000-0000-0000-000000000001'::uuid, 'd7d7d7d7-0000-0000-0000-000000000001', 'd7d7d7d7-0000-0000-0000-000000000002', 'SCHED-S1', 'active', '2026-01-01', 3, '2027-01-04', 0),
    ('d7d7c000-0000-0000-0000-000000000002'::uuid, 'd7d7d7d7-0000-0000-0000-000000000003', 'd7d7d7d7-0000-0000-0000-000000000004', 'SCHED-S2', 'active', '2026-01-01', 0, '2027-01-04', 0),
    ('d7d7c000-0000-0000-0000-000000000003'::uuid, 'd7d7d7d7-0000-0000-0000-000000000005', 'd7d7d7d7-0000-0000-0000-000000000006', 'SCHED-S3', 'active', '2026-01-01', 5, '2027-01-04', 0),
    ('d7d7c000-0000-0000-0000-000000000004'::uuid, 'd7d7d7d7-0000-0000-0000-000000000007', 'd7d7d7d7-0000-0000-0000-000000000008', 'SCHED-S4', 'active', '2026-01-01', 2, '2027-01-05', 0),
    ('d7d7c000-0000-0000-0000-000000000005'::uuid, 'd7d7d7d7-0000-0000-0000-000000000009', 'd7d7d7d7-0000-0000-0000-000000000010', 'SCHED-S5', 'active', '2026-01-01', 4, '2027-01-04', 0);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values
    ('d7d7cd00-0000-0000-0000-000000000001'::uuid, 'd7d7c000-0000-0000-0000-000000000001', 'd7d70000-0000-0000-0000-000000000001', '2027-01-05', 'one_done'),
    ('d7d7cd00-0000-0000-0000-000000000002'::uuid, 'd7d7c000-0000-0000-0000-000000000002', 'd7d70000-0000-0000-0000-000000000001', '2027-01-05', 'one_done'),
    ('d7d7cd00-0000-0000-0000-000000000003'::uuid, 'd7d7c000-0000-0000-0000-000000000003', 'd7d70000-0000-0000-0000-000000000001', '2027-01-05', 'open'),
    ('d7d7cd00-0000-0000-0000-000000000004'::uuid, 'd7d7c000-0000-0000-0000-000000000004', 'd7d70000-0000-0000-0000-000000000001', '2027-01-05', 'revealed'),
    ('d7d7cd00-0000-0000-0000-000000000005'::uuid, 'd7d7c000-0000-0000-0000-000000000005', 'd7d70000-0000-0000-0000-000000000001', '2027-01-05', 'one_done');
  -- SS1: member_a (Sasha) answered both prompts. SS5: member_a (09) answered both.
  insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
  values
    ('d7d7cd00-0000-0000-0000-000000000001', 'd7d70000-0000-0000-0000-000000000101', 'd7d7d7d7-0000-0000-0000-000000000001', 0, 1),
    ('d7d7cd00-0000-0000-0000-000000000001', 'd7d70000-0000-0000-0000-000000000102', 'd7d7d7d7-0000-0000-0000-000000000001', 1, 2),
    ('d7d7cd00-0000-0000-0000-000000000005', 'd7d70000-0000-0000-0000-000000000101', 'd7d7d7d7-0000-0000-0000-000000000009', 0, 1),
    ('d7d7cd00-0000-0000-0000-000000000005', 'd7d70000-0000-0000-0000-000000000102', 'd7d7d7d7-0000-0000-0000-000000000009', 1, 2);

  -- ---- Drift couples ---------------------------------------------------------
  -- D1 (11 Dana + 12 Dee): ritual 20:00, neither played, active yesterday.
  -- D2 (13+14): ritual 23:00 -> 21:30 is before it.
  -- D3 (15+16): stale (last played 10 days ago) -> email's lane.
  -- D4 (17+18): one member played (one_done) -> not drift.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values
    ('d7d7c000-0000-0000-0000-000000000011'::uuid, 'd7d7d7d7-0000-0000-0000-000000000011', 'd7d7d7d7-0000-0000-0000-000000000012', 'SCHED-D1', 'active', '2026-01-01', 1, '2027-01-04', 0),
    ('d7d7c000-0000-0000-0000-000000000012'::uuid, 'd7d7d7d7-0000-0000-0000-000000000013', 'd7d7d7d7-0000-0000-0000-000000000014', 'SCHED-D2', 'active', '2026-01-01', 1, '2027-01-04', 0),
    ('d7d7c000-0000-0000-0000-000000000013'::uuid, 'd7d7d7d7-0000-0000-0000-000000000015', 'd7d7d7d7-0000-0000-0000-000000000016', 'SCHED-D3', 'active', '2026-01-01', 0, '2026-12-26', 0),
    ('d7d7c000-0000-0000-0000-000000000014'::uuid, 'd7d7d7d7-0000-0000-0000-000000000017', 'd7d7d7d7-0000-0000-0000-000000000018', 'SCHED-D4', 'active', '2026-01-01', 0, '2027-01-04', 0);
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values ('d7d7cd00-0000-0000-0000-000000000014'::uuid, 'd7d7c000-0000-0000-0000-000000000014', 'd7d70000-0000-0000-0000-000000000001', '2027-01-05', 'one_done');

  -- ---- Email couples ---------------------------------------------------------
  -- E1 (19 Eve + 20 Eli): last answer 2027-01-01 (4+ days silent), lapsed 6-streak.
  -- E2 (21+22): answered yesterday -> not silent.
  -- E3 (23+24): silent forever, but emailed 7 days ago -> blocked.
  -- E4 (25+26): silent forever, emailed 20 days ago -> allowed again.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, lapsed_streak, lapsed_on, last_played_on, freezes_remaining, created_at)
  values
    ('d7d7c000-0000-0000-0000-000000000021'::uuid, 'd7d7d7d7-0000-0000-0000-000000000019', 'd7d7d7d7-0000-0000-0000-000000000020', 'SCHED-E1', 'active', '2026-01-01', 0, 6, '2027-01-02', '2027-01-01', 0, '2026-12-01'),
    ('d7d7c000-0000-0000-0000-000000000022'::uuid, 'd7d7d7d7-0000-0000-0000-000000000021', 'd7d7d7d7-0000-0000-0000-000000000022', 'SCHED-E2', 'active', '2026-01-01', 2, null, null, null, 0, '2026-12-01'),
    ('d7d7c000-0000-0000-0000-000000000023'::uuid, 'd7d7d7d7-0000-0000-0000-000000000023', 'd7d7d7d7-0000-0000-0000-000000000024', 'SCHED-E3', 'active', '2026-01-01', 0, null, null, null, 0, '2026-12-01'),
    ('d7d7c000-0000-0000-0000-000000000024'::uuid, 'd7d7d7d7-0000-0000-0000-000000000025', 'd7d7d7d7-0000-0000-0000-000000000026', 'SCHED-E4', 'active', '2026-01-01', 0, null, null, null, 0, '2026-12-01');
  insert into public.couple_drops (id, couple_id, drop_id, date, state)
  values
    ('d7d7cd00-0000-0000-0000-000000000021'::uuid, 'd7d7c000-0000-0000-0000-000000000021', 'd7d70000-0000-0000-0000-000000000001', '2026-12-30', 'revealed'),
    ('d7d7cd00-0000-0000-0000-000000000022'::uuid, 'd7d7c000-0000-0000-0000-000000000022', 'd7d70000-0000-0000-0000-000000000001', '2027-01-04', 'open');
  insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch, created_at)
  values
    -- Eli's answers: q one on 12-30, q two on 01-01 (his latest -> Eve's teaser).
    ('d7d7cd00-0000-0000-0000-000000000021', 'd7d70000-0000-0000-0000-000000000101', 'd7d7d7d7-0000-0000-0000-000000000020', 0, 1, '2026-12-30 10:00+08'),
    ('d7d7cd00-0000-0000-0000-000000000021', 'd7d70000-0000-0000-0000-000000000102', 'd7d7d7d7-0000-0000-0000-000000000020', 1, 2, '2027-01-01 09:00+08'),
    -- Eve answered only q one -> Eli's teaser.
    ('d7d7cd00-0000-0000-0000-000000000021', 'd7d70000-0000-0000-0000-000000000101', 'd7d7d7d7-0000-0000-0000-000000000019', 2, 0, '2026-12-30 11:00+08'),
    -- E2: fresh activity yesterday.
    ('d7d7cd00-0000-0000-0000-000000000022', 'd7d70000-0000-0000-0000-000000000101', 'd7d7d7d7-0000-0000-0000-000000000021', 0, 1, '2027-01-04 22:00+08');
  insert into public.push_ledger (couple_id, kind, sent_on)
  values
    ('d7d7c000-0000-0000-0000-000000000023', 'email_reengage', '2026-12-29'),
    ('d7d7c000-0000-0000-0000-000000000024', 'email_reengage', '2026-12-16');

  -- ---- 1-4: service-only grants ---------------------------------------------
  select ok(not has_function_privilege('authenticated', 'public._streak_saver_candidates(timestamptz)', 'execute'),
            'authenticated cannot execute _streak_saver_candidates');
  select ok(not has_function_privilege('authenticated', 'public._drift_reminder_candidates(timestamptz)', 'execute'),
            'authenticated cannot execute _drift_reminder_candidates');
  select ok(not has_function_privilege('authenticated', 'public._email_reengage_candidates(timestamptz)', 'execute'),
            'authenticated cannot execute _email_reengage_candidates');
  select ok(not has_table_privilege('authenticated', 'public.push_ledger', 'select'),
            'authenticated cannot read push_ledger');

  -- ---- 5: streak-saver before 22:00 couple-local fires nothing ----------------
  create temp table r_ss_early as
    select * from public._streak_saver_candidates('2027-01-05 21:30+08'::timestamptz);
  select is((select count(*)::int from r_ss_early where couple_id::text like 'd7d7c000%'), 0,
            'streak-saver: nothing before 22:00 couple-local');

  -- ---- 6: drift before the ritual hour fires nothing --------------------------
  create temp table r_dr_early as
    select * from public._drift_reminder_candidates('2027-01-05 19:00+08'::timestamptz);
  select is((select count(*)::int from r_dr_early where couple_id::text like 'd7d7c000%'), 0,
            'drift: nothing before the ritual hour');

  -- ---- 7-14: streak-saver at 22:30 --------------------------------------------
  create temp table r_ss as
    select * from public._streak_saver_candidates('2027-01-05 22:30+08'::timestamptz);
  select is((select count(*)::int from r_ss where couple_id = 'd7d7c000-0000-0000-0000-000000000001'), 1,
            'streak-saver: SS1 (streak>0, exactly one played) selected once');
  select is((select target_member from r_ss where couple_id = 'd7d7c000-0000-0000-0000-000000000001'),
            'd7d7d7d7-0000-0000-0000-000000000002'::uuid,
            'streak-saver: targets the member who has NOT played (Sam)');
  select is((select partner_name from r_ss where couple_id = 'd7d7c000-0000-0000-0000-000000000001'),
            'Sasha', 'streak-saver: partner name is the player');
  select is((select streak from r_ss where couple_id = 'd7d7c000-0000-0000-0000-000000000001'),
            3, 'streak-saver: carries the real streak');
  select is((select push_token from r_ss where couple_id = 'd7d7c000-0000-0000-0000-000000000001'),
            'tok-02', 'streak-saver: carries the target push token');
  select is((select count(*)::int from r_ss where couple_id in
              ('d7d7c000-0000-0000-0000-000000000002', 'd7d7c000-0000-0000-0000-000000000003',
               'd7d7c000-0000-0000-0000-000000000004', 'd7d7c000-0000-0000-0000-000000000005')), 0,
            'streak-saver: streak=0 / nobody-played / revealed / tokenless-target all excluded');
  select is((select count(*)::int from public.push_ledger
             where couple_id = 'd7d7c000-0000-0000-0000-000000000005'), 0,
            'streak-saver: tokenless target does not burn the ledger claim');
  select is((select count(*)::int from public.push_ledger
             where couple_id = 'd7d7c000-0000-0000-0000-000000000001'
               and kind = 'streak_saver' and sent_on = '2027-01-05'), 1,
            'streak-saver: claim recorded in push_ledger');

  -- ---- 15: same-day rerun sends nothing ----------------------------------------
  create temp table r_ss2 as
    select * from public._streak_saver_candidates('2027-01-05 23:30+08'::timestamptz);
  select is((select count(*)::int from r_ss2 where couple_id::text like 'd7d7c000%'), 0,
            'streak-saver: ledger blocks the same-day rerun');

  -- ---- 16-20: drift at 21:30 -----------------------------------------------------
  create temp table r_dr as
    select * from public._drift_reminder_candidates('2027-01-05 21:30+08'::timestamptz);
  select is((select count(*)::int from r_dr where couple_id = 'd7d7c000-0000-0000-0000-000000000011'), 2,
            'drift: both members of the drifted couple targeted');
  select is((select partner_name from r_dr where target_member = 'd7d7d7d7-0000-0000-0000-000000000011'),
            'Dee', 'drift: Dana''s push names Dee');
  select is((select partner_name from r_dr where target_member = 'd7d7d7d7-0000-0000-0000-000000000012'),
            'Dana', 'drift: Dee''s push names Dana');
  select is((select distinct local_day from r_dr where couple_id = 'd7d7c000-0000-0000-0000-000000000011'),
            '2027-01-05'::date, 'drift: carries the couple-local day for copy rotation');
  select is((select count(*)::int from r_dr where couple_id in
              ('d7d7c000-0000-0000-0000-000000000012', 'd7d7c000-0000-0000-0000-000000000013',
               'd7d7c000-0000-0000-0000-000000000014')), 0,
            'drift: pre-ritual / stale / one-played couples all excluded');

  -- ---- 21: drift same-day rerun sends nothing -------------------------------------
  create temp table r_dr2 as
    select * from public._drift_reminder_candidates('2027-01-05 22:30+08'::timestamptz);
  select is((select count(*)::int from r_dr2 where couple_id = 'd7d7c000-0000-0000-0000-000000000011'), 0,
            'drift: ledger blocks the same-day rerun');

  -- ---- 22-30: email re-engage -------------------------------------------------------
  create temp table r_em as
    select * from public._email_reengage_candidates('2027-01-05 22:30+08'::timestamptz);
  select is((select count(*)::int from r_em where couple_id = 'd7d7c000-0000-0000-0000-000000000021'), 2,
            'email: silent-4-days couple selected, one row per member');
  select is((select partner_name from r_em where target_member = 'd7d7d7d7-0000-0000-0000-000000000019'),
            'Eli', 'email: Eve''s email is about Eli');
  select is((select streak_at_death from r_em where target_member = 'd7d7d7d7-0000-0000-0000-000000000019'),
            6, 'email: streak-at-death read from the lapsed streak');
  select is((select last_question from r_em where target_member = 'd7d7d7d7-0000-0000-0000-000000000019'),
            'sched q two?', 'email: teaser is the partner''s most recent answered QUESTION');
  select is((select email from r_em where target_member = 'd7d7d7d7-0000-0000-0000-000000000019'),
            'sched-19@test.com', 'email: real address from auth.users');
  select is((select last_question from r_em where target_member = 'd7d7d7d7-0000-0000-0000-000000000020'),
            'sched q one?', 'email: Eli''s teaser is Eve''s last answered question');
  select is((select count(*)::int from r_em where couple_id = 'd7d7c000-0000-0000-0000-000000000022'), 0,
            'email: couple active yesterday is not silent');
  select is((select count(*)::int from r_em where couple_id = 'd7d7c000-0000-0000-0000-000000000023'), 0,
            'email: emailed 7 days ago -> 14-day block holds');
  select is((select count(*)::int from r_em where couple_id = 'd7d7c000-0000-0000-0000-000000000024'), 2,
            'email: emailed 20 days ago -> eligible again');

  -- ---- 31: email same-day rerun sends nothing ----------------------------------------
  create temp table r_em2 as
    select * from public._email_reengage_candidates('2027-01-05 23:30+08'::timestamptz);
  select is((select count(*)::int from r_em2 where couple_id in
              ('d7d7c000-0000-0000-0000-000000000021', 'd7d7c000-0000-0000-0000-000000000024')), 0,
            'email: ledger blocks the same-day rerun');

  select * from finish();
rollback;
