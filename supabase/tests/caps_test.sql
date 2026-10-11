-- Caps: no lift without the upload consent; free = 3 for life, then a bonus
-- credit or nothing; paid tiers count per calendar month; a failed lift gives
-- its credit back exactly once.
begin;
create extension if not exists pgtap;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caps-free@test.dev', '', now(), now(), now()),
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caps-hook@test.dev', '', now(), now(), now());

select is((select plan from public.profiles where id = 'd1000000-0000-0000-0000-000000000001'), 'free', 'New users get a free profile by trigger');
select is((select lifetime_count from public.usage_counters where user_id = 'd1000000-0000-0000-0000-000000000001'), 0, 'New users get a usage row by trigger');

create temp table t_lifts (n int, id uuid, charged_to text) on commit drop;
grant all on t_lifts to authenticated;

-- ---- Free user ------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok($$select public.create_lift('snatch')$$, 'P0001', 'consent_required', 'No lift before the upload consent');
insert into public.consents (kind, version, granted) values ('upload_privacy', '2026-10', true);

insert into t_lifts select 1, id, charged_to from public.create_lift('snatch', 60);
insert into t_lifts select 2, id, charged_to from public.create_lift('clean');
insert into t_lifts select 3, id, charged_to from public.create_lift('jerk');
select is((select count(*)::int from t_lifts where charged_to = 'cap'), 3, 'Three free lifts are charged to the cap');
select is(public.lift_allowance(), '{"plan": "free", "period": "lifetime", "cap": 3, "used": 3, "bonus": 0, "remaining": 0}'::jsonb,
  'lift_allowance shows the free cap used up');
select throws_ok($$select public.create_lift('snatch')$$, 'P0001', 'cap_reached', 'The 4th free video hits the paywall');
select throws_ok($$select public.create_lift('deadlift')$$, 'P0001', 'unsupported_movement', 'Movements outside v1 are rejected before any cap check');
reset role;

update public.usage_counters set bonus_credits = 1 where user_id = 'd1000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into t_lifts select 4, id, charged_to from public.create_lift('snatch');
select is((select charged_to from t_lifts where n = 4), 'bonus', 'A bonus credit pays for the 4th');
select throws_ok($$select public.create_lift('snatch')$$, 'P0001', 'cap_reached', 'No credit left after the bonus');

insert into public.consents (kind, version, granted) values ('upload_privacy', '2026-10', false);
select throws_ok($$select public.create_lift('snatch')$$, 'P0001', 'consent_required', 'Withdrawing consent (latest row) blocks new lifts');
reset role;

-- ---- Refund on failure ------------------------------------------------------------
update public.lifts set status = 'processing' where id = (select id from t_lifts where n = 1);
select is(public.complete_lift_job(0, (select id from t_lifts where n = 1),
          '{"version": 1, "cue": null, "failure": {"reason": "not_side_on", "message": "Film from the side"}}') ->> 'status',
          'failed', 'An Analysis with a failure marks the lift failed');
select is((select lifetime_count from public.usage_counters where user_id = 'd1000000-0000-0000-0000-000000000001'), 2,
  'The failed lift gave its free video back');
select is((select charged_to from public.lifts where id = (select id from t_lifts where n = 1)), null, 'The refund is recorded on the lift');
select is(public.complete_lift_job(0, (select id from t_lifts where n = 1), '{"version": 1, "failure": {"reason": "unknown"}}') ->> 'duplicate',
          'true', 'A repeated completion is a no-op');
select is((select lifetime_count from public.usage_counters where user_id = 'd1000000-0000-0000-0000-000000000001'), 2,
  'No double refund');

update public.lifts set status = 'processing' where id = (select id from t_lifts where n = 4);
select is(public.fail_lift_job(0, (select id from t_lifts where n = 4), 'crash', false), 'failed', 'A permanent worker failure fails the lift');
select is((select bonus_credits from public.usage_counters where user_id = 'd1000000-0000-0000-0000-000000000001'), 1,
  'A failed bonus-paid lift returns the bonus credit');

-- ---- Hook: 12 per calendar month ---------------------------------------------------
update public.profiles set plan = 'hook' where id = 'd1000000-0000-0000-0000-000000000002';
insert into public.consents (user_id, kind, version, granted) values ('d1000000-0000-0000-0000-000000000002', 'upload_privacy', '2026-10', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$ begin for i in 1..12 loop perform public.create_lift('snatch'); end loop; end $$;
select is((public.lift_allowance() ->> 'remaining')::int, 0, 'Hook allows 12 this month');
select throws_ok($$select public.create_lift('snatch')$$, 'P0001', 'cap_reached', 'The 13th Hook video this month is capped');
reset role;

update public.usage_counters set period_start = (date_trunc('month', now()) - interval '1 month')::date
 where user_id = 'd1000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((public.lift_allowance() ->> 'remaining')::int, 12, 'A new month resets the Hook allowance');
select lives_ok($$select public.create_lift('snatch')$$, 'A new month allows a new lift');
reset role;

select is((select period_count from public.usage_counters where user_id = 'd1000000-0000-0000-0000-000000000002'), 1,
  'The month counter restarted at 1');

select * from finish();
rollback;
