-- The job queue and cue memory: enqueue needs the uploaded object, the worker
-- claims through pgmq, completion writes the analysis and the cue (same active
-- fault = one more session), retries and the attempt limit behave, and the
-- realtime publication carries lifts and analyses.
begin;
create extension if not exists pgtap;
select plan(25);

select pgmq.purge_queue('lift_jobs');

select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lifts'), 'lifts is in supabase_realtime');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'analyses'), 'analyses is in supabase_realtime');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'queue@test.dev', '', now(), now(), now());
update public.profiles set plan = 'pull' where id = 'f1000000-0000-0000-0000-000000000001';
insert into public.consents (user_id, kind, version, granted) values ('f1000000-0000-0000-0000-000000000001', 'upload_privacy', '1', true);

create temp table t (k text primary key, id uuid, msg bigint) on commit drop;
grant all on t to authenticated, service_role;

-- ---- create + enqueue as the user ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into t (k, id) select 'a', id from public.create_lift('snatch', 80);
select is((select status from public.lifts where id = (select id from t where k = 'a')), 'uploading', 'A new lift waits for its upload');
select throws_ok($$select public.enqueue_lift((select id from t where k = 'a'))$$, 'P0001', 'clip_missing', 'Enqueue needs the uploaded clip');
reset role;

insert into storage.objects (bucket_id, name) select 'raw-clips', clip_path from public.lifts where id = (select id from t where k = 'a');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((public.enqueue_lift((select id from t where k = 'a'))).status, 'queued', 'Enqueue queues the lift');
select throws_ok($$select public.enqueue_lift((select id from t where k = 'a'))$$, 'P0001', 'lift_not_uploading', 'A lift is enqueued once');
select throws_ok($$select * from public.complete_lift_job(1, (select id from t where k = 'a'), '{"version": 1}')$$, '42501', null,
  'Clients cannot complete jobs');
reset role;

select is((select queue_length from pgmq.metrics('lift_jobs')), 1::bigint, 'One job in the queue');

-- ---- worker claims and completes ---------------------------------------------------
set local role service_role;
update t set msg = c.msg_id from public.claim_lift_job() c where t.k = 'a' and c.lift_id = t.id;
select isnt((select msg from t where k = 'a'), null, 'The worker claims the job');
select is((select status from public.lifts where id = (select id from t where k = 'a')), 'processing', 'Claiming marks the lift processing');
select is((select count(*)::int from public.claim_lift_job()), 0, 'A claimed job is invisible to a second worker');

select is(public.complete_lift_job((select msg from t where k = 'a'), (select id from t where k = 'a'),
  '{"version": 1, "id": "q-a", "cue": {"faultId": "hips_rise_early", "text": "Chest up off the floor", "why": "Hips rose 9 cm before the shoulders"}, "failure": null}') ->> 'status',
  'done', 'Completion marks the lift done');
reset role;

select is((select analysis ->> 'id' from public.analyses where lift_id = (select id from t where k = 'a')), 'q-a', 'The analysis row is written');
select is((select text || '|' || sessions from public.cues where user_id = 'f1000000-0000-0000-0000-000000000001'), 'Chest up off the floor|1',
  'The first cue starts at one session');
select is((select queue_length from pgmq.metrics('lift_jobs')), 0::bigint, 'The job is archived');

-- ---- same fault again: one more session on the same cue ----------------------------------
insert into public.lifts (id, user_id, movement, status, clip_path)
values ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'processing', 'f1/b');
select is(public.complete_lift_job(0, 'f2000000-0000-0000-0000-000000000002',
  '{"version": 1, "cue": {"faultId": "hips_rise_early", "text": "Push the floor away", "why": "w"}, "failure": null}') ->> 'status', 'done',
  'Second lift completes');
select is((select text || '|' || sessions from public.cues where user_id = 'f1000000-0000-0000-0000-000000000001'), 'Push the floor away|2',
  'The same active fault adds a session and takes the newest wording');

update public.cues set status = 'stuck' where user_id = 'f1000000-0000-0000-0000-000000000001';
insert into public.lifts (id, user_id, movement, status, clip_path)
values ('f2000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'processing', 'f1/c');
select public.complete_lift_job(0, 'f2000000-0000-0000-0000-000000000003',
  '{"version": 1, "cue": {"faultId": "hips_rise_early", "text": "Chest up", "why": "w"}, "failure": null}');
select is((select count(*)::int from public.cues where user_id = 'f1000000-0000-0000-0000-000000000001'), 2,
  'A fault that comes back after "stuck" starts a new cue');

select throws_ok($$select public.complete_lift_job(0, 'f2000000-0000-0000-0000-000000000003', '{"version": 2}')$$, 'P0001', 'bad_analysis_version',
  'Only contract version 1 is accepted');

-- ---- retry, then the attempt limit ----------------------------------------------------------
insert into public.lifts (id, user_id, movement, status, clip_path, charged_to)
values ('f2000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'queued', 'f1/d', 'cap');
update public.usage_counters set period_count = 5 where user_id = 'f1000000-0000-0000-0000-000000000001';
insert into t (k, msg) select 'd', pgmq.send('lift_jobs', '{"lift_id": "f2000000-0000-0000-0000-000000000004"}');

select is((select attempt from public.claim_lift_job(0, 2)), 1, 'First claim is attempt 1');
select is(public.fail_lift_job((select msg from t where k = 'd'), 'f2000000-0000-0000-0000-000000000004', 'network', true), 'queued',
  'A retryable failure puts the lift back in the queue');
update pgmq.q_lift_jobs set vt = now() where msg_id = (select msg from t where k = 'd');
select is((select attempt from public.claim_lift_job(0, 2)), 2, 'The retry is attempt 2');
select is((select count(*)::int from public.claim_lift_job(0, 2)), 0, 'Attempt 3 exceeds the limit of 2 and is not handed out');
select is((select status || ':' || error from public.lifts where id = 'f2000000-0000-0000-0000-000000000004'), 'failed:too_many_attempts',
  'The lift fails after too many attempts');
select is((select period_count from public.usage_counters where user_id = 'f1000000-0000-0000-0000-000000000001'), 4,
  'and is refunded');

select * from finish();
rollback;
