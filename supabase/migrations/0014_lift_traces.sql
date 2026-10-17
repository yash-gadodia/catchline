-- 0014_lift_traces.sql
-- Keep the numbers, not the video, so old lifts can be re-analysed (owner
-- decision 16-10-2026). The clip is still deleted within 24 h.
--
-- lift-traces: private bucket, one '<user_id>/<lift_id>.json.gz' per lift
--   (the lifter's keypoints without head points, camera path, plate fits and
--   track; catchline_cv/trace.py). Only the service role writes. Read access
--   follows the lift, as for keyframes (0007): an account transfer moves the
--   lift, never the object.
-- analysis_history: every superseded analysis of a lift. public.analyses stays
--   the current one, so the app and complete_lift_job are unchanged.
-- save_reanalysis: the worker's re-run writes a new current analysis (stamped
--   reanalysedAt), keeps the old one in analysis_history and touches cue memory
--   only when the headline fault changed.
-- delete_my_account queues the deletion of the caller's traces; purge_storage
--   sweeps traces whose lift is gone. Neither the clip purge nor anything else
--   deletes the trace of a lift that still exists.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lift-traces', 'lift-traces', false, 10485760, array['application/gzip'])
on conflict (id) do nothing;

drop policy if exists "lift traces: lift owner reads" on storage.objects;
create policy "lift traces: lift owner reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lift-traces'
    and exists (
      select 1 from public.lifts l
      where l.id::text = regexp_replace(storage.filename(name), '\.json\.gz$', '')
        and l.user_id = (select auth.uid())));

create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifts (id) on delete cascade,
  analysis jsonb not null,
  analysed_at timestamptz not null,
  superseded_at timestamptz not null default now()
);

create index if not exists analysis_history_lift_idx on public.analysis_history (lift_id, superseded_at desc);

alter table public.analysis_history enable row level security;

drop policy if exists analysis_history_select_own on public.analysis_history;
create policy analysis_history_select_own on public.analysis_history
  for select to authenticated
  using (exists (select 1 from public.lifts l where l.id = lift_id and l.user_id = (select auth.uid())));

revoke all on public.analysis_history from public, anon, authenticated;
grant select on public.analysis_history to authenticated;
grant all on public.analysis_history to service_role;

create or replace function public.save_reanalysis(p_lift_id uuid, p_analysis jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
  a public.analyses;
  v_old text;
  v_new text := p_analysis -> 'cue' ->> 'faultId';
  v_cue jsonb := p_analysis -> 'cue';
  v_cue_id uuid;
  v_changed boolean;
begin
  if p_analysis ->> 'version' is distinct from '1' then
    raise exception 'bad_analysis_version';
  end if;
  select * into l from public.lifts where id = p_lift_id for update;
  if not found then
    return jsonb_build_object('status', 'gone');
  end if;
  select * into a from public.analyses where lift_id = l.id for update;
  if l.status <> 'done' or a.id is null or jsonb_typeof(p_analysis -> 'failure') = 'object' then
    return jsonb_build_object('status', 'skipped');
  end if;

  insert into public.analysis_history (lift_id, analysis, analysed_at) values (l.id, a.analysis, a.created_at);
  update public.analyses
     set analysis = p_analysis || jsonb_build_object('reanalysedAt',
                      to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = a.id;

  v_old := a.analysis -> 'cue' ->> 'faultId';
  v_changed := v_old is distinct from v_new;
  if v_changed then
    if v_old is not null then
      -- this lift no longer counts towards the old headline's cue; a cue only it created goes
      update public.cues c set sessions = c.sessions - 1
       where c.user_id = l.user_id and c.movement = l.movement and c.fault_id = v_old
         and c.status = 'trying' and c.sessions > 1;
      if not found then
        delete from public.cues c
         where c.user_id = l.user_id and c.movement = l.movement and c.fault_id = v_old
           and c.status = 'trying' and c.sessions = 1 and c.first_lift_id = l.id;
      end if;
    end if;
    if jsonb_typeof(v_cue) = 'object' then
      update public.cues c
         set sessions = c.sessions + 1, text = v_cue ->> 'text', why = v_cue ->> 'why'
       where c.user_id = l.user_id and c.movement = l.movement and c.fault_id = v_new and c.status = 'trying'
      returning c.id into v_cue_id;
      if v_cue_id is null then
        insert into public.cues (user_id, movement, fault_id, text, why, first_lift_id, last_lift_id)
        values (l.user_id, l.movement, v_new, v_cue ->> 'text', v_cue ->> 'why', l.id, l.id)
        returning id into v_cue_id;
      end if;
    end if;
  end if;

  return jsonb_build_object('status', 'saved', 'headline_changed', v_changed, 'cue_id', v_cue_id);
end;
$$;

revoke all on function public.save_reanalysis(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_reanalysis(uuid, jsonb) to service_role;

-- Storage objects cannot be deleted in SQL; the Storage API is asked through
-- pg_net with the Vault secrets, as purge_storage does. Without the secrets the
-- traces are left to purge_storage, which removes them once their lift is gone.
create or replace function public.delete_lift_traces(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_names text[];
begin
  select array_agg(o.name) into v_names
    from storage.objects o
    join public.lifts l on l.id::text = regexp_replace(storage.filename(o.name), '\.json\.gz$', '')
   where o.bucket_id = 'lift-traces' and l.user_id = p_user_id;
  if v_names is null then
    return 0;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'catchline_service_key';
  if v_url is null or v_key is null then
    raise warning 'delete_lift_traces: vault secrets not set; purge_storage removes the traces';
    return -1;
  end if;
  perform net.http_delete(url := v_url || '/storage/v1/object/lift-traces',
                          headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                                        'Content-Type', 'application/json'),
                          body := jsonb_build_object('prefixes', to_jsonb(v_names)));
  return array_length(v_names, 1);
end;
$$;

revoke all on function public.delete_lift_traces(uuid) from public, anon, authenticated;
grant execute on function public.delete_lift_traces(uuid) to service_role;

-- Same as 0002, plus the caller's traces (asked for before their lifts go).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  perform public.delete_lift_traces(v_uid);
  delete from public.coach_links where user_id = v_uid;
  delete from public.cues where user_id = v_uid;
  delete from public.lifts where user_id = v_uid;
  delete from public.consents where user_id = v_uid;
  delete from public.usage_counters where user_id = v_uid;
  delete from public.profiles where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Same as 0010, plus traces whose lift is gone (a deleted lift or account).
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
     where status in ('uploading', 'queued', 'processing') and created_at < now() - p_max_age
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
