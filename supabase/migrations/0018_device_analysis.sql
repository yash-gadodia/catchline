-- 0018_device_analysis.sql
-- Full on-device analysis (3.1, docs/catchline/on-device-plan.md phase 5): the
-- phone runs pose, plates and the rules itself and keeps the analysis, the
-- trace and the stills in its own Documents folder. The server keeps the per-
-- lift record needed for caps, purchases and retests, nothing biometric.
--
-- lifts.status gains 'analysing': the phone is working on it. The flow is
--   create_lift (uploading) -> start_device_analysis (analysing)
--   -> save_device_analysis (done) or fail_device_lift (failed).
-- lifts.pose_source gains 'on_device': the whole analysis ran on the phone
--   ('device' stays the stage-1 case, phone pose + server analysis).
-- lifts.cue_id / lifts.no_cue_code: which cue the lift counted towards, or why
--   a measured lift got none. Set by record_lift_outcome for every path.
-- record_lift_outcome: the one place a lift finishes (status, the refund on
--   failure, cue memory, the retest session). complete_lift_job (worker, 3.0
--   binaries) and save_device_analysis / fail_device_lift (phone) all call it.
-- delete_my_server_analyses: once a 3.1 phone holds its history locally it asks
--   the server to drop every analysis, still and trace of the caller. Owner
--   only, idempotent; the lift rows stay.
-- purge_storage: a lift left analysing (the phone died) expires like the rest.

alter table public.lifts drop constraint if exists lifts_status_check;
alter table public.lifts add constraint lifts_status_check
  check (status in ('queued', 'uploading', 'analysing', 'processing', 'done', 'failed'));

alter table public.lifts drop constraint if exists lifts_pose_source_check;
alter table public.lifts add constraint lifts_pose_source_check
  check (pose_source in ('server', 'device', 'on_device'));

alter table public.lifts add column if not exists cue_id uuid references public.cues (id) on delete set null;
alter table public.lifts add column if not exists no_cue_code text;

alter table public.clip_deletions drop constraint if exists clip_deletions_source_check;
alter table public.clip_deletions add constraint clip_deletions_source_check
  check (source in ('worker', 'purge', 'owner'));

-- ---------------------------------------------------------------------------
-- The shared finish. p_lift is the caller's row, locked for update. A failure
-- code marks the lift failed and refunds it; otherwise it is done and the cue
-- (if any) adds a session to the active cue of the same fault, or starts one.
-- ---------------------------------------------------------------------------
create or replace function public.record_lift_outcome(p_lift public.lifts, p_cue jsonb, p_no_cue_code text,
                                                      p_failure_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cue_id uuid;
begin
  if p_failure_code is not null then
    update public.lifts set status = 'failed', error = left(p_failure_code, 500), processed_at = now()
     where id = p_lift.id;
    perform public.refund_lift(p_lift.id);
    return jsonb_build_object('status', 'failed');
  end if;

  if jsonb_typeof(p_cue) = 'object' then
    update public.cues c
       set sessions = c.sessions + 1, text = p_cue ->> 'text', why = p_cue ->> 'why', last_lift_id = p_lift.id
     where c.user_id = p_lift.user_id and c.movement = p_lift.movement
       and c.fault_id = p_cue ->> 'faultId' and c.status = 'trying'
    returning c.id into v_cue_id;
    if v_cue_id is null then
      insert into public.cues (user_id, movement, fault_id, text, why, first_lift_id, last_lift_id)
      values (p_lift.user_id, p_lift.movement, p_cue ->> 'faultId', p_cue ->> 'text', p_cue ->> 'why', p_lift.id, p_lift.id)
      returning id into v_cue_id;
    end if;
  end if;
  if p_lift.retest_cue_id is not null and p_lift.retest_cue_id is distinct from v_cue_id then
    update public.cues c
       set sessions = c.sessions + 1, last_lift_id = p_lift.id
     where c.id = p_lift.retest_cue_id and c.user_id = p_lift.user_id and c.status = 'trying';
  end if;
  update public.lifts
     set status = 'done', error = null, processed_at = now(), cue_id = v_cue_id, no_cue_code = p_no_cue_code
   where id = p_lift.id;
  return jsonb_build_object('status', 'done', 'cue_id', v_cue_id);
end;
$$;

revoke all on function public.record_lift_outcome(public.lifts, jsonb, text, text) from public, anon, authenticated;

-- Same as 0015, the finish moved into record_lift_outcome. 3.0 binaries still
-- get their analysis row; a 3.1 phone deletes it with delete_my_server_analyses.
create or replace function public.complete_lift_job(p_msg_id bigint, p_lift_id uuid, p_analysis jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
  v_failure jsonb := p_analysis -> 'failure';
  v_result jsonb;
begin
  if p_analysis ->> 'version' is distinct from '1' then
    raise exception 'bad_analysis_version';
  end if;
  select * into l from public.lifts where id = p_lift_id for update;
  if not found then
    perform pgmq.archive('lift_jobs', p_msg_id);
    return jsonb_build_object('status', 'gone');
  end if;
  if l.status in ('done', 'failed') then
    perform pgmq.archive('lift_jobs', p_msg_id);
    return jsonb_build_object('status', l.status, 'duplicate', true);
  end if;

  insert into public.analyses (lift_id, user_id, analysis)
  values (l.id, l.user_id, p_analysis)
  on conflict (lift_id) do update set analysis = excluded.analysis, created_at = now();

  v_result := public.record_lift_outcome(l, p_analysis -> 'cue', p_analysis -> 'noCueReason' ->> 'code',
    case when jsonb_typeof(v_failure) = 'object' then coalesce(v_failure ->> 'code', v_failure ->> 'reason') end);
  perform pgmq.archive('lift_jobs', p_msg_id);
  return v_result;
end;
$$;

revoke all on function public.complete_lift_job(bigint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_lift_job(bigint, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- The phone's side. Owner only; the lift must be where the device flow left it.
-- ---------------------------------------------------------------------------
create or replace function public.start_device_analysis(p_lift_id uuid)
returns public.lifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
begin
  select * into l from public.lifts where id = p_lift_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'lift_not_found';
  end if;
  if l.status <> 'uploading' then
    raise exception 'lift_not_uploading';
  end if;
  update public.lifts set status = 'analysing', pose_source = 'on_device', error = null
   where id = p_lift_id
   returning * into l;
  return l;
end;
$$;

revoke all on function public.start_device_analysis(uuid) from public, anon, authenticated;
grant execute on function public.start_device_analysis(uuid) to authenticated;

-- The phone finished: the cue it found ({faultId, text, why}, or null) and why
-- there was none. Idempotent per lift: a second save returns the first outcome
-- and counts nothing twice.
create or replace function public.save_device_analysis(p_lift_id uuid, p_cue jsonb default null, p_no_cue_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
begin
  select * into l from public.lifts where id = p_lift_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'lift_not_found';
  end if;
  if l.status in ('done', 'failed') then
    return jsonb_build_object('status', l.status, 'duplicate', true, 'cue_id', l.cue_id);
  end if;
  if l.status <> 'analysing' then
    raise exception 'lift_not_analysing';
  end if;
  if p_cue is not null and (jsonb_typeof(p_cue) <> 'object' or p_cue ->> 'faultId' is null or p_cue ->> 'text' is null) then
    raise exception 'bad_cue';
  end if;
  return public.record_lift_outcome(l, p_cue, p_no_cue_code, null);
end;
$$;

revoke all on function public.save_device_analysis(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_device_analysis(uuid, jsonb, text) to authenticated;

-- The phone could not analyse (no person, no reps, the app was interrupted, the
-- lifter cancelled). Refunds exactly once, like fail_lift_job without a retry.
create or replace function public.fail_device_lift(p_lift_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
begin
  select * into l from public.lifts where id = p_lift_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'lift_not_found';
  end if;
  if l.status in ('done', 'failed') then
    return l.status;
  end if;
  if l.status not in ('uploading', 'analysing') then
    raise exception 'lift_not_analysing';
  end if;
  return public.record_lift_outcome(l, null, null, coalesce(p_code, 'unknown')) ->> 'status';
end;
$$;

revoke all on function public.fail_device_lift(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_device_lift(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A 3.1 phone that has downloaded its history asks the server to forget it:
-- the per-lift cue record is kept on the lift row (backfilled from the
-- analysis first), then every analysis and history row goes, and Storage is
-- asked (pg_net, as purge_storage does) to delete the stills and traces.
-- Returns how many analyses were dropped; 0 on a second call, which asks
-- Storage only for objects not asked for before.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_server_analyses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_url text;
  v_key text;
  v_headers jsonb;
  v_kf text[];
  v_tr text[];
  v_req bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.lifts l
     set cue_id = (select c.id from public.cues c
                    where c.user_id = l.user_id and c.movement = l.movement
                      and c.fault_id = a.analysis -> 'cue' ->> 'faultId'
                    order by (c.last_lift_id = l.id) desc, (c.first_lift_id = l.id) desc, c.created_at desc
                    limit 1),
         no_cue_code = a.analysis -> 'noCueReason' ->> 'code'
    from public.analyses a
   where a.lift_id = l.id and l.user_id = v_uid and l.status = 'done' and l.cue_id is null;

  delete from public.analysis_history h using public.lifts l where h.lift_id = l.id and l.user_id = v_uid;
  with gone as (delete from public.analyses where user_id = v_uid returning 1)
  select count(*) into v_count from gone;

  select array_agg(o.name) into v_kf
    from storage.objects o
    join public.lifts l on l.id::text = (storage.foldername(o.name))[2]
   where o.bucket_id = 'keyframes' and l.user_id = v_uid
     and not exists (select 1 from public.clip_deletions d where d.bucket = 'keyframes' and d.name = o.name and d.source = 'owner');
  select array_agg(o.name) into v_tr
    from storage.objects o
    join public.lifts l on l.id::text = regexp_replace(storage.filename(o.name), '\.json\.gz$', '')
   where o.bucket_id = 'lift-traces' and l.user_id = v_uid
     and not exists (select 1 from public.clip_deletions d where d.bucket = 'lift-traces' and d.name = o.name and d.source = 'owner');
  if v_kf is null and v_tr is null then
    return v_count;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'catchline_service_key';
  if v_url is null or v_key is null then
    raise warning 'delete_my_server_analyses: vault secrets not set; stills and traces are left in Storage';
    return v_count;
  end if;
  v_headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                  'Content-Type', 'application/json');
  if v_kf is not null then
    select net.http_delete(url := v_url || '/storage/v1/object/keyframes', headers := v_headers,
                           body := jsonb_build_object('prefixes', to_jsonb(v_kf))) into v_req;
    insert into public.clip_deletions (bucket, name, source, request_id)
    select 'keyframes', n, 'owner', v_req from unnest(v_kf) n;
  end if;
  if v_tr is not null then
    select net.http_delete(url := v_url || '/storage/v1/object/lift-traces', headers := v_headers,
                           body := jsonb_build_object('prefixes', to_jsonb(v_tr))) into v_req;
    insert into public.clip_deletions (bucket, name, source, request_id)
    select 'lift-traces', n, 'owner', v_req from unnest(v_tr) n;
  end if;
  return v_count;
end;
$$;

revoke all on function public.delete_my_server_analyses() from public, anon, authenticated;
grant execute on function public.delete_my_server_analyses() to authenticated;

-- Same as 0014, plus 'analysing' among the statuses that expire.
create or replace function public.purge_storage(p_max_age interval default interval '23 hours 50 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_headers jsonb;
  v_raw text[];
  v_kf text[];
  v_tr text[];
  v_req bigint;
  v_lift uuid;
begin
  for v_lift in
    select id from public.lifts
     where status in ('uploading', 'analysing', 'queued', 'processing') and created_at < now() - p_max_age
       for update skip locked
  loop
    update public.lifts set status = 'failed', error = 'expired', processed_at = now() where id = v_lift;
    perform public.refund_lift(v_lift);
  end loop;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'catchline_service_key';
  if v_url is null or v_key is null then
    raise warning 'purge_storage: vault secrets catchline_api_url / catchline_service_key are not set';
    return -1;
  end if;
  v_headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                  'Content-Type', 'application/json');

  select array_agg(name) into v_raw from (
    select o.name
      from storage.objects o
      left join public.lifts l on l.clip_path = regexp_replace(o.name, '\.pose\.json$', '')
     where o.bucket_id = 'raw-clips'
       and (o.created_at < now() - p_max_age or l.id is null or l.status in ('done', 'failed'))
     order by o.created_at
     limit 1000) t;

  if v_raw is not null then
    select net.http_delete(url := v_url || '/storage/v1/object/raw-clips', headers := v_headers,
                           body := jsonb_build_object('prefixes', to_jsonb(v_raw)))
      into v_req;
    insert into public.clip_deletions (bucket, name, lift_id, source, request_id)
    select 'raw-clips', n, l.id, 'purge', v_req
      from unnest(v_raw) n left join public.lifts l on l.clip_path = regexp_replace(n, '\.pose\.json$', '');
    update public.lifts set clip_deleted_at = now() where clip_path = any (v_raw) and clip_deleted_at is null;
  end if;

  select array_agg(name) into v_kf from (
    select o.name
      from storage.objects o
     where o.bucket_id = 'keyframes'
       and not exists (select 1 from public.lifts l
                        where l.id::text = (storage.foldername(o.name))[2])
     order by o.created_at
     limit 1000) t;

  if v_kf is not null then
    select net.http_delete(url := v_url || '/storage/v1/object/keyframes', headers := v_headers,
                           body := jsonb_build_object('prefixes', to_jsonb(v_kf)))
      into v_req;
    insert into public.clip_deletions (bucket, name, source, request_id)
    select 'keyframes', n, 'purge', v_req from unnest(v_kf) n;
  end if;

  select array_agg(name) into v_tr from (
    select o.name
      from storage.objects o
     where o.bucket_id = 'lift-traces'
       and not exists (select 1 from public.lifts l
                        where l.id::text = regexp_replace(storage.filename(o.name), '\.json\.gz$', ''))
     order by o.created_at
     limit 1000) t;

  if v_tr is not null then
    select net.http_delete(url := v_url || '/storage/v1/object/lift-traces', headers := v_headers,
                           body := jsonb_build_object('prefixes', to_jsonb(v_tr)))
      into v_req;
    insert into public.clip_deletions (bucket, name, source, request_id)
    select 'lift-traces', n, 'purge', v_req from unnest(v_tr) n;
  end if;

  return coalesce(array_length(v_raw, 1), 0) + coalesce(array_length(v_kf, 1), 0) + coalesce(array_length(v_tr, 1), 0);
end;
$$;

revoke all on function public.purge_storage(interval) from public, anon, authenticated;
grant execute on function public.purge_storage(interval) to service_role;
