-- problem_reports (0020): the owner inserts, nobody reads back, anon writes nothing,
-- and a resent id is refused by the primary key.
begin;
create extension if not exists pgtap;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('c2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'report-alice@test.dev', '', now(), now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub": "c2000000-0000-0000-0000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$insert into public.problem_reports (id, body, app_version, update_id, device, lift_id, reported_at)
    values ('c2100000-0000-0000-0000-000000000001', 'Stuck on processing', '3.1', 'embedded', 'iPhone16,1', 'lift-1', now())$$,
  'the owner files a report'
);
select throws_ok(
  $$insert into public.problem_reports (id, body, reported_at) values ('c2100000-0000-0000-0000-000000000001', 'again', now())$$,
  '23505', null, 'a resent id is refused, not duplicated'
);
select throws_ok(
  $$insert into public.problem_reports (id, user_id, body, reported_at)
    values ('c2100000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000009', 'as someone else', now())$$,
  '42501', null, 'a report cannot name another user'
);
select throws_ok($$select * from public.problem_reports$$, '42501', null, 'the owner cannot read reports back');

reset role;
set local role anon;
select throws_ok(
  $$insert into public.problem_reports (id, body, reported_at) values ('c2100000-0000-0000-0000-000000000003', 'anon', now())$$,
  '42501', null, 'anon writes nothing'
);

select * from finish();
rollback;
