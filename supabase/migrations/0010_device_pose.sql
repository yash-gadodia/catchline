-- 0010_device_pose.sql
-- On-device body pose (stage 1): the app may upload Apple Vision keypoints as a
-- second raw-clips object next to the clip, '<clip_path>.pose.json', and the
-- worker then skips its own pose model.
--
-- lifts.pose_source: 'device' when enqueue_lift finds the pose object, else
--   'server'. Set server-side from what is really in Storage, never by the client.
-- raw-clips: the client may also INSERT '<clip_path>.pose.json' for its own
--   pending lift (same rules as the clip). Still never readable by the client.
-- The pose object lives and dies with the clip: purge_storage treats it as part
-- of its lift, and mark_clip_deleted audits its deletion too.

alter table public.lifts add column if not exists pose_source text not null default 'server'
  check (pose_source in ('server', 'device'));

update storage.buckets
   set allowed_mime_types = array['video/quicktime', 'video/mp4', 'application/json']
 where id = 'raw-clips';

drop policy if exists "raw clips: upload into own pending lift" on storage.objects;
create policy "raw clips: upload into own pending lift" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'raw-clips'
    and exists (
      select 1 from public.lifts l
      where (l.clip_path = name or l.clip_path || '.pose.json' = name)
        and l.user_id = (select auth.uid()) and l.status = 'uploading'));

create or replace function public.enqueue_lift(p_lift_id uuid)
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
  if not exists (select 1 from storage.objects o where o.bucket_id = 'raw-clips' and o.name = l.clip_path) then
    raise exception 'clip_missing';
  end if;
  update public.lifts
     set status = 'queued', queued_at = now(), error = null,
         pose_source = case when exists (select 1 from storage.objects o
                                          where o.bucket_id = 'raw-clips' and o.name = l.clip_path || '.pose.json')
                            then 'device' else 'server' end
   where id = p_lift_id
   returning * into l;
  perform pgmq.send('lift_jobs', jsonb_build_object('lift_id', l.id));
  perform public.wake_worker();
  return l;
end;
$$;

revoke all on function public.enqueue_lift(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_lift(uuid) to authenticated;

create or replace function public.mark_clip_deleted(p_lift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_pose text;
begin
  update public.lifts set clip_deleted_at = now()
   where id = p_lift_id and clip_deleted_at is null
   returning clip_path, pose_source into v_path, v_pose;
  if v_path is not null then
    insert into public.clip_deletions (bucket, name, lift_id, source)
    values ('raw-clips', v_path, p_lift_id, 'worker');
    if v_pose = 'device' then
      insert into public.clip_deletions (bucket, name, lift_id, source)
      values ('raw-clips', v_path || '.pose.json', p_lift_id, 'worker');
    end if;
  end if;
end;
$$;

revoke all on function public.mark_clip_deleted(uuid) from public, anon, authenticated;
grant execute on function public.mark_clip_deleted(uuid) to service_role;

-- Same as 0003, except a raw-clips object is matched to its lift with any
-- '.pose.json' suffix stripped, so a pending lift's pose is not taken for an orphan.
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

  return coalesce(array_length(v_raw, 1), 0) + coalesce(array_length(v_kf, 1), 0);
end;
$$;

revoke all on function public.purge_storage(interval) from public, anon, authenticated;
grant execute on function public.purge_storage(interval) to service_role;
