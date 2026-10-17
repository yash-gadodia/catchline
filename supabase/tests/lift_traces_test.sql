-- Lift traces (0014): only the lift's owner reads its trace (also after the
-- lift moved to another account), anon reads nothing, clients never write;
-- account deletion asks Storage to delete the traces, the clip purge never
-- touches the trace of a lift that exists; save_reanalysis keeps the old
-- analysis and moves cue memory only when the headline changed.
begin;
create extension if not exists pgtap;
select plan(26);

delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select vault.create_secret('http://traces.test', 'catchline_api_url');
select vault.create_secret('test-service-key', 'catchline_service_key');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'trace-alice@test.dev', '', now(), now(), now()),
  ('a7000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'trace-bob@test.dev', '', now(), now(), now());

insert into public.lifts (id, user_id, movement, status, clip_path, created_at)
values
  ('a7100000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'snatch', 'done', 'a7/one', now() - interval '3 days'),
  ('a7100000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000001', 'snatch', 'done', 'a7/two', now() - interval '2 days'),
  ('a7100000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000002', 'clean', 'done', 'a7/three', now());

insert into storage.objects (bucket_id, name, created_at)
values
  ('lift-traces', 'a7000000-0000-0000-0000-000000000001/a7100000-0000-0000-0000-000000000001.json.gz', now() - interval '3 days'),
  -- written under another user id (an anonymous account that moved to Alice)
  ('lift-traces', 'a7000000-0000-0000-0000-00000000aaaa/a7100000-0000-0000-0000-000000000002.json.gz', now() - interval '2 days'),
  ('lift-traces', 'a7000000-0000-0000-0000-000000000002/a7100000-0000-0000-0000-000000000003.json.gz', now()),
  ('lift-traces', 'a7000000-0000-0000-0000-000000000002/a7100000-0000-0000-0000-00000000dead.json.gz', now());

select is((select public from storage.buckets where id = 'lift-traces'), false, 'lift-traces is a private bucket');

-- ---- reads -----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'lift-traces'), 2,
  'Alice reads the traces of her two lifts, whichever folder they sit in');
select is((select count(*)::int from storage.objects where bucket_id = 'lift-traces' and name like 'a7000000-0000-0000-0000-000000000002/%'), 0,
  'Alice reads 0 of Bob''s traces');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('lift-traces', 'a7000000-0000-0000-0000-000000000001/a7100000-0000-0000-0000-000000000001.json.gz')$$,
  '42501', null, 'A client cannot write a trace, even for its own lift');
select throws_ok($$select public.save_reanalysis('a7100000-0000-0000-0000-000000000001', '{"version": 1}')$$, '42501', null,
  'Clients cannot save a re-analysis');
select throws_ok($$select public.delete_lift_traces('a7000000-0000-0000-0000-000000000002')$$, '42501', null,
  'Clients cannot delete anyone''s traces directly');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'lift-traces'), 1,
  'Bob reads only the trace of his own existing lift');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'lift-traces'), 0, 'anon reads no traces');
select throws_ok($$select count(*) from public.analysis_history$$, '42501', null, 'anon cannot read analysis history');
reset role;

-- ---- the clip purge keeps traces of existing lifts -------------------------------
select is(public.purge_storage(), 1, 'Purge asks for one object: the trace of a lift that is gone');
select is((select convert_from(body, 'utf8')::jsonb -> 'prefixes'
             from net.http_request_queue where url = 'http://traces.test/storage/v1/object/lift-traces'),
          '["a7000000-0000-0000-0000-000000000002/a7100000-0000-0000-0000-00000000dead.json.gz"]'::jsonb,
          'Only the orphaned trace goes; traces of existing lifts stay, even 3 days old');
select is((select count(*)::int from net.http_request_queue where url like 'http://traces.test/storage/v1/object/raw-clips'), 0,
  'No raw-clips request carries a trace');
select is((select count(*)::int from public.clip_deletions where bucket = 'lift-traces'), 1, 'The trace purge is audited');

-- ---- save_reanalysis ---------------------------------------------------------------
insert into public.analyses (lift_id, user_id, analysis, created_at)
values ('a7100000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001',
        '{"version": 1, "id": "one", "analysisVersion": "cv-old", "cue": {"faultId": "jump_forward", "text": "Old", "why": "w"}, "failure": null}',
        now() - interval '3 days');
insert into public.cues (id, user_id, movement, fault_id, text, sessions, first_lift_id, last_lift_id)
values ('a7200000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'snatch', 'jump_forward', 'Old', 1,
        'a7100000-0000-0000-0000-000000000001', 'a7100000-0000-0000-0000-000000000001');

select is(public.save_reanalysis('a7100000-0000-0000-0000-000000000001',
  '{"version": 1, "id": "one", "analysisVersion": "cv-new", "cue": {"faultId": "jump_forward", "text": "New", "why": "w2"}, "failure": null}') ->> 'headline_changed',
  'false', 'Same headline: saved without a headline change');
select is((select text from public.cues where id = 'a7200000-0000-0000-0000-000000000001'), 'Old', 'Same headline: the cue is untouched');
select is((select analysis ->> 'analysisVersion' from public.analyses where lift_id = 'a7100000-0000-0000-0000-000000000001'), 'cv-new',
  'The new analysis is the current one');
select ok((select analysis ? 'reanalysedAt' from public.analyses where lift_id = 'a7100000-0000-0000-0000-000000000001'),
  'The current analysis carries reanalysedAt');
select is((select analysis ->> 'analysisVersion' from public.analysis_history where lift_id = 'a7100000-0000-0000-0000-000000000001'), 'cv-old',
  'The old analysis is kept in analysis_history');

select is(public.save_reanalysis('a7100000-0000-0000-0000-000000000001',
  '{"version": 1, "id": "one", "analysisVersion": "cv-newer", "cue": {"faultId": "hips_rise_early", "text": "Hips", "why": "w3"}, "failure": null}') ->> 'headline_changed',
  'true', 'A new headline is reported');
select is((select count(*)::int from public.cues where id = 'a7200000-0000-0000-0000-000000000001'), 0,
  'The old headline''s cue, made by this lift alone, is gone');
select is((select sessions from public.cues where user_id = 'a7000000-0000-0000-0000-000000000001' and fault_id = 'hips_rise_early' and status = 'trying'), 1,
  'The new headline starts a trying cue');
select is((select count(*)::int from public.analysis_history where lift_id = 'a7100000-0000-0000-0000-000000000001'), 2,
  'Both earlier versions are kept');
select is(public.save_reanalysis('a7100000-0000-0000-0000-000000000001',
  '{"version": 1, "id": "one", "cue": null, "failure": {"reason": "bar_out_of_frame", "message": "m"}}') ->> 'status',
  'skipped', 'A re-run that now fails never replaces a done lift''s analysis');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.analysis_history), 0, 'Bob reads 0 of Alice''s analysis history');
reset role;

-- ---- account deletion asks Storage to delete the caller's traces -----------------
delete from net.http_request_queue where url like 'http://traces.test/%';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a7000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.delete_my_account();
reset role;
select is((select (select array_agg(p order by p) from jsonb_array_elements_text(convert_from(body, 'utf8')::jsonb -> 'prefixes') p)
             from net.http_request_queue where url = 'http://traces.test/storage/v1/object/lift-traces'),
          array['a7000000-0000-0000-0000-000000000001/a7100000-0000-0000-0000-000000000001.json.gz',
                'a7000000-0000-0000-0000-00000000aaaa/a7100000-0000-0000-0000-000000000002.json.gz'],
          'Deleting the account deletes both of Alice''s traces, including the one in the old folder');
select is((select count(*)::int from public.analysis_history h where h.lift_id = 'a7100000-0000-0000-0000-000000000001'), 0,
  'Account deletion removes the analysis history with the lifts');

select * from finish();
rollback;
