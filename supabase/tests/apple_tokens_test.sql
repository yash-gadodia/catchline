-- apple_tokens: the refresh token is server-side only. The owner, other users
-- and anon can neither read nor write it; the service role can; it goes with
-- the auth user.
begin;
create extension if not exists pgtap;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('a1000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'apple-tok@test.dev', '', now(), now(), now());
insert into public.apple_tokens (user_id, refresh_token) values ('a1000000-0000-0000-0000-0000000000a1', 'refresh-secret');

select ok((select relrowsecurity from pg_class where oid = 'public.apple_tokens'::regclass), 'RLS is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'apple_tokens'), 0, 'No client policies');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select refresh_token from public.apple_tokens$$, '42501', null, 'The owner cannot read their own token');
select throws_ok($$insert into public.apple_tokens (user_id, refresh_token) values ('a1000000-0000-0000-0000-0000000000a1', 'x')$$,
  '42501', null, 'The owner cannot write a token');
select throws_ok($$delete from public.apple_tokens$$, '42501', null, 'The owner cannot delete the token');
reset role;

set local role anon;
select throws_ok($$select refresh_token from public.apple_tokens$$, '42501', null, 'anon cannot read tokens');
reset role;

set local role service_role;
select is((select refresh_token from public.apple_tokens where user_id = 'a1000000-0000-0000-0000-0000000000a1'), 'refresh-secret',
  'The service role reads the token');
reset role;

select is((select count(*)::int from public.apple_tokens where user_id = 'a1000000-0000-0000-0000-0000000000a1'), 1, 'Token stored');
delete from auth.users where id = 'a1000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from public.apple_tokens where user_id = 'a1000000-0000-0000-0000-0000000000a1'), 0,
  'Deleting the auth user removes the token');

select * from finish();
rollback;
