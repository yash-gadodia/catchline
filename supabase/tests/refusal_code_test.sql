-- Refusal codes (0015): a failed analysis keeps its specific refusal code in lifts.error (the reason when an older
-- worker sent none), and a partial result (no cue, noCueReason set) completes as done without creating a cue.
begin;
create extension if not exists pgtap;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('e5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'refusal-a@test.dev', '', now(), now(), now());
update public.profiles set plan = 'pull' where id = 'e5000000-0000-0000-0000-000000000001';
insert into public.consents (user_id, kind, version, granted) values ('e5000000-0000-0000-0000-000000000001', 'upload_privacy', '1', true);

create temp table t (k text primary key, id uuid) on commit drop;
grant all on t to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into t (k, id) select 'coded', id from public.create_lift('snatch', 70);
insert into t (k, id) select 'old', id from public.create_lift('snatch', 70);
insert into t (k, id) select 'partial', id from public.create_lift('snatch', 70);
reset role;
update public.lifts set status = 'processing' where id in (select id from t);

select is(public.complete_lift_job(0, (select id from t where k = 'coded'),
  '{"version": 1, "cue": null, "failure": {"reason": "unsupported_movement", "code": "no_reps", "message": "m"}}') ->> 'status',
  'failed', 'A failure with a refusal code fails the lift');
select is((select error from public.lifts where id = (select id from t where k = 'coded')), 'no_reps',
  'lifts.error keeps the specific refusal code');

select public.complete_lift_job(0, (select id from t where k = 'old'),
  '{"version": 1, "cue": null, "failure": {"reason": "bar_out_of_frame", "message": "m"}}');
select is((select error from public.lifts where id = (select id from t where k = 'old')), 'bar_out_of_frame',
  'A failure from an older worker (no code) keeps its reason');

select is(public.complete_lift_job(0, (select id from t where k = 'partial'),
  '{"version": 1, "cue": null, "noCueReason": {"code": "off_side_on", "offSideDeg": 34}, "failure": null}') ->> 'status',
  'done', 'A partial result completes as done');
select is((select coalesce(error, 'none') from public.lifts where id = (select id from t where k = 'partial')), 'none',
  'with no error');
select is((select count(*)::int from public.cues where user_id = 'e5000000-0000-0000-0000-000000000001'), 0,
  'and no cue');

select * from finish();
rollback;
