-- shared-clips (0021): the owner uploads only under their own folder, nobody reads back,
-- and purge_shared_clips deletes clips past 30 days or whose account is gone.
begin;
create extension if not exists pgtap;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('c3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'share-alice@test.dev', '', now(), now(), now());

select is((select public from storage.buckets where id = 'shared-clips'), false, 'the bucket is private');
select is((select command from cron.job where jobname = 'catchline-purge-shared-clips'), 'select public.purge_shared_clips()', 'the purge job is scheduled');

set local role authenticated;
set local request.jwt.claims = '{"sub": "c3000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('shared-clips', 'c3000000-0000-0000-0000-000000000001/lift-1.mp4', 'c3000000-0000-0000-0000-000000000001')$$,
  'the owner uploads into their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('shared-clips', 'c3000000-0000-0000-0000-000000000009/lift-2.mp4')$$,
  '42501', null, 'not into someone else''s folder'
);
select is((select count(*) from storage.objects where bucket_id = 'shared-clips')::int, 0, 'the owner cannot list shared clips back');

reset role;
delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select vault.create_secret('http://purge.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');
insert into storage.objects (bucket_id, name, created_at) values
  ('shared-clips', 'c3000000-0000-0000-0000-000000000001/old.mp4', now() - interval '31 days'),
  ('shared-clips', 'c3000000-0000-0000-0000-000000000099/gone.mp4', now());
select is(public.purge_shared_clips(), 2, 'the old clip and the clip of a deleted account are purged; the fresh one stays');
select is((select count(*) from public.clip_deletions where bucket = 'shared-clips')::int, 2, 'both deletions are logged');

select * from finish();
rollback;
