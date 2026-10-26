-- 0021_shared_clips.sql
-- 3.1 "Send this clip so we can fix it": on a failed lift the lifter can choose to
-- send that one trimmed clip, so a failure we cannot reproduce from its code alone
-- can be looked at. Opt-in per clip, never automatic.
--
-- shared-clips: private. The owner may only INSERT under '<user_id>/'; nobody but
--   the service role reads it back. purge_shared_clips deletes a clip after 30 days,
--   or as soon as its account is gone.
-- Additive only: 3.0 binaries never touch it.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shared-clips', 'shared-clips', false, 209715200, array['video/mp4', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shared clips: upload into own folder" on storage.objects;
create policy "shared clips: upload into own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'shared-clips' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.purge_shared_clips(p_max_age interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_names text[];
  v_req bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'catchline_service_key';
  if v_url is null or v_key is null then
    raise warning 'purge_shared_clips: vault secrets catchline_api_url / catchline_service_key are not set';
    return -1;
  end if;

  select array_agg(name) into v_names from (
    select o.name
      from storage.objects o
     where o.bucket_id = 'shared-clips'
       and (o.created_at < now() - p_max_age
            or not exists (select 1 from auth.users u where u.id::text = (storage.foldername(o.name))[1]))
     order by o.created_at
     limit 1000) t;

  if v_names is null then
    return 0;
  end if;

  select net.http_delete(url := v_url || '/storage/v1/object/shared-clips',
                         headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                                       'Content-Type', 'application/json'),
                         body := jsonb_build_object('prefixes', to_jsonb(v_names)))
    into v_req;
  insert into public.clip_deletions (bucket, name, source, request_id)
  select 'shared-clips', n, 'purge', v_req from unnest(v_names) n;
  return array_length(v_names, 1);
end;
$$;

revoke all on function public.purge_shared_clips(interval) from public, anon, authenticated;
grant execute on function public.purge_shared_clips(interval) to service_role;

select cron.schedule('catchline-purge-shared-clips', '17 * * * *', 'select public.purge_shared_clips()');
