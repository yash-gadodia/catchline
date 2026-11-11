-- 0024_plate_frames.sql
-- "Help Catchline find plates better" (opt-in, off by default). A lifter who grants the
-- 'plate_frames' consent sends small square crops around the barbell plate (never the
-- video, never a whole frame) with where the plate is in the crop: their own mark, a
-- correction they drew, or the tracker's position. The crops train the plate finder.
--
-- consents.kind gains 'plate_frames'.
-- plate-frames: private bucket, JPEG up to 512 KB. The owner may only INSERT under
--   '<user_id>/' and only while the consent is granted; nobody but the service role
--   reads it back.
-- plate_frames: one row per crop. No client grant at all: record_plate_frame (owner,
--   SECURITY DEFINER) is the one way in and checks the consent, the object and a daily
--   limit on the server. Nobody reads rows back but service_role.
-- delete_my_plate_frames(): the owner erases every row and object they sent.
-- delete_my_account() erases them too. purge_plate_frames on pg_cron removes rows past
--   the retention (24 months) and every object with no row (deleted, or never recorded).
-- Additive only: binaries before the plate mark never touch any of it.

alter table public.consents drop constraint if exists consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('terms', 'health_disclaimer', 'upload_privacy', 'model_training', 'plate_frames'));

-- The storage policy below runs as the caller, who may not call consent_granted itself.
create or replace function public.plate_frames_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.consent_granted((select auth.uid()), 'plate_frames');
$$;

revoke all on function public.plate_frames_allowed() from public, anon, authenticated;
grant execute on function public.plate_frames_allowed() to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plate-frames', 'plate-frames', false, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "plate frames: upload into own folder with consent" on storage.objects;
create policy "plate frames: upload into own folder with consent" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'plate-frames'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.plate_frames_allowed()));

create table if not exists public.plate_frames (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  object_name text not null unique,
  lift_id text check (char_length(lift_id) <= 64),
  -- mark: the lifter's mark before tracking. correction: a circle the lifter drew on a result. Both are strong labels.
  -- track: the tracker's own position on a later frame, a weak label.
  kind text not null check (kind in ('mark', 'correction', 'track')),
  frame integer not null check (frame >= 0),
  -- the plate in the crop: centre and radius as shares of the crop's side
  x real not null check (x >= 0 and x <= 1),
  y real not null check (y >= 0 and y <= 1),
  r real check (r > 0 and r <= 1),
  confidence real check (confidence >= 0 and confidence <= 1),
  -- the crop: its side in pixels, and where it sat in the clip's frame (left, top, side as shares of the frame's width, height, height)
  crop_px integer not null check (crop_px between 16 and 512),
  crop_left real not null,
  crop_top real not null,
  crop_side real not null,
  clip_fps real,
  clip_width integer,
  clip_height integer,
  mark_skipped boolean not null default false,
  app_version text check (char_length(app_version) <= 32),
  update_id text check (char_length(update_id) <= 64),
  model_version text check (char_length(model_version) <= 32),
  consent_version text check (char_length(consent_version) <= 32),
  created_at timestamptz not null default now(),
  -- set by the training ingest (service role) once the crop is in a batch
  ingested_at timestamptz
);

create index if not exists plate_frames_user_idx on public.plate_frames (user_id, created_at desc);
create index if not exists plate_frames_new_idx on public.plate_frames (created_at) where ingested_at is null;

alter table public.plate_frames enable row level security;

revoke all on public.plate_frames from public, anon, authenticated;
grant all on public.plate_frames to service_role;

-- The one way a row gets in. The client names the crop it has just uploaded; the consent,
-- the owner, the object and the daily limit are all read here, never taken from the client.
create or replace function public.record_plate_frame(p_id uuid, p_frame jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_kind text := p_frame ->> 'kind';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.consent_granted(v_uid, 'plate_frames') then
    raise exception 'consent_required';
  end if;
  if p_id is null or v_kind is null or v_kind not in ('mark', 'correction', 'track') then
    raise exception 'bad_frame';
  end if;
  if v_kind <> 'track' and (p_frame ->> 'r') is null then
    raise exception 'bad_frame';
  end if;
  if exists (select 1 from public.plate_frames where id = p_id) then
    return;
  end if;
  v_name := v_uid::text || '/' || p_id::text || '.jpg';
  if not exists (select 1 from storage.objects where bucket_id = 'plate-frames' and name = v_name) then
    raise exception 'frame_missing';
  end if;
  if (select count(*) from public.plate_frames where user_id = v_uid and created_at > now() - interval '1 day') >= 300 then
    raise exception 'rate_limited';
  end if;
  insert into public.plate_frames (
    id, user_id, object_name, lift_id, kind, frame, x, y, r, confidence,
    crop_px, crop_left, crop_top, crop_side, clip_fps, clip_width, clip_height,
    mark_skipped, app_version, update_id, model_version, consent_version)
  values (
    p_id, v_uid, v_name, p_frame ->> 'lift_id', v_kind, (p_frame ->> 'frame')::integer,
    (p_frame ->> 'x')::real, (p_frame ->> 'y')::real, (p_frame ->> 'r')::real, (p_frame ->> 'confidence')::real,
    (p_frame ->> 'crop_px')::integer, (p_frame ->> 'crop_left')::real, (p_frame ->> 'crop_top')::real, (p_frame ->> 'crop_side')::real,
    (p_frame ->> 'clip_fps')::real, (p_frame ->> 'clip_width')::integer, (p_frame ->> 'clip_height')::integer,
    coalesce((p_frame ->> 'mark_skipped')::boolean, false),
    p_frame ->> 'app_version', p_frame ->> 'update_id', p_frame ->> 'model_version',
    (select c.version from public.consents c
      where c.user_id = v_uid and c.kind = 'plate_frames' and c.granted
      order by c.created_at desc, c.id desc limit 1))
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.record_plate_frame(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_plate_frame(uuid, jsonb) to authenticated;

-- Asks the Storage API to delete these crops. Without the Vault secrets it does nothing and
-- purge_plate_frames takes them on its next run (their rows are already gone by then).
create or replace function public.delete_plate_frame_objects(p_names text[], p_source text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_req bigint;
begin
  if p_names is null or array_length(p_names, 1) is null then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'catchline_service_key';
  if v_url is null or v_key is null then
    raise warning 'delete_plate_frame_objects: vault secrets catchline_api_url / catchline_service_key are not set';
    return null;
  end if;
  select net.http_delete(url := v_url || '/storage/v1/object/plate-frames',
                         headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                                       'Content-Type', 'application/json'),
                         body := jsonb_build_object('prefixes', to_jsonb(p_names)))
    into v_req;
  insert into public.clip_deletions (bucket, name, source, request_id)
  select 'plate-frames', n, p_source, v_req from unnest(p_names) n;
  return v_req;
end;
$$;

revoke all on function public.delete_plate_frame_objects(text[], text) from public, anon, authenticated;
grant execute on function public.delete_plate_frame_objects(text[], text) to service_role;

create or replace function public.delete_plate_frames(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
begin
  with gone as (
    delete from public.plate_frames where user_id = p_user_id returning object_name
  )
  select array_agg(object_name) into v_names from gone;
  perform public.delete_plate_frame_objects(v_names, 'owner');
  return coalesce(array_length(v_names, 1), 0);
end;
$$;

revoke all on function public.delete_plate_frames(uuid) from public, anon, authenticated;
grant execute on function public.delete_plate_frames(uuid) to service_role;

-- "Delete what I sent": every row and crop of the caller. Returns how many rows went.
create or replace function public.delete_my_plate_frames()
returns integer
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
  return public.delete_plate_frames(v_uid);
end;
$$;

revoke all on function public.delete_my_plate_frames() from public, anon, authenticated;
grant execute on function public.delete_my_plate_frames() to authenticated;

-- Same as 0014, plus the caller's plate frames.
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
  perform public.delete_plate_frames(v_uid);
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

-- An anonymous account that signs in with Apple hands its rows over (0006), consents
-- included. The frames it sent follow the consent, so "delete what I sent" still finds them.
create or replace function public.plate_frames_follow_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.plate_frames set user_id = new.user_id where user_id = old.user_id;
  return null;
end;
$$;

revoke all on function public.plate_frames_follow_consent() from public, anon, authenticated;

drop trigger if exists consents_plate_frames_follow on public.consents;
create trigger consents_plate_frames_follow
  after update of user_id on public.consents
  for each row
  when (old.kind = 'plate_frames' and old.user_id is distinct from new.user_id)
  execute function public.plate_frames_follow_consent();

-- Rows past the retention go, then every crop with no row: one whose row was just removed,
-- whose owner deleted it or their account, or that was uploaded and never recorded (an hour's grace).
create or replace function public.purge_plate_frames(p_max_age interval default interval '730 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text[];
begin
  delete from public.plate_frames where created_at < now() - p_max_age;

  select array_agg(name) into v_names from (
    select o.name
      from storage.objects o
     where o.bucket_id = 'plate-frames'
       and o.created_at < now() - interval '1 hour'
       and not exists (select 1 from public.plate_frames f where f.object_name = o.name)
     order by o.created_at
     limit 1000) t;

  if v_names is null then
    return 0;
  end if;
  if public.delete_plate_frame_objects(v_names, 'purge') is null then
    return -1;
  end if;
  return array_length(v_names, 1);
end;
$$;

revoke all on function public.purge_plate_frames(interval) from public, anon, authenticated;
grant execute on function public.purge_plate_frames(interval) to service_role;

select cron.schedule('catchline-purge-plate-frames', '43 * * * *', 'select public.purge_plate_frames()');
