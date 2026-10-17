-- Refusal codes: a failed analysis carries failure.code, the specific refusal behind its reason (no_reps,
-- movement_mismatch, no_plate, ...). lifts.error now keeps that code so refusals can be counted by cause; an
-- analysis from an older worker (no code) keeps its reason as before. Partial results (failure null, cue null,
-- analysis.noCueReason set) complete as done and count a session, unchanged.

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
    update public.lifts set status = 'failed', error = coalesce(v_failure ->> 'code', v_failure ->> 'reason'),
                            processed_at = now()
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
