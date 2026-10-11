-- Raw-clip auto-delete: the pg_cron job is scheduled, and purge_storage asks
-- the Storage API (pg_net) to delete exactly the objects that must not exist:
-- raw clips past the cutoff, raw clips of finished or missing lifts, and
-- keyframes of missing lifts. Lifts that never finished fail and are refunded.
-- The pg_net requests are only queued here and rolled back, never sent.
begin;
create extension if not exists pgtap;
select plan(14);

select is((select schedule from cron.job where jobname = 'catchline-purge-storage'), '*/10 * * * *', 'Purge job runs every 10 minutes');
select is((select command from cron.job where jobname = 'catchline-purge-storage'), 'select public.purge_storage()', 'Purge job calls purge_storage');

delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select is(public.purge_storage(), -1, 'Without the Vault secrets the purge reports -1');
select vault.create_secret('http://purge.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'purge@test.dev', '', now(), now(), now());
update public.usage_counters set lifetime_count = 3 where user_id = 'e1000000-0000-0000-0000-000000000001';

insert into public.lifts (id, user_id, movement, status, clip_path, charged_to, created_at)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'uploading', 'e1/stale', 'cap', now() - interval '25 hours'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'uploading', 'e1/fresh', 'cap', now()),
  ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'done', 'e1/done', 'cap', now());

insert into storage.objects (bucket_id, name, created_at)
values
  ('raw-clips', 'e1/stale', now() - interval '25 hours'),
  ('raw-clips', 'e1/fresh', now() - interval '1 hour'),
  ('raw-clips', 'e1/done', now() - interval '1 hour'),
  ('raw-clips', 'e1/orphan', now() - interval '1 hour'),
  ('keyframes', 'e1/e2000000-0000-0000-0000-000000000003/r1-1-setup.jpg', now()),
  ('keyframes', 'e1/e2000000-0000-0000-0000-00000000dead/r1-1-setup.jpg', now());

select is(public.purge_storage(), 4, 'Purge asks to delete 4 objects');

select is((select count(*)::int from net.http_request_queue where url like 'http://purge.test/%'), 2, 'One bulk DELETE per bucket');
select is((select method from net.http_request_queue where url = 'http://purge.test/storage/v1/object/raw-clips'), 'DELETE', 'Raw clips are deleted via the Storage API');
select is((select (select array_agg(p order by p) from jsonb_array_elements_text(convert_from(body, 'utf8')::jsonb -> 'prefixes') p)
             from net.http_request_queue where url = 'http://purge.test/storage/v1/object/raw-clips'),
          array['e1/done', 'e1/orphan', 'e1/stale'], 'Stale, finished and orphaned raw clips go; the fresh pending one stays');
select is((select convert_from(body, 'utf8')::jsonb -> 'prefixes'
             from net.http_request_queue where url = 'http://purge.test/storage/v1/object/keyframes'),
          '["e1/e2000000-0000-0000-0000-00000000dead/r1-1-setup.jpg"]'::jsonb, 'Only keyframes of a missing lift go');
select is((select headers ->> 'Authorization' from net.http_request_queue where url = 'http://purge.test/storage/v1/object/keyframes'),
          'Bearer test-service-key', 'Requests carry the service key from Vault');

select is((select status || ':' || error from public.lifts where id = 'e2000000-0000-0000-0000-000000000001'), 'failed:expired',
  'A lift still uploading after the cutoff fails as expired');
select is((select lifetime_count from public.usage_counters where user_id = 'e1000000-0000-0000-0000-000000000001'), 2,
  'The expired lift is refunded');
select is((select status from public.lifts where id = 'e2000000-0000-0000-0000-000000000002'), 'uploading', 'A fresh upload is untouched');
select is((select count(*)::int from public.clip_deletions where source = 'purge' and name like 'e1/%'), 4, 'Every deletion is audited');
select isnt((select clip_deleted_at from public.lifts where id = 'e2000000-0000-0000-0000-000000000003'), null, 'The done lift records its clip deletion');

select * from finish();
rollback;
