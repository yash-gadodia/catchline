-- 0002_lift_pipeline.sql
-- The lift lifecycle as functions: caps, create, enqueue (pgmq), the worker's
-- claim / complete / fail, cue memory, the coach link by token, and account
-- deletion. Every function pins search_path and is granted explicitly
-- (Postgres grants EXECUTE to PUBLIC by default, so each one starts revoked).

create extension if not exists pgmq;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'lift_jobs') then
    perform pgmq.create('lift_jobs');
  end if;
end;
$$;

revoke all on pgmq.q_lift_jobs, pgmq.a_lift_jobs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Caps (07-monetisation 4.3): free = 3 videos for life; paid tiers per month.
-- Founding = Pull for life.
-- ---------------------------------------------------------------------------
create or replace function public.plan_cap(p_plan text)
returns table (cap integer, per_month boolean)
language sql
immutable
set search_path = ''
as $$
  select case p_plan
           when 'hook' then 12
           when 'pull' then 40
           when 'platform' then 100
           when 'founding' then 40
           else 3
         end,
         coalesce(p_plan, 'free') <> 'free';
$$;

revoke all on function public.plan_cap(text) from public, anon, authenticated;
grant execute on function public.plan_cap(text) to authenticated, service_role;

create or replace function public.lift_allowance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_cap integer;
  v_monthly boolean;
  v_used integer;
  u public.usage_counters;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select coalesce(p.plan, 'free') into v_plan from public.profiles p where p.id = v_uid;
  v_plan := coalesce(v_plan, 'free');
  select c.cap, c.per_month into v_cap, v_monthly from public.plan_cap(v_plan) c;
  select * into u from public.usage_counters where user_id = v_uid;
  if v_monthly then
    v_used := case when u.period_start < (date_trunc('month', now()))::date then 0
                   else coalesce(u.period_count, 0) end;
  else
    v_used := coalesce(u.lifetime_count, 0);
  end if;
  return jsonb_build_object(
    'plan', v_plan,
    'period', case when v_monthly then 'month' else 'lifetime' end,
    'cap', v_cap,
    'used', v_used,
    'bonus', coalesce(u.bonus_credits, 0),
    'remaining', greatest(v_cap - v_used, 0) + coalesce(u.bonus_credits, 0));
end;
$$;

revoke all on function public.lift_allowance() from public, anon, authenticated;
grant execute on function public.lift_allowance() to authenticated;

-- ---------------------------------------------------------------------------
-- create_lift: consent gate + cap check + charge, then a lift in 'uploading'
-- whose clip_path is the only raw-clips object the user may write.
-- ---------------------------------------------------------------------------
create or replace function public.create_lift(p_movement text, p_load_kg numeric default null)
returns public.lifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_plan text;
  v_cap integer;
  v_monthly boolean;
  v_used integer;
  v_charge text;
  u public.usage_counters;
  v_lift public.lifts;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.consent_granted(v_uid, 'upload_privacy') then
    raise exception 'consent_required' using hint = 'record an upload_privacy consent first';
  end if;
  if p_movement is null or p_movement not in
     ('snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu') then
    raise exception 'unsupported_movement';
  end if;

  insert into public.usage_counters (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into u from public.usage_counters where user_id = v_uid for update;
  if u.period_start < (date_trunc('month', now()))::date then
    update public.usage_counters
       set period_start = (date_trunc('month', now()))::date, period_count = 0
     where user_id = v_uid
     returning * into u;
  end if;

  select coalesce(p.plan, 'free') into v_plan from public.profiles p where p.id = v_uid;
  v_plan := coalesce(v_plan, 'free');
  select c.cap, c.per_month into v_cap, v_monthly from public.plan_cap(v_plan) c;
  v_used := case when v_monthly then u.period_count else u.lifetime_count end;

  if v_used < v_cap then
    v_charge := 'cap';
  elsif u.bonus_credits > 0 then
    v_charge := 'bonus';
  else
    raise exception 'cap_reached' using hint = format('plan %s allows %s per %s', v_plan, v_cap,
      case when v_monthly then 'month' else 'lifetime' end);
  end if;

  update public.usage_counters
     set lifetime_count = lifetime_count + (v_charge = 'cap')::int,
         period_count = period_count + (v_charge = 'cap')::int,
         bonus_credits = bonus_credits - (v_charge = 'bonus')::int,
         updated_at = now()
   where user_id = v_uid;

  insert into public.lifts (id, user_id, movement, load_kg, clip_path, charged_to)
  values (v_id, v_uid, p_movement, p_load_kg, v_uid::text || '/' || v_id::text, v_charge)
  returning * into v_lift;
  return v_lift;
end;
$$;

revoke all on function public.create_lift(text, numeric) from public, anon, authenticated;
grant execute on function public.create_lift(text, numeric) to authenticated;

-- A failed or expired lift gives its credit back, once.
create or replace function public.refund_lift(p_lift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
begin
  select * into l from public.lifts where id = p_lift_id for update;
  if not found or l.charged_to is null then
    return;
  end if;
  if l.charged_to = 'cap' then
    update public.usage_counters
       set lifetime_count = greatest(lifetime_count - 1, 0),
           period_count = case when l.created_at >= period_start then greatest(period_count - 1, 0)
                               else period_count end,
           updated_at = now()
     where user_id = l.user_id;
  else
    update public.usage_counters
       set bonus_credits = bonus_credits + 1, updated_at = now()
     where user_id = l.user_id;
  end if;
  update public.lifts set charged_to = null where id = p_lift_id;
end;
$$;

revoke all on function public.refund_lift(uuid) from public, anon, authenticated;
grant execute on function public.refund_lift(uuid) to service_role;

-- Optional push to the worker (Modal web endpoint) so it does not have to
-- poll. A no-op until the vault holds catchline_worker_url.
create or replace function public.wake_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_worker_url';
  if v_url is null then
    return;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'catchline_worker_token';
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || coalesce(v_token, '')));
end;
$$;

revoke all on function public.wake_worker() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- enqueue_lift: the client calls it once the upload has finished. The object
-- must exist; then the lift is queued and a job lands in pgmq.
-- ---------------------------------------------------------------------------
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
  update public.lifts set status = 'queued', queued_at = now(), error = null
   where id = p_lift_id
   returning * into l;
  perform pgmq.send('lift_jobs', jsonb_build_object('lift_id', l.id));
  perform public.wake_worker();
  return l;
end;
$$;

revoke all on function public.enqueue_lift(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_lift(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Worker side (service_role only). pgmq.read gives the visibility timeout:
-- a crashed worker's job reappears after p_vt seconds; read_ct counts tries.
-- ---------------------------------------------------------------------------
create or replace function public.claim_lift_job(p_vt integer default 600, p_max_attempts integer default 3)
returns table (msg_id bigint, lift_id uuid, user_id uuid, movement text, load_kg numeric,
               clip_path text, attempt integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  m record;
  l public.lifts;
begin
  loop
    select * into m from pgmq.read('lift_jobs', p_vt, 1);
    if not found then
      return;
    end if;
    select * into l from public.lifts where id = (m.message ->> 'lift_id')::uuid for update;
    if not found or l.status not in ('queued', 'processing') then
      perform pgmq.archive('lift_jobs', m.msg_id);
      continue;
    end if;
    if m.read_ct > p_max_attempts then
      update public.lifts set status = 'failed', error = 'too_many_attempts', processed_at = now()
       where id = l.id;
      perform public.refund_lift(l.id);
      perform pgmq.archive('lift_jobs', m.msg_id);
      continue;
    end if;
    update public.lifts set status = 'processing', attempts = m.read_ct where id = l.id;
    return query select m.msg_id, l.id, l.user_id, l.movement, l.load_kg, l.clip_path, m.read_ct;
    return;
  end loop;
end;
$$;

revoke all on function public.claim_lift_job(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_lift_job(integer, integer) to service_role;

-- Writes the analysis and, for a successful one, the cue (cue memory: the same
-- active fault adds a session instead of a new row). An Analysis whose
-- `failure` is set marks the lift failed and refunds it. Idempotent per lift.
create or replace function public.complete_lift_job(p_msg_id bigint, p_lift_id uuid, p_analysis jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
  v_cue jsonb := p_analysis -> 'cue';
  v_failure jsonb := p_analysis -> 'failure';
  v_cue_id uuid;
  v_status text;
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

  if jsonb_typeof(v_failure) = 'object' then
    v_status := 'failed';
    update public.lifts set status = 'failed', error = v_failure ->> 'reason', processed_at = now()
     where id = l.id;
    perform public.refund_lift(l.id);
  else
    v_status := 'done';
    update public.lifts set status = 'done', error = null, processed_at = now() where id = l.id;
    if jsonb_typeof(v_cue) = 'object' then
      update public.cues c
         set sessions = c.sessions + 1, text = v_cue ->> 'text', why = v_cue ->> 'why', last_lift_id = l.id
       where c.user_id = l.user_id and c.movement = l.movement
         and c.fault_id = v_cue ->> 'faultId' and c.status = 'trying'
      returning c.id into v_cue_id;
      if v_cue_id is null then
        insert into public.cues (user_id, movement, fault_id, text, why, first_lift_id, last_lift_id)
        values (l.user_id, l.movement, v_cue ->> 'faultId', v_cue ->> 'text', v_cue ->> 'why', l.id, l.id)
        returning id into v_cue_id;
      end if;
    end if;
  end if;

  perform pgmq.archive('lift_jobs', p_msg_id);
  return jsonb_build_object('status', v_status, 'cue_id', v_cue_id);
end;
$$;

revoke all on function public.complete_lift_job(bigint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_lift_job(bigint, uuid, jsonb) to service_role;

create or replace function public.fail_lift_job(p_msg_id bigint, p_lift_id uuid, p_error text, p_retry boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
begin
  select * into l from public.lifts where id = p_lift_id for update;
  if not found or l.status in ('done', 'failed') then
    perform pgmq.archive('lift_jobs', p_msg_id);
    return 'gone';
  end if;
  if p_retry then
    update public.lifts set status = 'queued', error = left(p_error, 500) where id = l.id;
    perform pgmq.set_vt('lift_jobs', p_msg_id, 30);
    return 'queued';
  end if;
  update public.lifts set status = 'failed', error = left(p_error, 500), processed_at = now() where id = l.id;
  perform public.refund_lift(l.id);
  perform pgmq.archive('lift_jobs', p_msg_id);
  return 'failed';
end;
$$;

revoke all on function public.fail_lift_job(bigint, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_lift_job(bigint, uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Coach link. The owner creates it for a finished lift; anyone holding the
-- token reads it (and leaves overrides/notes) through these two functions
-- only, until it expires or is revoked.
-- ---------------------------------------------------------------------------
create or replace function public.create_coach_link(p_lift_id uuid, p_days integer default 14)
returns public.coach_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lifts;
  c public.coach_links;
begin
  select * into l from public.lifts where id = p_lift_id and user_id = auth.uid();
  if not found then
    raise exception 'lift_not_found';
  end if;
  if l.status <> 'done' then
    raise exception 'lift_not_ready';
  end if;
  if p_days is null or p_days < 1 or p_days > 30 then
    raise exception 'bad_expiry';
  end if;
  insert into public.coach_links (user_id, lift_id, expires_at)
  values (l.user_id, l.id, now() + make_interval(days => p_days))
  returning * into c;
  return c;
end;
$$;

revoke all on function public.create_coach_link(uuid, integer) from public, anon, authenticated;
grant execute on function public.create_coach_link(uuid, integer) to authenticated;

create or replace function public.get_coach_link(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'movement', l.movement,
    'loadKg', l.load_kg,
    'liftedAt', l.created_at,
    'analysis', a.analysis,
    'overrides', c.overrides,
    'notes', c.notes,
    'expiresAt', c.expires_at)
  from public.coach_links c
  join public.lifts l on l.id = c.lift_id
  join public.analyses a on a.lift_id = l.id
  where c.token = p_token and c.revoked_at is null and c.expires_at > now();
$$;

revoke all on function public.get_coach_link(text) from public, anon, authenticated;
grant execute on function public.get_coach_link(text) to anon, authenticated;

create or replace function public.save_coach_feedback(p_token text, p_overrides jsonb default null,
                                                      p_notes text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_overrides is not null and jsonb_typeof(p_overrides) <> 'object' then
    raise exception 'bad_overrides';
  end if;
  update public.coach_links
     set overrides = coalesce(p_overrides, overrides), notes = coalesce(p_notes, notes)
   where token = p_token and revoked_at is null and expires_at > now();
  return found;
end;
$$;

revoke all on function public.save_coach_feedback(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_coach_feedback(text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion (the delete-account edge function calls this, then removes
-- the auth user). Storage objects left behind are swept by purge_storage (0003)
-- because their lift no longer exists.
-- ---------------------------------------------------------------------------
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
