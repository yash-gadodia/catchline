-- plate_frames (0024): crops go up only with the 'plate_frames' consent and only through
-- record_plate_frame; nobody reads them back; the owner deletes what they sent; the
-- account deletion and the purge take the rest.
begin;
create extension if not exists pgtap;
select plan(35);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('c5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plate-alice@test.dev', '', now(), now(), now()),
  ('c5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plate-bob@test.dev', '', now(), now(), now()),
  ('c5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plate-cara@test.dev', '', now(), now(), now()),
  ('c5000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plate-anon@test.dev', '', now(), now(), now());

delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select vault.create_secret('http://plates.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');

select is((select public from storage.buckets where id = 'plate-frames'), false, 'the bucket is private');
select is((select file_size_limit from storage.buckets where id = 'plate-frames'), 524288::bigint, 'a crop is at most 512 KB');
select is((select command from cron.job where jobname = 'catchline-purge-plate-frames'), 'select public.purge_plate_frames()', 'the purge job is scheduled');

-- Alice, before she has agreed to anything
set local role authenticated;
set local request.jwt.claims = '{"sub": "c5000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('plate-frames', 'c5000000-0000-0000-0000-000000000001/c5100000-0000-0000-0000-000000000001.jpg', 'c5000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'no upload without the consent'
);
select throws_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000001', '{"kind": "mark", "frame": 0, "x": 0.5, "y": 0.5, "r": 0.1667, "crop_px": 512, "crop_left": 0.1, "crop_top": 0.4, "crop_side": 0.3}')$$,
  'P0001', 'consent_required', 'no record without the consent'
);

-- she opts in
select lives_ok($$insert into public.consents (kind, version, granted) values ('plate_frames', '1', true)$$, 'the consent kind is accepted');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('plate-frames', 'c5000000-0000-0000-0000-000000000001/c5100000-0000-0000-0000-000000000001.jpg', 'c5000000-0000-0000-0000-000000000001')$$,
  'with the consent the owner uploads into their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('plate-frames', 'c5000000-0000-0000-0000-000000000002/c5100000-0000-0000-0000-000000000009.jpg')$$,
  '42501', null, 'not into someone else''s folder'
);
select is((select count(*) from storage.objects where bucket_id = 'plate-frames')::int, 0, 'the owner cannot list crops back');
select lives_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000001', '{"kind": "mark", "lift_id": "lift-1", "frame": 0, "x": 0.5, "y": 0.5, "r": 0.1667, "crop_px": 512, "crop_left": 0.1, "crop_top": 0.4, "crop_side": 0.3, "clip_fps": 60, "clip_width": 1080, "clip_height": 1920, "app_version": "4.0.1", "update_id": "embedded", "model_version": "rules"}')$$,
  'the crop is recorded'
);
select lives_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000001', '{"kind": "mark", "frame": 0, "x": 0.1, "y": 0.1, "r": 0.2, "crop_px": 512, "crop_left": 0, "crop_top": 0, "crop_side": 0.3}')$$,
  'a resend of the same id changes nothing'
);
select throws_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000002', '{"kind": "track", "frame": 9, "x": 0.5, "y": 0.5, "crop_px": 512, "crop_left": 0, "crop_top": 0, "crop_side": 0.3}')$$,
  'P0001', 'frame_missing', 'a record needs its crop in the bucket'
);
select throws_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000001', '{"kind": "video", "frame": 0, "x": 0.5, "y": 0.5, "r": 0.1, "crop_px": 512, "crop_left": 0, "crop_top": 0, "crop_side": 0.3}')$$,
  'P0001', 'bad_frame', 'only a mark, a correction or a tracked frame'
);
select throws_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000003', '{"kind": "correction", "frame": 4, "x": 0.5, "y": 0.5, "crop_px": 512, "crop_left": 0, "crop_top": 0, "crop_side": 0.3}')$$,
  'P0001', 'bad_frame', 'a strong label needs its radius'
);
select throws_ok(
  $$insert into public.plate_frames (id, user_id, object_name, kind, frame, x, y, crop_px, crop_left, crop_top, crop_side)
    values ('c5100000-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000001', 'x', 'track', 0, 0.5, 0.5, 512, 0, 0, 0.3)$$,
  '42501', null, 'no insert past the function'
);
select throws_ok($$select * from public.plate_frames$$, '42501', null, 'the owner cannot read rows back');
select throws_ok($$select public.delete_plate_frames('c5000000-0000-0000-0000-000000000001')$$, '42501', null, 'the by-user delete is not the client''s');

-- Bob
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "c5000000-0000-0000-0000-000000000002", "role": "authenticated"}';
select throws_ok($$select * from public.plate_frames$$, '42501', null, 'another user reads no rows');
select is((select count(*) from storage.objects where bucket_id = 'plate-frames')::int, 0, 'another user sees 0 crops');
select is(public.delete_my_plate_frames(), 0, 'another user deletes none of Alice''s');

-- anon
reset role;
set local role anon;
select throws_ok($$select * from public.plate_frames$$, '42501', null, 'anon reads nothing');
select throws_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000005', '{"kind": "track", "frame": 0, "x": 0.5, "y": 0.5, "crop_px": 512, "crop_left": 0, "crop_top": 0, "crop_side": 0.3}')$$,
  '42501', null, 'anon records nothing'
);
select throws_ok($$select public.delete_my_plate_frames()$$, '42501', null, 'anon deletes nothing');

reset role;
select is(
  (select array[kind, object_name, consent_version, r::numeric(5,4)::text] from public.plate_frames where user_id = 'c5000000-0000-0000-0000-000000000001'),
  array['mark', 'c5000000-0000-0000-0000-000000000001/c5100000-0000-0000-0000-000000000001.jpg', '1', '0.1667'],
  'one row, the first send, under the server''s own path and the consent version on file'
);

-- she withdraws: nothing more goes up, what she sent stays until she deletes it
set local role authenticated;
set local request.jwt.claims = '{"sub": "c5000000-0000-0000-0000-000000000001", "role": "authenticated"}';
insert into public.consents (kind, version, granted) values ('plate_frames', '1', false);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('plate-frames', 'c5000000-0000-0000-0000-000000000001/c5100000-0000-0000-0000-000000000006.jpg', 'c5000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'no upload after the consent is withdrawn'
);
select throws_ok(
  $$select public.record_plate_frame('c5100000-0000-0000-0000-000000000006', '{"kind": "track", "frame": 0, "x": 0.5, "y": 0.5, "crop_px": 512, "crop_left": 0, "crop_top": 0, "crop_side": 0.3}')$$,
  'P0001', 'consent_required', 'no record after the consent is withdrawn'
);
select is(public.delete_my_plate_frames(), 1, 'delete what I sent removes her row');
reset role;
select is((select count(*) from public.plate_frames where user_id = 'c5000000-0000-0000-0000-000000000001')::int, 0, 'her rows are gone');
select is(
  (select convert_from(body, 'utf8')::jsonb -> 'prefixes' from net.http_request_queue where url = 'http://plates.test/storage/v1/object/plate-frames'),
  '["c5000000-0000-0000-0000-000000000001/c5100000-0000-0000-0000-000000000001.jpg"]'::jsonb,
  'and the Storage API is asked to delete her crop'
);
select is(
  (select source from public.clip_deletions where bucket = 'plate-frames' and name = 'c5000000-0000-0000-0000-000000000001/c5100000-0000-0000-0000-000000000001.jpg'),
  'owner', 'the deletion is logged as the owner''s'
);

-- an anonymous account that signs in: its frames follow its consent to the new account
insert into public.consents (user_id, kind, version, granted) values ('c5000000-0000-0000-0000-000000000004', 'plate_frames', '1', true);
insert into storage.objects (bucket_id, name) values ('plate-frames', 'c5000000-0000-0000-0000-000000000004/c5100000-0000-0000-0000-000000000007.jpg');
insert into public.plate_frames (id, user_id, object_name, kind, frame, x, y, r, crop_px, crop_left, crop_top, crop_side)
values ('c5100000-0000-0000-0000-000000000007', 'c5000000-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000004/c5100000-0000-0000-0000-000000000007.jpg', 'mark', 0, 0.5, 0.5, 0.1667, 512, 0, 0, 0.3);
update public.consents set user_id = 'c5000000-0000-0000-0000-000000000003' where user_id = 'c5000000-0000-0000-0000-000000000004';
select is(
  (select user_id from public.plate_frames where id = 'c5100000-0000-0000-0000-000000000007'),
  'c5000000-0000-0000-0000-000000000003'::uuid, 'the frames move with the consent'
);

-- deleting the account takes them
delete from net.http_request_queue where url like 'http://plates.test/%';
set local role authenticated;
set local request.jwt.claims = '{"sub": "c5000000-0000-0000-0000-000000000003", "role": "authenticated"}';
select public.delete_my_account();
reset role;
select is((select count(*) from public.plate_frames where user_id = 'c5000000-0000-0000-0000-000000000003')::int, 0, 'delete_my_account removes the rows');
select is(
  (select convert_from(body, 'utf8')::jsonb -> 'prefixes' from net.http_request_queue where url = 'http://plates.test/storage/v1/object/plate-frames'),
  '["c5000000-0000-0000-0000-000000000004/c5100000-0000-0000-0000-000000000007.jpg"]'::jsonb,
  'and asks for the crops'
);

-- the purge: a row past the retention and its crop, a crop nobody recorded; a fresh unrecorded crop and a live row stay
delete from public.clip_deletions where bucket = 'plate-frames';
insert into storage.objects (bucket_id, name, created_at) values
  ('plate-frames', 'c5000000-0000-0000-0000-000000000002/old.jpg', now() - interval '731 days'),
  ('plate-frames', 'c5000000-0000-0000-0000-000000000002/live.jpg', now() - interval '10 days'),
  ('plate-frames', 'c5000000-0000-0000-0000-000000000002/orphan.jpg', now() - interval '2 hours'),
  ('plate-frames', 'c5000000-0000-0000-0000-000000000002/just-up.jpg', now());
insert into public.plate_frames (id, user_id, object_name, kind, frame, x, y, crop_px, crop_left, crop_top, crop_side, created_at) values
  ('c5100000-0000-0000-0000-000000000010', 'c5000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000002/old.jpg', 'track', 3, 0.5, 0.5, 512, 0, 0, 0.3, now() - interval '731 days'),
  ('c5100000-0000-0000-0000-000000000011', 'c5000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000002/live.jpg', 'track', 3, 0.5, 0.5, 512, 0, 0, 0.3, now() - interval '10 days');
select is(public.purge_plate_frames(), 2, 'the purge takes the expired crop and the unrecorded one');
select is(
  (select array_agg(name order by name) from public.clip_deletions where bucket = 'plate-frames' and source = 'purge'),
  array['c5000000-0000-0000-0000-000000000002/old.jpg', 'c5000000-0000-0000-0000-000000000002/orphan.jpg'],
  'those two, and no other'
);

select * from finish();
rollback;
