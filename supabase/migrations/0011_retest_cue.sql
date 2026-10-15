-- 0011_retest_cue.sql
-- Retest mode: a lift filmed to test a cue names that cue.
--
-- lifts.retest_cue_id: set by create_lift only when the cue is the caller's own,
--   still 'trying' and for the same movement; anything else is stored as null
--   (the lift still goes ahead). Clients cannot write it directly.
-- complete_lift_job: a successful retest counts as a session of its cue and
--   becomes its last lift, even when a different fault is the new headline. A
--   retest whose headline is the same fault is counted once, as before.

alter table public.lifts add column if not exists retest_cue_id uuid
  references public.cues (id) on delete set null;

create index if not exists lifts_retest_cue_idx on public.lifts (retest_cue_id) where retest_cue_id is not null;

drop function if exists public.create_lift(text, numeric);

create or replace function public.create_lift(p_movement text, p_load_kg numeric default null, p_retest_cue_id uuid default null)
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
  v_retest uuid;
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

  if p_retest_cue_id is not null then
    select c.id into v_retest from public.cues c
     where c.id = p_retest_cue_id and c.user_id = v_uid and c.status = 'trying' and c.movement = p_movement;
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

  insert into public.lifts (id, user_id, movement, load_kg, clip_path, charged_to, retest_cue_id)
  values (v_id, v_uid, p_movement, p_load_kg, v_uid::text || '/' || v_id::text, v_charge, v_retest)
  returning * into v_lift;
  return v_lift;
end;
$$;

revoke all on function public.create_lift(text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.create_lift(text, numeric, uuid) to authenticated;

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
    if l.retest_cue_id is not null and l.retest_cue_id is distinct from v_cue_id then
      update public.cues c
         set sessions = c.sessions + 1, last_lift_id = l.id
       where c.id = l.retest_cue_id and c.user_id = l.user_id and c.status = 'trying';
    end if;
  end if;

  perform pgmq.archive('lift_jobs', p_msg_id);
  return jsonb_build_object('status', v_status, 'cue_id', v_cue_id);
end;
$$;

revoke all on function public.complete_lift_job(bigint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_lift_job(bigint, uuid, jsonb) to service_role;
