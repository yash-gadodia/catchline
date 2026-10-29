-- problem-shots (0022): the owner uploads only under their own folder, nobody reads back,
-- and purge_problem_shots deletes shots past 90 days or whose account is gone.
begin;
create extension if not exists pgtap;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('c4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shot-alice@test.dev', '', now(), now(), now());

select is((select public from storage.buckets where id = 'problem-shots'), false, 'the bucket is private');
select is((select command from cron.job where jobname = 'catchline-purge-problem-shots'), 'select public.purge_problem_shots()', 'the purge job is scheduled');

set local role authenticated;
set local request.jwt.claims = '{"sub": "c4000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('problem-shots', 'c4000000-0000-0000-0000-000000000001/report-1.jpg', 'c4000000-0000-0000-0000-000000000001')$$,
  'the owner uploads into their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('problem-shots', 'c4000000-0000-0000-0000-000000000009/report-2.jpg')$$,
  '42501', null, 'not into someone else''s folder'
);
select is((select count(*) from storage.objects where bucket_id = 'problem-shots')::int, 0, 'the owner cannot list shots back');

reset role;
delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select vault.create_secret('http://purge.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');
insert into storage.objects (bucket_id, name, created_at) values
  ('problem-shots', 'c4000000-0000-0000-0000-000000000001/old.jpg', now() - interval '91 days'),
  ('problem-shots', 'c4000000-0000-0000-0000-000000000099/gone.jpg', now());
select is(public.purge_problem_shots(), 2, 'the old shot and the shot of a deleted account are purged; the fresh one stays');
select is((select count(*) from public.clip_deletions where bucket = 'problem-shots')::int, 2, 'both deletions are logged');

select * from finish();
rollback;
