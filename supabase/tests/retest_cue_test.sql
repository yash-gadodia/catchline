-- Retest mode: create_lift links a lift to the caller's own trying cue of the
-- same movement (anything else is stored as null), the client cannot write the
-- link itself, and a completed retest counts one session on its cue whether or
-- not that fault is still the headline.
begin;
create extension if not exists pgtap;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'retest-a@test.dev', '', now(), now(), now()),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'retest-b@test.dev', '', now(), now(), now());
update public.profiles set plan = 'pull' where id in ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002');
insert into public.consents (user_id, kind, version, granted) values
  ('e1000000-0000-0000-0000-000000000001', 'upload_privacy', '1', true),
  ('e1000000-0000-0000-0000-000000000002', 'upload_privacy', '1', true);

insert into public.cues (id, user_id, movement, fault_id, text, sessions) values
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'bar_forward_off_hips', 'Stay over the bar', 1),
  ('e3000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'snatch', 'bar_forward_off_hips', 'Not yours', 1);
insert into public.cues (id, user_id, movement, fault_id, text, status) values
  ('e3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'jump_forward', 'Stuck already', 'stuck');

create temp table t (k text primary key, id uuid) on commit drop;
grant all on t to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into t (k, id) select 'own', id from public.create_lift('snatch', 70, 'e3000000-0000-0000-0000-000000000001');
insert into t (k, id) select 'plain', id from public.create_lift('snatch', 70);
insert into t (k, id) select 'other', id from public.create_lift('snatch', 70, 'e3000000-0000-0000-0000-000000000002');
insert into t (k, id) select 'stuck', id from public.create_lift('snatch', 70, 'e3000000-0000-0000-0000-000000000003');
insert into t (k, id) select 'movement', id from public.create_lift('clean', 70, 'e3000000-0000-0000-0000-000000000001');

select is((select retest_cue_id from public.lifts where id = (select id from t where k = 'own')), 'e3000000-0000-0000-0000-000000000001'::uuid,
  'A retest of your own trying cue is linked');
select is((select retest_cue_id from public.lifts where id = (select id from t where k = 'plain')), null::uuid,
  'A lift with no cue has no link');
select is((select retest_cue_id from public.lifts where id = (select id from t where k = 'other')), null::uuid,
  'Another lifter''s cue is never linked');
select is((select retest_cue_id from public.lifts where id = (select id from t where k = 'stuck')), null::uuid,
  'A cue that is no longer trying is not linked');
select is((select retest_cue_id from public.lifts where id = (select id from t where k = 'movement')), null::uuid,
  'A cue for another movement is not linked');
select throws_ok($$update public.lifts set retest_cue_id = 'e3000000-0000-0000-0000-000000000001' where id = (select id from t where k = 'plain')$$,
  '42501', null, 'The client cannot write the link');
reset role;

-- ---- the worker completes the retests ----------------------------------------------------
update public.lifts set status = 'processing' where id in (select id from t);

select is(public.complete_lift_job(0, (select id from t where k = 'own'),
  '{"version": 1, "cue": {"faultId": "jump_forward", "text": "Land where you started", "why": "w"}, "failure": null}') ->> 'status',
  'done', 'A retest whose headline is another fault completes');
select is((select sessions || '|' || (last_lift_id = (select id from t where k = 'own')) from public.cues where id = 'e3000000-0000-0000-0000-000000000001'),
  '2|true', 'and still counts a session on the cue it tested');
select is((select count(*)::int from public.cues where user_id = 'e1000000-0000-0000-0000-000000000001' and fault_id = 'jump_forward' and status = 'trying'), 1,
  'The new headline fault starts its own cue as before');

update public.lifts set retest_cue_id = 'e3000000-0000-0000-0000-000000000001' where id = (select id from t where k = 'plain');
select public.complete_lift_job(0, (select id from t where k = 'plain'),
  '{"version": 1, "cue": {"faultId": "bar_forward_off_hips", "text": "Stay over the bar longer", "why": "w"}, "failure": null}');
select is((select sessions from public.cues where id = 'e3000000-0000-0000-0000-000000000001'), 3,
  'A retest where the same fault is the headline counts once');

update public.lifts set retest_cue_id = 'e3000000-0000-0000-0000-000000000001' where id = (select id from t where k = 'other');
select public.complete_lift_job(0, (select id from t where k = 'other'), '{"version": 1, "cue": null, "failure": null}');
select is((select sessions from public.cues where id = 'e3000000-0000-0000-0000-000000000001'), 4,
  'A retest with no fault at all counts a session too');

select * from finish();
rollback;
