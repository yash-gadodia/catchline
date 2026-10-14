-- lifts_ahead: the queue position the processing screen shows. Counts queued
-- and processing lifts created before the caller's lift across all lifters,
-- ignores done / failed / uploading ones, is owner-only, and is closed to anon.
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ahead-alice@test.dev', '', now(), now(), now()),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ahead-bob@test.dev', '', now(), now(), now());

-- Created, in order: Bob processing, Bob done, Alice failed, Bob uploading,
-- Alice queued (the lift under test), Alice queued (later), Bob queued (later).
insert into public.lifts (id, user_id, movement, status, clip_path, created_at)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'snatch', 'processing', 'e1/b1', now() - interval '6 minutes'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000002', 'snatch', 'done', 'e1/b2', now() - interval '5 minutes'),
  ('e2000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'failed', 'e1/a3', now() - interval '4 minutes'),
  ('e2000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-000000000002', 'snatch', 'uploading', 'e1/b4', now() - interval '3 minutes'),
  ('e2000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'queued', 'e1/a5', now() - interval '2 minutes'),
  ('e2000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-000000000001', 'snatch', 'queued', 'e1/a6', now() - interval '1 minute'),
  ('e2000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-000000000002', 'snatch', 'queued', 'e1/b7', now());

-- ---- Alice asks about her own lifts -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(public.lifts_ahead('e2000000-0000-0000-0000-000000000005'), 1,
  'Only the earlier processing lift is ahead; done, failed and uploading ones are not');
select is(public.lifts_ahead('e2000000-0000-0000-0000-000000000006'), 2,
  'Her later lift waits behind her own earlier one too');
select is(public.lifts_ahead('e2000000-0000-0000-0000-000000000003'), 0,
  'A lift that is no longer queued or processing has nobody ahead');
select throws_ok($$select public.lifts_ahead('e2000000-0000-0000-0000-000000000007')$$, 'P0001', 'lift_not_found',
  'Bob''s lift is not hers to ask about');
select throws_ok($$select public.lifts_ahead('e9000000-0000-0000-0000-000000000000')$$, 'P0001', 'lift_not_found',
  'An unknown lift is not found');
reset role;

-- ---- Bob, from the back of the queue ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(public.lifts_ahead('e2000000-0000-0000-0000-000000000007'), 3,
  'Bob''s newest lift waits behind his processing one and both of Alice''s queued ones');
reset role;

-- ---- the worker moving the queue along shows up on the next poll --------------------
update public.lifts set status = 'done' where id = 'e2000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.lifts_ahead('e2000000-0000-0000-0000-000000000005'), 0,
  'Once the lift ahead finishes, hers is next');
reset role;

-- ---- anon is closed out ---------------------------------------------------------------
set local role anon;
select throws_ok($$select public.lifts_ahead('e2000000-0000-0000-0000-000000000005')$$, '42501', null,
  'anon cannot call lifts_ahead');
reset role;

select * from finish();
rollback;
