-- Plan sync: apply_plan (service role, from the RevenueCat webhook) sets the
-- plan idempotently, founding is permanent, clients can neither write the plan
-- nor call apply_plan, and founding_seats() is public and counts founders.
begin;
create extension if not exists pgtap;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('e2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plan-sync-1@test.dev', '', now(), now(), now()),
  ('e2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plan-sync-2@test.dev', '', now(), now(), now());

create temp table t_seats as select (public.founding_seats() ->> 'taken')::int as before;
grant select on t_seats to anon, authenticated;

-- ---- apply_plan -------------------------------------------------------------------
select is(public.apply_plan('e2000000-0000-0000-0000-000000000001', 'pull', null, 'evt-1', 'INITIAL_PURCHASE', '2026-10-11 10:00+00'),
  'applied', 'A purchase applies');
select is((select plan from public.profiles where id = 'e2000000-0000-0000-0000-000000000001'), 'pull', 'The plan is pull');
select is(public.apply_plan('e2000000-0000-0000-0000-000000000001', 'free', null, 'evt-1', 'INITIAL_PURCHASE', '2026-10-11 10:00+00'),
  'duplicate', 'The same event id is a no-op');
select is((select plan from public.profiles where id = 'e2000000-0000-0000-0000-000000000001'), 'pull', 'A duplicate leaves the plan alone');
select is(public.apply_plan('e2000000-0000-0000-0000-000000000001', 'free', null, 'evt-0', 'EXPIRATION', '2026-10-11 09:00+00'),
  'stale', 'An event older than the last applied one is skipped');
select is((select plan from public.profiles where id = 'e2000000-0000-0000-0000-000000000001'), 'pull', 'A stale event leaves the plan alone');
select is(public.apply_plan('e2000000-0000-0000-0000-000000000001', 'free', null, 'evt-2', 'EXPIRATION', '2026-10-11 11:00+00'),
  'applied', 'Expiry applies');
select is((select plan from public.profiles where id = 'e2000000-0000-0000-0000-000000000001'), 'free', 'Expiry returns to free');
select is(public.apply_plan('e1999999-0000-0000-0000-000000000000', 'pull', null, 'evt-x', 'INITIAL_PURCHASE', now()),
  'no_profile', 'An unknown user is a no-op');
select is((select count(*)::int from public.revenuecat_events where id = 'evt-x'), 0, 'An unknown user records no event');
select throws_ok($$select public.apply_plan('e2000000-0000-0000-0000-000000000001', 'gold', null, 'evt-g', 'INITIAL_PURCHASE', now())$$,
  'P0001', 'invalid_plan', 'Only known plans');

-- ---- founding is permanent --------------------------------------------------------
select is(public.apply_plan('e2000000-0000-0000-0000-000000000002', 'founding', true, 'evt-f1', 'NON_RENEWING_PURCHASE', '2026-10-11 10:00+00'),
  'applied', 'A founding purchase applies');
select is((select plan || ' ' || founding from public.profiles where id = 'e2000000-0000-0000-0000-000000000002'), 'founding true', 'Founding sets plan and flag');
select is((public.founding_seats() ->> 'taken')::int - (select before from t_seats), 1, 'founding_seats counts the new founder');
select public.apply_plan('e2000000-0000-0000-0000-000000000002', 'platform', null, 'evt-f2', 'INITIAL_PURCHASE', '2026-10-11 11:00+00');
select is((select plan || ' ' || founding from public.profiles where id = 'e2000000-0000-0000-0000-000000000002'), 'platform true', 'Platform ranks above founding');
select is((public.founding_seats() ->> 'taken')::int - (select before from t_seats), 1, 'A founder on Platform still holds a seat');
select public.apply_plan('e2000000-0000-0000-0000-000000000002', 'free', null, 'evt-f3', 'EXPIRATION', '2026-10-11 12:00+00');
select is((select plan from public.profiles where id = 'e2000000-0000-0000-0000-000000000002'), 'founding', 'Platform expiry falls back to founding, not free');
select public.apply_plan('e2000000-0000-0000-0000-000000000002', 'free', false, 'evt-f4', 'TRANSFER', '2026-10-11 13:00+00');
select is((select plan || ' ' || founding from public.profiles where id = 'e2000000-0000-0000-0000-000000000002'), 'free false', 'A transfer away clears founding');

-- ---- clients ----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$update public.profiles set plan = 'platform', founding = true$$, '42501', null, 'Clients cannot write plan or founding');
select throws_ok($$select public.apply_plan('e2000000-0000-0000-0000-000000000001', 'platform', true, 'evt-c', 'INITIAL_PURCHASE', now())$$,
  '42501', null, 'Clients cannot call apply_plan');
select throws_ok($$select * from public.revenuecat_events$$, '42501', null, 'Clients cannot read webhook events');
set local role anon;
select is(public.founding_seats() ->> 'cap', '500', 'anon can read the seat counter');
set local role postgres;

select * from finish();
rollback;
