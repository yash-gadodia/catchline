-- Account transfer: an anonymous user mints a token, the Apple user claims it.
-- Only an anonymous caller can begin, only a signed-in one can complete, the
-- rows move exactly once, and the token dies with the transfer.
begin;
create extension if not exists pgtap;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, is_anonymous)
values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, '', null, now(), now(), true),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'transfer-apple@test.dev', '', now(), now(), now(), false),
  ('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'transfer-other@test.dev', '', now(), now(), now(), false);

-- The anonymous phone: 2 lifts, 1 analysis, 2 cues (one colliding with the Apple
-- user's), 2 consents, 1 coach link, used 2 of the 3 free videos, plan pull.
insert into public.lifts (id, user_id, movement, status, clip_path)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'done', 'e1/one'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'clean', 'done', 'e1/two');
insert into public.analyses (lift_id, user_id, analysis)
values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', '{"version": 1, "id": "transfer-a"}');
insert into public.cues (user_id, movement, fault_id, text, status)
values
  ('e1000000-0000-0000-0000-000000000001', 'snatch', 'bar_forward_off_hips', 'Keep the bar close', 'trying'),
  ('e1000000-0000-0000-0000-000000000001', 'clean', 'early_arm_bend', 'Arms long', 'trying');
insert into public.consents (user_id, kind, version, granted)
values
  ('e1000000-0000-0000-0000-000000000001', 'upload_privacy', '1', true),
  ('e1000000-0000-0000-0000-000000000001', 'model_training', '1', false);
insert into public.coach_links (user_id, lift_id)
values ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001');
-- The worker wrote the keyframes under the anonymous user's folder; they stay there after the transfer.
insert into storage.objects (bucket_id, name)
values ('keyframes', 'e1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000001/r1-6-catch.jpg');
update public.usage_counters set lifetime_count = 2, bonus_credits = 1 where user_id = 'e1000000-0000-0000-0000-000000000001';
update public.profiles set plan = 'pull', display_name = 'Anon Name' where id = 'e1000000-0000-0000-0000-000000000001';

-- The Apple account already has a trying cue for the same fault and used 1 video.
insert into public.cues (user_id, movement, fault_id, text, status)
values ('e1000000-0000-0000-0000-000000000002', 'snatch', 'bar_forward_off_hips', 'Stay over the bar', 'trying');
update public.usage_counters set lifetime_count = 1 where user_id = 'e1000000-0000-0000-0000-000000000002';

create temp table t_token (token uuid) on commit drop;
grant all on t_token to authenticated;

-- ---- A signed-in (non-anonymous) caller cannot begin ------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.begin_account_transfer()$$, 'P0001', 'not_anonymous', 'A signed-in user cannot begin a transfer');
reset role;

-- ---- The anonymous user begins ----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);
insert into t_token select public.begin_account_transfer();
select ok((select token from t_token) is not null, 'The anonymous user gets a token');
select throws_ok($$select * from public.account_transfers$$, '42501', null, 'The token table is not client-readable');
select throws_ok($$select public.complete_account_transfer((select token from t_token))$$, 'P0001', 'anonymous_caller',
  'An anonymous caller cannot complete');
reset role;

select is((select count(*)::int from public.account_transfers where from_user = 'e1000000-0000-0000-0000-000000000001'), 1,
  'One open token per anonymous user');

-- ---- Another signed-in user with the token takes the rows (it is a bearer token) ----
-- Expired tokens are refused first.
update public.account_transfers set created_at = now() - interval '16 minutes' where token = (select token from t_token);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select public.complete_account_transfer((select token from t_token))$$, 'P0001', 'transfer_not_found',
  'A token older than 15 minutes is refused');
reset role;
-- A stale token from someone else, for the sweep check below.
insert into public.account_transfers (from_user, created_at)
values ('e1000000-0000-0000-0000-000000000003', now() - interval '16 minutes');

-- Mint a fresh one and complete as the Apple user.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);
delete from t_token;
insert into t_token select public.begin_account_transfer();
reset role;

create temp table t_result (r jsonb) on commit drop;
grant all on t_result to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}', true);
insert into t_result select public.complete_account_transfer((select token from t_token));
select is((select r ->> 'lifts' from t_result), '2', 'Exactly 2 lifts moved');
select is((select r ->> 'analyses' from t_result), '1', 'Exactly 1 analysis moved');
select is((select r ->> 'cues' from t_result), '2', 'Exactly 2 cues moved');
select is((select r ->> 'consents' from t_result), '2', 'Exactly 2 consents moved');
select is((select r ->> 'coach_links' from t_result), '1', 'Exactly 1 coach link moved');
select is((select count(*)::int from public.lifts), 2, 'The Apple user now reads the 2 lifts under RLS');
select is((select count(*)::int from storage.objects where bucket_id = 'keyframes'), 1,
  'The Apple user reads the moved lift''s keyframe although it sits under the old user folder');
select is((select count(*)::int from public.cues where status = 'trying'), 2, 'One trying cue per fault: the kept account''s stays trying');
select is((select count(*)::int from public.cues where status = 'dropped' and text = 'Keep the bar close'), 1,
  'The colliding anonymous cue was dropped, not lost');
select throws_ok($$select public.complete_account_transfer((select token from t_token))$$, 'P0001', 'transfer_not_found',
  'A second complete with the same token fails');
reset role;
select is((select count(*)::int from public.account_transfers), 0, 'The used token and the stale one were swept');

-- ---- The original owner sees nothing afterwards ------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}', true);
select is((select count(*)::int from public.lifts), 0, 'The anonymous user sees 0 lifts afterwards');
select is((select count(*)::int from public.analyses), 0, 'The anonymous user sees 0 analyses afterwards');
select is((select count(*)::int from public.cues), 0, 'The anonymous user sees 0 cues afterwards');
select is((select count(*)::int from public.consents), 0, 'The anonymous user sees 0 consents afterwards');
select is((select count(*)::int from storage.objects where bucket_id = 'keyframes'), 0,
  'The anonymous user no longer reads the keyframe in its own folder');
reset role;

-- ---- A third user never sees them ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":false}', true);
select is((select count(*)::int from public.lifts), 0, 'Another user sees 0 of the moved lifts');
select is((select count(*)::int from storage.objects where bucket_id = 'keyframes'), 0, 'Another user reads 0 of the moved keyframes');
reset role;

-- ---- Counters and plan merged -------------------------------------------------
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000002'), 3,
  'Lifetime usage is the sum (2 + 1), so the free cap is not reset by signing in');
select is((select bonus_credits from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000002'), 1, 'Bonus credits carried over');
select is((select count(*)::int from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000001'), 0, 'The anonymous usage row is gone');
select is((select plan from public.profiles where id = 'e1000000-0000-0000-0000-000000000002'), 'pull', 'The higher plan wins');
select is((select display_name from public.profiles where id = 'e1000000-0000-0000-0000-000000000002'), 'Anon Name',
  'The display name carries over when the kept profile has none');

select * from finish();
rollback;
