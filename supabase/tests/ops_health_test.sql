-- Ops monitoring: worker_heartbeat is service-role only, the health numbers
-- are right at fixed timestamps, and one incident opens exactly one alert per
-- kind that closes (with a recovery post) when the condition clears.
-- The pg_net requests are only queued here and rolled back, never sent.
begin;
create extension if not exists pgtap;
select plan(27);

select is((select schedule from cron.job where jobname = 'catchline-health'), '*/5 * * * *', 'Health job runs every 5 minutes');
select is((select command from cron.job where jobname = 'catchline-health'), 'select public.ops_health_check()', 'Health job calls ops_health_check');

-- ---- grants ----------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.worker_heartbeat(text, text)', 'execute'), 'anon cannot call worker_heartbeat');
select ok(not has_function_privilege('authenticated', 'public.worker_heartbeat(text, text)', 'execute'), 'authenticated cannot call worker_heartbeat');
select ok(has_function_privilege('service_role', 'public.worker_heartbeat(text, text)', 'execute'), 'service_role can call worker_heartbeat');
select ok(not has_function_privilege('authenticated', 'public.ops_health_check(timestamptz)', 'execute'), 'authenticated cannot run the health check');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.worker_heartbeat('evil', 'x')$$, '42501', null, 'A signed-in client cannot write a heartbeat');
select throws_ok($$select * from public.worker_heartbeats$$, '42501', null, 'A signed-in client cannot read heartbeats');
select throws_ok($$select * from public.ops_alerts$$, '42501', null, 'A signed-in client cannot read ops alerts');
reset role;
set local role anon;
select throws_ok($$select * from public.worker_heartbeats$$, '42501', null, 'anon cannot read heartbeats');
reset role;

delete from public.worker_heartbeats;
delete from public.ops_alerts;
delete from public.lifts where status in ('queued', 'processing', 'failed');

set local role service_role;
select public.worker_heartbeat('mini', 'abc123');
reset role;
select is((select version from public.worker_heartbeats where worker_id = 'mini'), 'abc123', 'The service role writes a heartbeat');
delete from public.worker_heartbeats;

-- ---- no Vault: nothing changes ---------------------------------------------
delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select is(public.ops_health_check('2030-01-01 12:00+00'), null, 'Without the Vault secrets the check returns null');
select is((select count(*)::int from public.ops_alerts), 0, 'and opens no alert');
select vault.create_secret('http://ops.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');

-- ---- healthy at T ----------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ops@test.dev', '', now(), now(), now());

insert into public.worker_heartbeats (worker_id, seen_at, version) values ('mini', '2030-01-01 11:59+00', 'abc123');
insert into public.lifts (id, user_id, movement, status, clip_path, queued_at, processed_at)
values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'queued', 'f1/q', '2030-01-01 11:58+00', null),
  ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'failed', 'f1/f1', null, '2030-01-01 11:50+00'),
  ('f2000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'failed', 'f1/f2', null, '2030-01-01 11:50+00'),
  ('f2000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'failed', 'f1/f3', null, '2030-01-01 11:50+00'),
  ('f2000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000001', 'snatch', 'failed', 'f1/f-old', null, '2030-01-01 11:20+00');

select is(public.ops_health_check('2030-01-01 12:00+00'),
  '{"health": {"stuck": 0, "oldest_min": 2, "worker_seen_min": 1, "failed_30m": 3}, "changes": []}'::jsonb,
  'Healthy: a 2-min queue, a 1-min-old heartbeat and 3 failures in 30 min raise nothing');

-- ---- broken at T: queue 12 min old, worker silent 12 min, 4 failures --------
update public.lifts set queued_at = '2030-01-01 11:48+00' where id = 'f2000000-0000-0000-0000-000000000001';
update public.worker_heartbeats set seen_at = '2030-01-01 11:48+00';
update public.lifts set processed_at = '2030-01-01 11:55+00' where id = 'f2000000-0000-0000-0000-000000000005';

select is(public.ops_health_check('2030-01-01 12:00+00') -> 'changes',
  '[{"kind": "failures", "state": "open"}, {"kind": "queue_stuck", "state": "open"}, {"kind": "worker_silent", "state": "open"}]'::jsonb,
  'All three conditions open at once');
select is((select count(*)::int from public.ops_alerts where closed_at is null), 3, 'Three open alerts');
select is((select count(*)::int from net.http_request_queue where url = 'http://ops.test/functions/v1/ops-alert'), 1, 'One post to ops-alert');
select is((select convert_from(body, 'utf8')::jsonb -> 'health' from net.http_request_queue where url = 'http://ops.test/functions/v1/ops-alert'),
  '{"stuck": 1, "oldest_min": 12, "worker_seen_min": 12, "failed_30m": 4}'::jsonb, 'The post carries the health numbers');
select is((select headers ->> 'Authorization' from net.http_request_queue where url = 'http://ops.test/functions/v1/ops-alert'),
  'Bearer test-service-key', 'The post carries the service key from Vault');

-- ---- still broken 5 min later: deduped -------------------------------------
select is(public.ops_health_check('2030-01-01 12:05+00') -> 'changes', '[]'::jsonb, 'The same incident does not alert again');
select is((select count(*)::int from public.ops_alerts), 3, 'Still one row per kind');
select is((select count(*)::int from net.http_request_queue where url = 'http://ops.test/functions/v1/ops-alert'), 1, 'No second post');

-- ---- recovered at T+40 -----------------------------------------------------
update public.lifts set status = 'done', processed_at = '2030-01-01 12:30+00' where id = 'f2000000-0000-0000-0000-000000000001';
update public.worker_heartbeats set seen_at = '2030-01-01 12:39+00';
select is(public.ops_health_check('2030-01-01 12:40+00') -> 'changes',
  '[{"kind": "failures", "state": "resolved"}, {"kind": "queue_stuck", "state": "resolved"}, {"kind": "worker_silent", "state": "resolved"}]'::jsonb,
  'All three resolve once the queue moves, the worker beats and the failures age out');
select is((select count(*)::int from public.ops_alerts where closed_at = '2030-01-01 12:40+00'), 3, 'Each alert is closed at the check time');
select is((select count(*)::int from net.http_request_queue where url = 'http://ops.test/functions/v1/ops-alert'), 2, 'One recovery post');

-- ---- a new incident opens a new alert --------------------------------------
select is(public.ops_health_check('2030-01-01 12:45+00') -> 'changes',
  '[{"kind": "worker_silent", "state": "open"}]'::jsonb, 'Silent again after 6 min: a new incident');
select is((select count(*)::int from public.ops_alerts where kind = 'worker_silent'), 2, 'It is a second worker_silent row');

select * from finish();
rollback;
