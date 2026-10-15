-- 0008_ops_health.sql
-- Ops monitoring: the worker writes a heartbeat, and pg_cron checks every
-- 5 minutes whether lifts are stuck, the worker is silent, or lifts are
-- failing. A condition that newly holds opens one ops_alerts row (one incident
-- = one alert); when it clears the row closes and a recovery goes out. Each
-- change is posted (pg_net) to the ops-alert edge function, which pushes to the
-- owner's phone. The URL + service key come from Vault, as for purge_storage.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  seen_at timestamptz not null default now(),
  version text
);

alter table public.worker_heartbeats enable row level security;
revoke all on public.worker_heartbeats from public, anon, authenticated;
grant all on public.worker_heartbeats to service_role;

create or replace function public.worker_heartbeat(p_worker text, p_version text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.worker_heartbeats (worker_id, seen_at, version)
  values (p_worker, now(), p_version)
  on conflict (worker_id) do update set seen_at = excluded.seen_at, version = excluded.version;
$$;

revoke all on function public.worker_heartbeat(text, text) from public, anon, authenticated;
grant execute on function public.worker_heartbeat(text, text) to service_role;

create table if not exists public.ops_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('queue_stuck', 'worker_silent', 'failures')),
  opened_at timestamptz not null,
  closed_at timestamptz,
  detail jsonb
);

create unique index if not exists ops_alerts_one_open_per_kind on public.ops_alerts (kind) where closed_at is null;

alter table public.ops_alerts enable row level security;
revoke all on public.ops_alerts from public, anon, authenticated;
grant all on public.ops_alerts to service_role;

-- The numbers the alerts are judged on, as of p_now.
--   stuck: lifts queued/processing for more than 5 min (since queued, or created)
--   worker_seen_min: minutes since the newest heartbeat (null: never seen)
--   failed_30m: lifts that failed in the last 30 min
create or replace function public.ops_health(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'stuck', (select count(*)::int from public.lifts
               where status in ('queued', 'processing')
                 and coalesce(queued_at, created_at) < p_now - interval '5 minutes'),
    'oldest_min', (select floor(extract(epoch from p_now - min(coalesce(queued_at, created_at))) / 60)::int
                     from public.lifts where status in ('queued', 'processing')),
    'worker_seen_min', (select floor(extract(epoch from p_now - max(seen_at)) / 60)::int
                          from public.worker_heartbeats),
    'failed_30m', (select count(*)::int from public.lifts
                    where status = 'failed' and processed_at > p_now - interval '30 minutes'));
$$;

revoke all on function public.ops_health(timestamptz) from public, anon, authenticated;
grant execute on function public.ops_health(timestamptz) to service_role;

-- Opens/closes ops_alerts rows and posts the changes to ops-alert. Returns
-- {health, changes}, or null (and changes nothing) while the Vault secrets are
-- missing, so an incident that starts before they are set still alerts later.
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
    'worker_silent', coalesce((h ->> 'worker_seen_min')::int >= 3, true),
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

revoke all on function public.ops_health_check(timestamptz) from public, anon, authenticated;
grant execute on function public.ops_health_check(timestamptz) to service_role;

select cron.schedule('catchline-health', '*/5 * * * *', 'select public.ops_health_check()');
