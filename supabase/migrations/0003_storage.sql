-- 0003_storage.sql
-- Buckets, storage RLS, and the raw-clip lifecycle (14-legal-privacy s.9.2:
-- raw video deleted within 24 h, with an audit log proving the deletion).
--
-- raw-clips: private. A user may only INSERT the one object their pending lift
--   names; nobody but the service role reads it back (raw clips are never
--   served to the app). The worker deletes it right after processing; the
--   purge job is the backstop for anything left (abandoned uploads, crashes).
-- keyframes: private. Written by the worker under '<user_id>/<lift_id>/';
--   the owner can read (signed URLs) their own folder.
--
-- Storage rows cannot be deleted with SQL (storage.protect_delete), and a row
-- delete would leave the bytes behind anyway, so the purge goes through the
-- Storage API with pg_net, using the URL + service key held in Vault.

create extension if not exists pg_net;
create extension if not exists pg_cron;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('raw-clips', 'raw-clips', false, 524288000, array['video/quicktime', 'video/mp4']),
  ('keyframes', 'keyframes', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "raw clips: upload into own pending lift" on storage.objects;
create policy "raw clips: upload into own pending lift" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'raw-clips'
    and exists (
      select 1 from public.lifts l
      where l.clip_path = name and l.user_id = (select auth.uid()) and l.status = 'uploading'));

drop policy if exists "keyframes: owner reads own folder" on storage.objects;
create policy "keyframes: owner reads own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'keyframes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Deletion audit: one row per object deletion, from the worker or the purge.
-- No FK to lifts so the evidence outlives the lift.
-- ---------------------------------------------------------------------------
create table if not exists public.clip_deletions (
  id bigint generated always as identity primary key,
  bucket text not null,
  name text not null,
  lift_id uuid,
  source text not null check (source in ('worker', 'purge')),
  request_id bigint,
  created_at timestamptz not null default now()
);

alter table public.clip_deletions enable row level security;
revoke all on public.clip_deletions from public, anon, authenticated;
grant all on public.clip_deletions to service_role;

create or replace function public.mark_clip_deleted(p_lift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  update public.lifts set clip_deleted_at = now()
   where id = p_lift_id and clip_deleted_at is null
   returning clip_path into v_path;
  if v_path is not null then
    insert into public.clip_deletions (bucket, name, lift_id, source)
    values ('raw-clips', v_path, p_lift_id, 'worker');
  end if;
end;
$$;

revoke all on function public.mark_clip_deleted(uuid) from public, anon, authenticated;
grant execute on function public.mark_clip_deleted(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- purge_storage: run by pg_cron every 10 minutes with a 23h50m cutoff, so no
-- raw clip outlives 24 h.
--   1. lifts not finished within the cutoff fail as 'expired' (credit refunded)
--   2. raw clips past the cutoff, or whose lift is finished or gone, are deleted
--   3. keyframes whose lift is gone (deleted lift or account) are deleted
-- Returns the number of objects it asked Storage to delete, or -1 when the
-- Vault secrets are missing.
-- ---------------------------------------------------------------------------
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
      left join public.lifts l on l.clip_path = o.name
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
      from unnest(v_raw) n left join public.lifts l on l.clip_path = n;
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

select cron.schedule('catchline-purge-storage', '*/10 * * * *', 'select public.purge_storage()');
