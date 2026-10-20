-- #82: a lift whose upload never finished (the app was killed mid-upload) fails
-- and is refunded once the app gives up on it (15 minutes, STALE_UPLOAD_MS in
-- src/data/library.ts), not a day later in purge_storage.
begin;
create extension if not exists pgtap;
select plan(9);

select is((select schedule from cron.job where jobname = 'catchline-expire-uploads'), '* * * * *', 'Expiry job runs every minute');
select is((select command from cron.job where jobname = 'catchline-expire-uploads'), 'select public.expire_stale_uploads()',
  'Expiry job calls expire_stale_uploads');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('e8200000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stale82@test.dev', '', now(), now(), now());
update public.usage_counters set lifetime_count = 3, bonus_credits = 0 where user_id = 'e8200000-0000-0000-0000-000000000001';

insert into public.lifts (id, user_id, movement, status, clip_path, charged_to, created_at)
values
  ('e8200000-0000-0000-0000-0000000000a1', 'e8200000-0000-0000-0000-000000000001', 'snatch', 'uploading', 'e82/stale', 'cap', now() - interval '16 minutes'),
  ('e8200000-0000-0000-0000-0000000000a2', 'e8200000-0000-0000-0000-000000000001', 'snatch', 'uploading', 'e82/fresh', 'cap', now() - interval '14 minutes'),
  ('e8200000-0000-0000-0000-0000000000a3', 'e8200000-0000-0000-0000-000000000001', 'snatch', 'queued', 'e82/queued', 'cap', now() - interval '16 minutes'),
  ('e8200000-0000-0000-0000-0000000000a4', 'e8200000-0000-0000-0000-000000000001', 'snatch', 'analysing', 'e82/device', 'cap', now() - interval '16 minutes');

select is(public.expire_stale_uploads(), 1, 'One stale upload expires');
select is((select status || ':' || error from public.lifts where id = 'e8200000-0000-0000-0000-0000000000a1'), 'failed:expired',
  'An upload still unfinished after 15 minutes fails as expired');
select is((select charged_to from public.lifts where id = 'e8200000-0000-0000-0000-0000000000a1'), null, 'and is no longer charged');
select is((select lifetime_count from public.usage_counters where user_id = 'e8200000-0000-0000-0000-000000000001'), 2,
  'The free video comes back');
select is((select array_agg(status order by id) from public.lifts
            where id in ('e8200000-0000-0000-0000-0000000000a2', 'e8200000-0000-0000-0000-0000000000a3', 'e8200000-0000-0000-0000-0000000000a4')),
          array['uploading', 'queued', 'analysing'], 'A fresh upload, a queued lift and an on-device analysis are untouched');

select is(public.expire_stale_uploads(), 0, 'A second run finds nothing');
select is((select lifetime_count from public.usage_counters where user_id = 'e8200000-0000-0000-0000-000000000001'), 2,
  'and refunds nothing twice');

select * from finish();
rollback;
