-- sync_lift (0019): the 3.1 phone sends each finished lift once. A new done
-- lift with a cue starts cue memory and mirrors one count; the same call again
-- is a duplicate that counts nothing; the same fault adds a session; a failure
-- counts nothing and makes no cue; another user's id is a conflict and their
-- row stays private; anon cannot call it; a bad cue is refused; a retest cue
-- that is not the caller's own is dropped.
begin;
create extension if not exists pgtap;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('f1900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-alice@test.dev', '', now(), now(), now()),
  ('f1900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-bob@test.dev', '', now(), now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1900000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(public.sync_lift('f1910000-0000-0000-0000-00000000000a',
  '{"movement": "snatch", "loadKg": 80, "made": true, "cue": {"faultId": "hips_rise_early", "text": "Chest up", "why": "w"},
    "startClass": "floor", "yawBucket": "side", "analysisVersion": "3.1.0", "analysedAt": "2026-10-01T10:00:00Z"}') ->> 'status',
  'done', 'A new lift syncs as done');
select is((select status || '|' || pose_source || '|' || clip_path || '|' || made || '|' || start_class || '|' || yaw_bucket || '|' || analysis_version
             || '|' || load_kg || '|' || coalesce(charged_to, '-') || '|' || (clip_deleted_at is not null)
             from public.lifts where id = 'f1910000-0000-0000-0000-00000000000a'),
  'done|on_device|device/f1910000-0000-0000-0000-00000000000a|true|floor|side|3.1.0|80.0|-|true', 'with the slim record and no clip');
select is((select created_at from public.lifts where id = 'f1910000-0000-0000-0000-00000000000a'), '2026-10-01T10:00:00Z'::timestamptz,
  'created_at is when the phone analysed it');
select is((select c.text || '|' || c.sessions from public.cues c join public.lifts l on l.cue_id = c.id
             where l.id = 'f1910000-0000-0000-0000-00000000000a'), 'Chest up|1', 'The cue starts at one session');
select is((select lifetime_count || '|' || period_count from public.usage_counters where user_id = 'f1900000-0000-0000-0000-000000000001'),
  '1|1', 'and the count mirrors one lift');

select is(public.sync_lift('f1910000-0000-0000-0000-00000000000a',
  '{"movement": "snatch", "cue": {"faultId": "hips_rise_early", "text": "Again", "why": "w"}}') ->> 'duplicate',
  'true', 'The same lift again is a duplicate');
select is((select c.text || '|' || c.sessions from public.cues c join public.lifts l on l.cue_id = c.id
             where l.id = 'f1910000-0000-0000-0000-00000000000a'), 'Chest up|1', 'and changes no cue');
select is((select lifetime_count from public.usage_counters where user_id = 'f1900000-0000-0000-0000-000000000001'), 1,
  'and counts nothing');

select is(public.sync_lift('f1910000-0000-0000-0000-00000000000b',
  '{"movement": "snatch", "cue": {"faultId": "hips_rise_early", "text": "Push the floor", "why": "w"}}') ->> 'cue_id',
  (select cue_id::text from public.lifts where id = 'f1910000-0000-0000-0000-00000000000a'), 'The same fault is the same cue');
select is((select c.text || '|' || c.sessions from public.cues c join public.lifts l on l.cue_id = c.id
             where l.id = 'f1910000-0000-0000-0000-00000000000b'), 'Push the floor|2', 'with one more session');

select is(public.sync_lift('f1910000-0000-0000-0000-00000000000c',
  '{"movement": "clean", "cue": null, "failureCode": "no_person"}') ->> 'status', 'failed', 'A failed lift syncs as failed');
select is((select error || '|' || coalesce(cue_id::text, '-') from public.lifts where id = 'f1910000-0000-0000-0000-00000000000c'),
  'no_person|-', 'with its code and no cue');
select is((select count(*)::int from public.cues where user_id = 'f1900000-0000-0000-0000-000000000001' and movement = 'clean'), 0,
  'it starts no cue');
select is((select lifetime_count from public.usage_counters where user_id = 'f1900000-0000-0000-0000-000000000001'), 2,
  'and counts nothing');

select throws_ok($$select public.sync_lift('f1910000-0000-0000-0000-00000000000d', '{"movement": "snatch", "cue": {"text": "no fault"}}')$$,
  'P0001', 'bad_cue', 'A cue needs a faultId and text');

select set_config('test.alice_cue', (select cue_id::text from public.lifts where id = 'f1910000-0000-0000-0000-00000000000a'), true);

-- ---- Bob ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"f1900000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.sync_lift('f1910000-0000-0000-0000-00000000000a', '{"movement": "snatch"}')$$,
  'P0001', 'lift_conflict', 'Another user''s lift id is a conflict');
select is((select count(*)::int from public.lifts where id = 'f1910000-0000-0000-0000-00000000000a'), 0,
  'and Bob cannot see Alice''s lift');
select is(public.sync_lift('f1910000-0000-0000-0000-0000000000b1',
  jsonb_build_object('movement', 'snatch', 'retestCueId', current_setting('test.alice_cue'))) ->> 'status',
  'done', 'Bob syncs a lift naming Alice''s cue as its retest');
select is((select coalesce(retest_cue_id::text, '-') from public.lifts where id = 'f1910000-0000-0000-0000-0000000000b1'), '-',
  'and the retest cue is dropped');

-- ---- anon ----------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.sync_lift('f1910000-0000-0000-0000-0000000000e1', '{"movement": "snatch"}')$$,
  '42501', null, 'anon cannot call sync_lift');

reset role;
select * from finish();
rollback;
