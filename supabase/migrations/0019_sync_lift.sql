-- 0019_sync_lift.sql
-- 3.1 offline app (docs/catchline/v3.1-design.md section 6.1): the phone decides
-- caps and analyses with no server lift first. When it is online it sends the
-- slim record of each finished lift through one idempotent owner RPC,
-- sync_lift, retried from a local outbox.
--
-- lifts gains made / start_class / yaw_bucket / analysis_version (nullable).
-- sync_lift inserts the row already analysed (no clip, nothing charged), then
--   finishes it through record_lift_outcome (0018), so cue memory and the
--   retest session are written exactly as save_device_analysis writes them.
--   A second call for the same id changes nothing. usage_counters mirrors the
--   phone's count: a new done lift adds one (the cap itself lives on the phone).
-- Additive only: 3.0 binaries and their functions are untouched.

alter table public.lifts add column if not exists made boolean;
alter table public.lifts add column if not exists start_class text;
alter table public.lifts add column if not exists yaw_bucket text;
alter table public.lifts add column if not exists analysis_version text;

create or replace function public.sync_lift(p_lift_id uuid, p_lift jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_movement text := p_lift ->> 'movement';
  v_cue jsonb := p_lift -> 'cue';
  v_failure text := nullif(p_lift ->> 'failureCode', '');
  v_retest uuid;
  v_at timestamptz := coalesce((p_lift ->> 'analysedAt')::timestamptz, now());
  l public.lifts;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_lift_id is null or jsonb_typeof(p_lift) is distinct from 'object' then
    raise exception 'bad_lift';
  end if;

  select * into l from public.lifts where id = p_lift_id for update;
  if found then
    if l.user_id <> v_uid then
      raise exception 'lift_conflict';
    end if;
    return jsonb_build_object('status', l.status, 'cue_id', l.cue_id, 'duplicate', true);
  end if;

  if v_movement is null or v_movement not in
     ('snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu') then
    raise exception 'unsupported_movement';
  end if;
  if jsonb_typeof(v_cue) = 'null' then
    v_cue := null;
  end if;
  if v_cue is not null and (jsonb_typeof(v_cue) <> 'object' or v_cue ->> 'faultId' is null or v_cue ->> 'text' is null) then
    raise exception 'bad_cue';
  end if;

  if nullif(p_lift ->> 'retestCueId', '') is not null then
    select c.id into v_retest from public.cues c
     where c.id = (p_lift ->> 'retestCueId')::uuid and c.user_id = v_uid
       and c.status = 'trying' and c.movement = v_movement;
  end if;

  insert into public.lifts (id, user_id, movement, load_kg, status, clip_path, charged_to, pose_source,
                            retest_cue_id, made, start_class, yaw_bucket, analysis_version, created_at, clip_deleted_at)
  values (p_lift_id, v_uid, v_movement, (p_lift ->> 'loadKg')::numeric, 'analysing', 'device/' || p_lift_id::text, null,
          'on_device', v_retest, (p_lift ->> 'made')::boolean, p_lift ->> 'startClass', p_lift ->> 'yawBucket',
          p_lift ->> 'analysisVersion', v_at, now())
  returning * into l;

  v_result := public.record_lift_outcome(l, v_cue, case when v_failure is null then p_lift ->> 'noCueCode' end, v_failure);

  if v_result ->> 'status' = 'done' then
    insert into public.usage_counters (user_id) values (v_uid) on conflict (user_id) do nothing;
    update public.usage_counters
       set period_start = (date_trunc('month', now()))::date, period_count = 0
     where user_id = v_uid and period_start < (date_trunc('month', now()))::date;
    update public.usage_counters
       set lifetime_count = lifetime_count + 1, period_count = period_count + 1, updated_at = now()
     where user_id = v_uid;
  end if;

  return jsonb_build_object('status', v_result ->> 'status', 'cue_id', v_result -> 'cue_id');
end;
$$;

revoke all on function public.sync_lift(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_lift(uuid, jsonb) to authenticated;
