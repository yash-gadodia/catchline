-- Referrals (0025): codes need Sign in with Apple, a claim needs an Apple
-- identity and a young account, one claim per Apple ID ever, a first done lift
-- qualifies and writes both 30-day rewards, milestones land once, coach codes
-- give the invited lifter a month but the coach no month, and clients read no
-- referral table directly.
begin;
create extension if not exists pgtap;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, is_anonymous)
values
  ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-owner@test.dev', '', now(), now(), now(), false),
  ('f1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-friend@test.dev', '', now(), now(), now(), false),
  ('f1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '', null, now(), now(), true),
  ('f1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-old@test.dev', '', now(), now() - interval '60 days', now(), false),
  ('f1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-coach@test.dev', '', now(), now(), now(), false),
  ('f1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-lifter@test.dev', '', now(), now(), now(), false),
  ('f1000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-noapple@test.dev', '', now(), now(), now(), false),
  ('f1000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ref-same-apple@test.dev', '', now(), now(), now(), false);

update public.profiles set display_name = 'Yash Gadodia' where id = 'f1000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Huilong Tan' where id = 'f1000000-0000-0000-0000-000000000002';
update public.profiles set created_at = now() - interval '60 days' where id = 'f1000000-0000-0000-0000-000000000004';

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000002', 'apple-sub-friend', 'apple', '{"sub":"apple-sub-friend"}', now(), now()),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000004', 'apple-sub-old', 'apple', '{"sub":"apple-sub-old"}', now(), now()),
  (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000006', 'apple-sub-lifter', 'apple', '{"sub":"apple-sub-lifter"}', now(), now());

create temp table t_code (code text) on commit drop;
grant all on t_code to authenticated;

-- ---- An anonymous user has no code ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.my_referral()$$, 'P0001', 'sign_in_required', 'An anonymous user must sign in for a code');
reset role;

-- ---- The owner gets a code from their first name ----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}', true);
insert into t_code select public.my_referral() ->> 'code';
select matches((select code from t_code), '^YASH[0-9]{2}$', 'The code is the first name and two digits');
select is(public.my_referral() ->> 'code', (select code from t_code), 'The same code comes back on the next call');
select is((public.my_referral() ->> 'joined')::int, 0, 'Nobody has joined yet');
select is((public.my_referral() ->> 'nextMilestone')::int, 3, 'The next milestone is 3 friends');
select throws_ok($$select public.claim_referral((select code from t_code))$$, 'P0001', 'own_code', 'Nobody claims their own code');
select throws_ok($$select * from public.referral_codes$$, '42501', null, 'Codes are not client-readable');
select throws_ok($$select * from public.referral_rewards$$, '42501', null, 'Rewards are not client-readable');
reset role;

-- ---- The public page sees only the first name -------------------------------
set local role anon;
select is(public.referral_preview(lower((select code from t_code))), '{"kind": "friend", "name": "Yash"}'::jsonb, 'The preview shows the first name, any case');
select is(public.referral_preview('NOPE99'), null, 'An unknown code previews as null');
reset role;

-- ---- Claims that are refused ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.claim_referral((select code from t_code))$$, 'P0001', 'too_late', 'An account older than 30 days cannot claim');
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000007","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.claim_referral((select code from t_code))$$, 'P0001', 'sign_in_required', 'A claim needs an Apple identity');
select throws_ok($$select public.claim_referral('NOPE99')$$, 'P0001', 'code_not_found', 'An unknown code is refused');
reset role;

-- ---- The friend claims, then tracks a first lift ----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}', true);
select is(public.claim_referral(' ' || lower((select code from t_code)) || ' '),
          '{"kind": "friend", "status": "claimed", "inviter": "Yash"}'::jsonb, 'A claim with no lift yet is pending');
select throws_ok($$select public.claim_referral((select code from t_code))$$, 'P0001', 'already_claimed', 'A second claim is refused');
reset role;

select is((select count(*)::int from public.referral_rewards where user_id in ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002')),
          0, 'No reward before the first lift');
insert into public.lifts (id, user_id, movement, status, clip_path)
values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002', 'snatch', 'done', 'f2/one');
select is((select status from public.referrals where referee_id = 'f1000000-0000-0000-0000-000000000002'), 'qualified', 'The first done lift qualifies');
select is((select days from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000002' and reason = 'invited'), 30, 'The friend gets 30 days');
select is((select days from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000001' and reason = 'inviter'), 30, 'The owner gets 30 days');
insert into public.lifts (id, user_id, movement, status, clip_path)
values ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'clean', 'done', 'f2/two');
select is((select count(*)::int from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000001'), 1, 'A second lift adds nothing');

-- ---- The same Apple ID on a new account cannot claim again -------------------
delete from auth.users where id = 'f1000000-0000-0000-0000-000000000002';
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (gen_random_uuid(), 'f1000000-0000-0000-0000-000000000008', 'apple-sub-friend', 'apple', '{"sub":"apple-sub-friend"}', now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000008","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.claim_referral((select code from t_code))$$, 'P0001', 'already_claimed', 'One claim per Apple ID, even after deleting the account');
reset role;

-- ---- Milestones land once ---------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, is_anonymous)
select ('f3000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'ref-m' || i || '@test.dev', '', now(), now(), now(), false
  from generate_series(1, 10) i;
insert into public.referrals (referrer_id, referee_id, code, kind)
select 'f1000000-0000-0000-0000-000000000001', ('f3000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, (select code from t_code), 'friend'
  from generate_series(1, 10) i;
insert into public.lifts (user_id, movement, status, clip_path)
select ('f3000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'snatch', 'done', 'm/' || i
  from generate_series(1, 10) i;
select is((select days from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000001' and reason = 'milestone_3'), 90, '3 friends add 90 days once');
select is((select days from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000001' and reason = 'milestone_10'), 365, '10 friends add a year once');
select is((select count(*)::int from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000001' and reason like 'milestone%'), 2, 'Each milestone exactly once');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}', true);
select is((public.my_referral() ->> 'badge')::boolean, true, '10 qualified friends earn the badge');
reset role;

-- ---- A coach code: the lifter gets a month, the coach gets no month ---------
select public.admin_make_coach('f1000000-0000-0000-0000-000000000005', 'coachsam');
insert into public.lifts (user_id, movement, status, clip_path)
values ('f1000000-0000-0000-0000-000000000006', 'clean', 'done', 'f6/one');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000006","role":"authenticated","is_anonymous":false}', true);
select is(public.claim_referral('COACHSAM') ->> 'status', 'qualified', 'A lifter with a done lift qualifies at claim');
reset role;
select is((select count(*)::int from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000006' and reason = 'invited'), 1, 'The coach''s lifter gets a month');
select is((select count(*)::int from public.referral_rewards where user_id = 'f1000000-0000-0000-0000-000000000005'), 0, 'The coach gets no month');

select * from finish();
rollback;
