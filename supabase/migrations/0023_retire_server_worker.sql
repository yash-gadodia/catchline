-- 0023_retire_server_worker.sql
-- The Modal worker is stopped (3 Nov 2026): 3.1 analyses on the phone and no lift has reached the
-- server since 23 Oct. Only a 3.0 or older app still calls enqueue_lift; its lift now fails at once
-- ('update_required', the analysis refunded) instead of waiting in a queue nobody drains, and a
-- silent worker heartbeat no longer raises an alert.

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
     set status = 'failed', error = 'update_required', processed_at = now(),
         pose_source = case when exists (select 1 from storage.objects o
                                          where o.bucket_id = 'raw-clips' and o.name = l.clip_path || '.pose.json')
                            then 'device' else 'server' end
   where id = p_lift_id
   returning * into l;
  perform public.refund_lift(l.id);
  return l;
end;
$$;

create or replace function public.ops_health_check(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  h jsonb := public.ops_health(p_now);
  v_firing jsonb;
  v_changes jsonb := '[]'::jsonb;
  k text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'catchline_service_key';
  if v_url is null or v_key is null then
    raise warning 'ops_health_check: vault secrets catchline_api_url / catchline_service_key are not set';
    return null;
  end if;

  v_firing := jsonb_build_object(
    'queue_stuck', (h ->> 'stuck')::int > 0,
    'worker_silent', false,
    'failures', (h ->> 'failed_30m')::int > 3);

  for k in select jsonb_object_keys(v_firing) order by 1 loop
    if (v_firing ->> k)::boolean then
      insert into public.ops_alerts (kind, opened_at, detail) values (k, p_now, h)
        on conflict (kind) where closed_at is null do nothing;
      if found then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', k, 'state', 'open'));
      end if;
    else
      update public.ops_alerts set closed_at = p_now where kind = k and closed_at is null;
      if found then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object('kind', k, 'state', 'resolved'));
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_changes) > 0 then
    perform net.http_post(
      url := v_url || '/functions/v1/ops-alert',
      body := jsonb_build_object('changes', v_changes, 'health', h),
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                    'Content-Type', 'application/json'));
  end if;
  return jsonb_build_object('health', h, 'changes', v_changes);
end;
$$;
