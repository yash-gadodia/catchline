-- On-device pose (0010): the client may upload '<clip_path>.pose.json' into its own
-- pending lift and nowhere else, never read it back; enqueue_lift marks the lift
-- pose_source 'device' only when the object is really there; the pose object is
-- purged and audited with its clip, and a pending lift's pose is not an orphan.
begin;
create extension if not exists pgtap;
select plan(16);

select pgmq.purge_queue('lift_jobs');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pose-a@test.dev', '', now(), now(), now()),
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pose-b@test.dev', '', now(), now(), now());
update public.profiles set plan = 'pull' where id in ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002');
insert into public.consents (user_id, kind, version, granted)
values ('d1000000-0000-0000-0000-000000000001', 'upload_privacy', '1', true),
       ('d1000000-0000-0000-0000-000000000002', 'upload_privacy', '1', true);

create temp table t (k text primary key, id uuid, path text) on commit drop;
grant all on t to authenticated, service_role;

select ok((select 'application/json' = any (allowed_mime_types) from storage.buckets where id = 'raw-clips'),
  'raw-clips accepts the JSON pose object');

-- ---- Alice: one lift with a pose, one without --------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into t (k, id, path) select 'pose', id, clip_path from public.create_lift('snatch', 80);
insert into t (k, id, path) select 'plain', id, clip_path from public.create_lift('snatch', 80);
select is((select pose_source from public.lifts where id = (select id from t where k = 'pose')), 'server', 'A new lift defaults to server pose');

select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('raw-clips', %L)$$, (select path from t where k = 'pose')),
  'Alice uploads her clip');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('raw-clips', %L)$$, (select path || '.pose.json' from t where k = 'pose')),
  'Alice uploads the pose next to her pending clip');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('raw-clips', %L)$$, (select path || '.pose.json.mp4' from t where k = 'pose')),
  '42501', null, 'Any other suffix is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('raw-clips', 'd1000000-0000-0000-0000-000000000001/nolift.pose.json')$$,
  '42501', null, 'A pose without a pending lift is refused');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('raw-clips', %L)$$, (select path from t where k = 'plain')),
  'Alice uploads her second clip, with no pose');
select is((select count(*)::int from storage.objects where bucket_id = 'raw-clips'), 0, 'The client still reads no raw-clips object, pose included');

select is((public.enqueue_lift((select id from t where k = 'pose'))).pose_source, 'device', 'Enqueue with the pose object marks the lift device');
select is((public.enqueue_lift((select id from t where k = 'plain'))).pose_source, 'server', 'Enqueue without one keeps server');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('raw-clips', %L)$$, (select path || '.pose.json' from t where k = 'plain')),
  '42501', null, 'No pose once the lift has left uploading');

-- ---- Bob cannot write into Alice's lift ----------------------------------------------
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
insert into t (k, id, path) select 'bob', id, clip_path from public.create_lift('snatch', 60);
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('raw-clips', %L)$$,
  'd1000000-0000-0000-0000-000000000001/' || split_part((select path from t where k = 'bob'), '/', 2) || '.pose.json'),
  '42501', null, 'Bob cannot put a pose under Alice''s folder');
reset role;

-- ---- worker delete audit -------------------------------------------------------------
select public.mark_clip_deleted((select id from t where k = 'pose'));
select is((select array_agg(name order by name) from public.clip_deletions where lift_id = (select id from t where k = 'pose')),
  array[(select path from t where k = 'pose'), (select path || '.pose.json' from t where k = 'pose')],
  'A device lift audits the clip and the pose deletion');

-- ---- purge: pending pose stays, finished and orphaned poses go ------------------------
delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select vault.create_secret('http://pose-purge.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');
update public.lifts set status = 'done' where id = (select id from t where k = 'pose');
insert into storage.objects (bucket_id, name)
values ('raw-clips', (select path from t where k = 'bob')),
       ('raw-clips', (select path || '.pose.json' from t where k = 'bob')),
       ('raw-clips', 'd1000000-0000-0000-0000-000000000002/orphan.pose.json');

select is(public.purge_storage(), 3, 'Purge deletes the done clip, its pose and the orphan pose');
select is((select (select array_agg(p order by p) from jsonb_array_elements_text(convert_from(body, 'utf8')::jsonb -> 'prefixes') p)
             from net.http_request_queue where url = 'http://pose-purge.test/storage/v1/object/raw-clips'),
          array[(select path from t where k = 'pose'), (select path || '.pose.json' from t where k = 'pose'),
                'd1000000-0000-0000-0000-000000000002/orphan.pose.json'],
          'The pending lift''s clip and pose stay; the done lift''s pair and the orphan go');
select is((select lift_id from public.clip_deletions where source = 'purge' and name = (select path || '.pose.json' from t where k = 'pose')),
  (select id from t where k = 'pose'), 'The purged pose is audited against its lift');

select * from finish();
rollback;
