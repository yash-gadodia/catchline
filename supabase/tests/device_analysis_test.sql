-- On-device analysis (0018): only the owner moves a lift through analysing to
-- done or failed, a second save or fail counts nothing twice, the cap is charged
-- once and refunded once, the worker path still writes the same cue memory
-- through the shared finish, an abandoned analysing lift expires, and
-- delete_my_server_analyses forgets the caller's analyses (and only theirs)
-- while keeping the per-lift cue record.
begin;
create extension if not exists pgtap;
select plan(45);

select pgmq.purge_queue('lift_jobs');
delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select vault.create_secret('http://device.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-alice@test.dev', '', now(), now(), now()),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-bob@test.dev', '', now(), now(), now());
insert into public.consents (user_id, kind, version, granted)
values ('e1000000-0000-0000-0000-000000000001', 'upload_privacy', '1', true),
       ('e1000000-0000-0000-0000-000000000002', 'upload_privacy', '1', true);

create temp table t (k text primary key, id uuid, cue uuid) on commit drop;
grant all on t to authenticated, service_role;

-- ---- Alice (free, 3 for life): start, save ----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into t (k, id) select 'a', id from public.create_lift('snatch', 80);
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000001'), 1,
  'create_lift charges the cap before the phone analyses');
select throws_ok($$select public.save_device_analysis((select id from t where k = 'a'), '{"faultId": "hips_rise_early", "text": "Chest up", "why": "w"}')$$,
  'P0001', 'lift_not_analysing', 'No save before the analysis was started');
select is((public.start_device_analysis((select id from t where k = 'a'))).status, 'analysing', 'start marks the lift analysing');
select is((select pose_source from public.lifts where id = (select id from t where k = 'a')), 'on_device', 'and on_device');
select throws_ok($$select public.start_device_analysis((select id from t where k = 'a'))$$, 'P0001', 'lift_not_uploading',
  'A lift is started once');
select throws_ok($$select public.save_device_analysis((select id from t where k = 'a'), '{"text": "no fault"}')$$, 'P0001', 'bad_cue',
  'A cue needs a faultId and text');

select is(public.save_device_analysis((select id from t where k = 'a'), '{"faultId": "hips_rise_early", "text": "Chest up", "why": "w"}') ->> 'status',
  'done', 'The phone saves its result');
update t set cue = (select cue_id from public.lifts where id = (select id from t where k = 'a')) where k = 'a';
select is((select status || '|' || coalesce(no_cue_code, '-') from public.lifts where id = (select id from t where k = 'a')), 'done|-', 'The lift is done');
select is((select text || '|' || sessions from public.cues where id = (select cue from t where k = 'a')), 'Chest up|1',
  'The cue starts at one session and the lift records it');
select is((select count(*)::int from public.analyses where lift_id = (select id from t where k = 'a')), 0, 'No analysis row is written');

select is(public.save_device_analysis((select id from t where k = 'a'), '{"faultId": "hips_rise_early", "text": "Again", "why": "w"}') ->> 'duplicate',
  'true', 'A second save is a duplicate');
select is((select text || '|' || sessions from public.cues where id = (select cue from t where k = 'a')), 'Chest up|1',
  'and counts nothing');
select is(public.fail_device_lift((select id from t where k = 'a'), 'no_person'), 'done', 'A fail after done changes nothing');
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000001'), 1,
  'and refunds nothing');

-- ---- same fault again: one more session; no cue: the code is kept ---------------------
insert into t (k, id) select 'b', id from public.create_lift('snatch', 82);
select public.start_device_analysis((select id from t where k = 'b'));
select is(public.save_device_analysis((select id from t where k = 'b'), '{"faultId": "hips_rise_early", "text": "Push the floor", "why": "w"}') ->> 'cue_id',
  (select cue from t where k = 'a')::text, 'The same active fault is the same cue');
select is((select text || '|' || sessions from public.cues where id = (select cue from t where k = 'a')), 'Push the floor|2',
  'with one more session and the newest wording');

insert into t (k, id) select 'c', id from public.create_lift('snatch', 84);
select public.start_device_analysis((select id from t where k = 'c'));
select is(public.save_device_analysis((select id from t where k = 'c'), null, 'off_side_on') ->> 'status', 'done',
  'A measured lift without a cue completes');
select is((select coalesce(cue_id::text, '-') || '|' || no_cue_code from public.lifts where id = (select id from t where k = 'c')), '-|off_side_on',
  'and keeps why there was none');
select throws_ok($$select public.create_lift('snatch', 86)$$, 'P0001', 'cap_reached', 'Three free lifts used');

-- ---- fail: refund exactly once -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into t (k, id) select 'bob', id from public.create_lift('clean', 100);
select public.start_device_analysis((select id from t where k = 'bob'));
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000002'), 1, 'Bob is charged');
select is(public.fail_device_lift((select id from t where k = 'bob'), 'no_reps'), 'failed', 'Bob''s phone fails the lift');
select is((select status || ':' || error from public.lifts where id = (select id from t where k = 'bob')), 'failed:no_reps', 'with its code');
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000002'), 0, 'and is refunded');
select is(public.fail_device_lift((select id from t where k = 'bob'), 'no_reps'), 'failed', 'A second fail is a no-op');
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000002'), 0, 'No double refund');
select is(public.save_device_analysis((select id from t where k = 'bob'), null) ->> 'status', 'failed',
  'A save after the fail changes nothing');

-- a lift that never got started (the clip was too long) can still be given back
insert into t (k, id) select 'bob2', id from public.create_lift('clean', 100);
select is(public.fail_device_lift((select id from t where k = 'bob2'), 'clip_too_long'), 'failed', 'An uploading lift can be failed by its owner');
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000002'), 0, 'and refunded');

-- ---- ownership ---------------------------------------------------------------------
insert into t (k, id) select 'bob3', id from public.create_lift('clean', 100);
select public.start_device_analysis((select id from t where k = 'bob3'));
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.start_device_analysis((select id from t where k = 'bob3'))$$, 'P0001', 'lift_not_found', 'Alice cannot start Bob''s lift');
select throws_ok($$select public.save_device_analysis((select id from t where k = 'bob3'), null)$$, 'P0001', 'lift_not_found', 'nor save it');
select throws_ok($$select public.fail_device_lift((select id from t where k = 'bob3'), 'x')$$, 'P0001', 'lift_not_found', 'nor fail it');
select throws_ok($$select public.record_lift_outcome((select l from public.lifts l where id = (select id from t where k = 'bob3')), null, null, null)$$,
  '42501', null, 'Clients cannot call the shared finish');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.save_device_analysis('e1000000-0000-0000-0000-000000000001', null)$$, '42501', null, 'anon cannot save');
select throws_ok($$select public.delete_my_server_analyses()$$, '42501', null, 'anon cannot delete analyses');
reset role;

-- ---- the worker path still finishes the same way ----------------------------------
insert into public.lifts (id, user_id, movement, status, clip_path)
values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'processing', 'e1/w');
select is(public.complete_lift_job(0, 'e2000000-0000-0000-0000-000000000001',
  '{"version": 1, "id": "w", "cue": {"faultId": "hips_rise_early", "text": "Worker wording", "why": "w"}, "noCueReason": null, "failure": null}') ->> 'cue_id',
  (select cue from t where k = 'a')::text, 'complete_lift_job lands on the same cue');
select is((select text || '|' || sessions from public.cues where id = (select cue from t where k = 'a')), 'Worker wording|3',
  'and adds its session');
select is((select cue_id from public.lifts where id = 'e2000000-0000-0000-0000-000000000001'), (select cue from t where k = 'a'),
  'and records the cue on the lift');

-- ---- an abandoned analysing lift expires and is refunded -----------------------------
insert into public.lifts (id, user_id, movement, status, clip_path, charged_to, created_at)
values ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'snatch', 'analysing', 'e2/old', 'cap', now() - interval '2 days');
update public.usage_counters set lifetime_count = 1 where user_id = 'e1000000-0000-0000-0000-000000000002';
select public.purge_storage();
select is((select status || ':' || error from public.lifts where id = 'e2000000-0000-0000-0000-000000000002'), 'failed:expired',
  'A lift left analysing expires');
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000002'), 0, 'and is refunded');

-- ---- delete_my_server_analyses ----------------------------------------------------------
-- the worker lift has an analysis; a 3.0-era lift of Alice's has one but no cue_id yet; Bob's stays
insert into public.lifts (id, user_id, movement, status, clip_path)
values ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'done', 'e1/old'),
       ('e2000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000002', 'clean', 'done', 'e2/keep');
insert into public.analyses (lift_id, user_id, analysis)
values ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001',
        '{"version": 1, "id": "old", "cue": {"faultId": "hips_rise_early", "text": "Old", "why": "w"}, "noCueReason": null}'),
       ('e2000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000002',
        '{"version": 1, "id": "keep", "cue": null, "noCueReason": {"code": "bar_lost"}}');
insert into public.analysis_history (lift_id, analysis, analysed_at)
values ('e2000000-0000-0000-0000-000000000003', '{"version": 1}', now());
insert into storage.objects (bucket_id, name)
values ('keyframes', 'e1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000003/catch.jpg'),
       ('lift-traces', 'e1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000003.json.gz'),
       ('keyframes', 'e1000000-0000-0000-0000-000000000002/e2000000-0000-0000-0000-000000000004/catch.jpg');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.delete_my_server_analyses(), 2, 'Alice''s two analyses are dropped');
select is(public.delete_my_server_analyses(), 0, 'A second call finds nothing');
reset role;

select is((select cue_id from public.lifts where id = 'e2000000-0000-0000-0000-000000000003'), (select cue from t where k = 'a'),
  'The old lift keeps which cue it was, read from its analysis first');
select is((select count(*)::int from public.analysis_history where lift_id = 'e2000000-0000-0000-0000-000000000003'), 0, 'Its history goes too');
select is((select count(*)::int from public.analyses where user_id = 'e1000000-0000-0000-0000-000000000002'), 1, 'Bob''s analysis stays');
select is((select array_agg(name order by name) from public.clip_deletions where source = 'owner'),
  array['e1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000003.json.gz',
        'e1000000-0000-0000-0000-000000000001/e2000000-0000-0000-0000-000000000003/catch.jpg'],
  'Storage is asked for Alice''s still and trace only, audited as hers');

select * from finish();
rollback;
