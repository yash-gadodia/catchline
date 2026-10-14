-- RLS enforcement: owner-only on every table and on the storage buckets.
-- Switches into the authenticated / anon roles with request.jwt.claims so
-- auth.uid() is a real user, and asserts the rows each one can actually touch.
begin;
create extension if not exists pgtap;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-alice@test.dev', '', now(), now(), now()),
  ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-bob@test.dev', '', now(), now(), now());

insert into public.consents (user_id, kind, version, granted)
values ('b1000000-0000-0000-0000-000000000001', 'upload_privacy', '1', true),
       ('b1000000-0000-0000-0000-000000000002', 'upload_privacy', '1', true);

insert into public.lifts (id, user_id, movement, status, clip_path)
values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'snatch', 'done',
   'b1000000-0000-0000-0000-000000000001/b2000000-0000-0000-0000-000000000001'),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'clean', 'uploading',
   'b1000000-0000-0000-0000-000000000001/b2000000-0000-0000-0000-000000000002'),
  ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'jerk', 'uploading',
   'b1000000-0000-0000-0000-000000000002/b2000000-0000-0000-0000-000000000003');

insert into public.analyses (lift_id, user_id, analysis)
values ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '{"version": 1, "id": "rls-a"}');

insert into public.cues (id, user_id, movement, fault_id, text)
values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'snatch', 'hips_rise_early', 'Push the floor away');

insert into public.coach_links (user_id, lift_id)
values ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001');

insert into storage.objects (bucket_id, name)
values ('keyframes', 'b1000000-0000-0000-0000-000000000001/b2000000-0000-0000-0000-000000000001/r1-1-setup.jpg'),
       ('raw-clips', 'b1000000-0000-0000-0000-000000000001/b2000000-0000-0000-0000-000000000001');

-- ---- Bob reads none of Alice's rows ----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from public.lifts where user_id = 'b1000000-0000-0000-0000-000000000001'), 0, 'Bob reads 0 of Alice''s lifts');
select is((select count(*)::int from public.analyses), 0, 'Bob reads 0 analyses');
select is((select count(*)::int from public.cues), 0, 'Bob reads 0 cues');
select is((select count(*)::int from public.coach_links), 0, 'Bob reads 0 coach links');
select is((select count(*)::int from public.consents), 1, 'Bob reads only his own consent');
select is((select count(*)::int from public.usage_counters), 1, 'Bob reads only his own usage row');
select is((select count(*)::int from public.profiles), 1, 'Bob reads only his own profile');
select is((select count(*)::int from storage.objects where bucket_id = 'keyframes'), 0, 'Bob reads 0 of Alice''s keyframes');

update public.cues set status = 'dropped' where id = 'b3000000-0000-0000-0000-000000000001';
delete from public.lifts where id = 'b2000000-0000-0000-0000-000000000001';

select throws_ok($$insert into public.lifts (user_id, movement, clip_path) values ('b1000000-0000-0000-0000-000000000002', 'snatch', 'x/y')$$,
  '42501', null, 'Clients cannot insert lifts directly (create_lift only)');
select throws_ok($$insert into public.analyses (lift_id, user_id, analysis) values ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', '{"version": 1}')$$,
  '42501', null, 'Clients cannot write analyses');
select throws_ok($$update public.lifts set status = 'done'$$, '42501', null, 'Clients cannot update lift status');
select throws_ok($$select * from public.claim_lift_job()$$, '42501', null, 'Clients cannot claim worker jobs');
select throws_ok($$insert into public.consents (user_id, kind, version, granted) values ('b1000000-0000-0000-0000-000000000001', 'upload_privacy', '1', false)$$,
  '42501', null, 'Bob cannot record a consent for Alice');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('raw-clips', 'b1000000-0000-0000-0000-000000000001/b2000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'Bob cannot upload into Alice''s pending lift path');
reset role;

select is((select status from public.cues where id = 'b3000000-0000-0000-0000-000000000001'), 'trying', 'Bob''s update of Alice''s cue changed nothing');
select is((select count(*)::int from public.lifts where id = 'b2000000-0000-0000-0000-000000000001'), 1, 'Bob''s delete of Alice''s lift removed nothing');

-- ---- Alice reads and edits her own -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.lifts), 2, 'Alice reads her 2 lifts');
select is((select analysis ->> 'id' from public.analyses), 'rls-a', 'Alice reads her analysis');
select is((select count(*)::int from public.coach_links), 1, 'Alice reads her coach link');
select is((select count(*)::int from storage.objects where bucket_id = 'keyframes'), 1, 'Alice reads her keyframe');
select is((select count(*)::int from storage.objects where bucket_id = 'raw-clips'), 0, 'Raw clips are never readable by the client, even the owner');

update public.cues set status = 'stuck' where id = 'b3000000-0000-0000-0000-000000000001';
select is((select status from public.cues where id = 'b3000000-0000-0000-0000-000000000001'), 'stuck', 'Alice updates her cue status');
select throws_ok($$update public.cues set text = 'edited'$$, '42501', null, 'Cue text is not client-writable');
select throws_ok($$update public.profiles set plan = 'platform'$$, '42501', null, 'Plan is not client-writable');
update public.profiles set push_token = 'ExponentPushToken[alice]';
select is((select push_token from public.profiles where id = 'b1000000-0000-0000-0000-000000000001'),
  'ExponentPushToken[alice]', 'Alice registers her own push token');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('raw-clips', 'b1000000-0000-0000-0000-000000000001/b2000000-0000-0000-0000-000000000002')$$,
  'Alice uploads into her own pending lift path');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('raw-clips', 'b1000000-0000-0000-0000-000000000001/somewhere-else')$$,
  '42501', null, 'Alice cannot upload a raw clip outside a pending lift');
reset role;

-- ---- the push token is owner-scoped ------------------------------------------
select is((select count(*)::int from public.profiles where push_token is not null), 1,
  'An unscoped token update under RLS reaches only the caller''s own profile');
select is((select push_token from public.profiles where id = 'b1000000-0000-0000-0000-000000000002'), null::text,
  'Bob''s profile has no token after Alice''s update');

-- ---- anon reads nothing -----------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select count(*) from public.lifts$$, '42501', null, 'anon has no access to lifts');
select throws_ok($$select count(*) from public.coach_links$$, '42501', null, 'anon has no access to coach_links');
reset role;

select * from finish();
rollback;
