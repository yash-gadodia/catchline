-- Coach link: the owner mints it for a finished lift; anyone with the token
-- reads it through get_coach_link (and leaves feedback) until it expires or is
-- revoked. Nobody else can mint one, and anon can never read the table.
begin;
create extension if not exists pgtap;
select plan(23);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('c1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach-alice@test.dev', '', now(), now(), now()),
  ('c1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach-bob@test.dev', '', now(), now(), now());

insert into public.lifts (id, user_id, movement, load_kg, status, clip_path)
values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'snatch', 70, 'done', 'c1/done'),
  ('c2000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'snatch', null, 'queued', 'c1/queued');

insert into public.analyses (lift_id, user_id, analysis)
values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        '{"version": 1, "id": "coach-a", "cue": {"faultId": "bar_forward_off_hips", "text": "Keep the bar close"}}');

create temp table t_link (token text, id uuid) on commit drop;
grant all on t_link to authenticated, anon;

-- ---- Alice mints links ------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into t_link select token, id from public.create_coach_link('c2000000-0000-0000-0000-000000000001');
select is((select char_length(token) from t_link), 32, 'create_coach_link returns a 32-char token');
select is((select date_trunc('day', expires_at - created_at) from public.coach_links where id = (select id from t_link)),
          interval '14 days', 'Default expiry is 14 days');
select throws_ok($$select public.create_coach_link('c2000000-0000-0000-0000-000000000002')$$, 'P0001', 'lift_not_ready',
  'No link for a lift that has not finished');
select throws_ok($$select public.create_coach_link('c2000000-0000-0000-0000-000000000001', 0)$$, 'P0001', 'bad_expiry',
  'Expiry must be 1-30 days');
select throws_ok($$update public.coach_links set token = 'guessable'$$, '42501', null, 'The token is not client-writable');
reset role;

-- ---- Bob cannot mint one for Alice's lift ---------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.create_coach_link('c2000000-0000-0000-0000-000000000001')$$, 'P0001', 'lift_not_found',
  'Bob cannot mint a link for Alice''s lift');
select is(public.get_coach_link((select token from t_link)) -> 'analysis' ->> 'id', 'coach-a',
  'A signed-in non-owner with the token can read it (it is a share link)');
reset role;

-- ---- The coach (anon) reads by token ----------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(public.get_coach_link((select token from t_link)) -> 'analysis' ->> 'id', 'coach-a', 'anon reads the analysis by token');
select is(public.get_coach_link((select token from t_link)) ->> 'movement', 'snatch', 'anon reads the movement');
select is((public.get_coach_link((select token from t_link)) ->> 'loadKg')::numeric, 70.0, 'anon reads the load');
select is(public.get_coach_link('not-a-real-token'), null, 'A wrong token reads nothing');
select is(public.save_coach_feedback((select token from t_link), '{"agree": true}', 'Good bar path'), true, 'Coach saves feedback');
select is(public.get_coach_link((select token from t_link)) ->> 'notes', 'Good bar path', 'Feedback notes come back');
select is(public.get_coach_link((select token from t_link)) -> 'overrides' ->> 'agree', 'true', 'Feedback overrides come back');
select is(public.save_coach_feedback('not-a-real-token', null, 'x'), false, 'Feedback with a wrong token is rejected');
select throws_ok(format('select public.save_coach_feedback(%L, null, %L)', (select token from t_link), repeat('z', 4001)),
  'P0001', 'notes_too_long', 'An oversized note is refused by name, not with the raw row');
select throws_ok(format('select public.save_coach_feedback(%L, %L::jsonb)', (select token from t_link),
  jsonb_build_object('big', repeat('z', 20000))), 'P0001', 'overrides_too_large', 'An oversized override is refused by name');
select is(public.save_coach_feedback((select token from t_link), null, repeat('z', 4000)), true, 'A note at the 4000-char limit saves');
select public.save_coach_feedback((select token from t_link), null, 'Good bar path');
select throws_ok($$select * from public.coach_links$$, '42501', null, 'anon cannot read the coach_links table');
reset role;

-- ---- Expiry and revocation ----------------------------------------------------
update public.coach_links set expires_at = now() - interval '1 minute' where id = (select id from t_link);
set local role anon;
select is(public.get_coach_link((select token from t_link)), null, 'An expired link reads nothing');
reset role;

update public.coach_links set expires_at = now() + interval '1 day' where id = (select id from t_link);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.coach_links set revoked_at = now() where id = (select id from t_link);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_coach_link((select token from t_link)), null, 'A revoked link reads nothing');
select is(public.save_coach_feedback((select token from t_link), null, 'late'), false, 'A revoked link takes no feedback');
reset role;

select is((select notes from public.coach_links where id = (select id from t_link)), 'Good bar path', 'Revoked link kept its last notes');

select * from finish();
rollback;
