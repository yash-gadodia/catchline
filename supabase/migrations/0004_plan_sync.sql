-- 0004_plan_sync.sql
-- RevenueCat -> profiles.plan. The revenuecat-webhook edge function (service
-- role) calls apply_plan(); clients still cannot write plan or founding.
-- founding_seats() is the public seat counter for the founding offer.

alter table public.profiles add column if not exists founding boolean not null default false;
alter table public.profiles add column if not exists plan_synced_at timestamptz;

-- Processed webhook events, for idempotency. No PII: event id, type, user id.
create table if not exists public.revenuecat_events (
  id text primary key,
  type text not null,
  user_id uuid references auth.users (id) on delete cascade,
  received_at timestamptz not null default now()
);

alter table public.revenuecat_events enable row level security;
revoke all on public.revenuecat_events from public, anon, authenticated;
grant all on public.revenuecat_events to service_role;

-- Sets one user's plan from a store event. Founding is permanent: once set it
-- floors the plan at 'founding' (only Platform ranks above it). p_founding:
-- true grants it, false clears it (a TRANSFER away), null keeps it.
-- Returns 'applied', 'duplicate' (event id seen), 'stale' (older than the last
-- applied event) or 'no_profile'.
create or replace function public.apply_plan(
  p_user uuid,
  p_plan text,
  p_founding boolean,
  p_event_id text,
  p_event_type text,
  p_event_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_synced timestamptz;
  v_founding boolean;
begin
  if p_plan not in ('free', 'hook', 'pull', 'platform', 'founding') then
    raise exception 'invalid_plan';
  end if;
  select plan_synced_at, founding into v_synced, v_founding
    from public.profiles where id = p_user for update;
  if not found then
    return 'no_profile';
  end if;
  insert into public.revenuecat_events (id, type, user_id)
    values (p_event_id, p_event_type, p_user)
    on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;
  if v_synced is not null and p_event_at < v_synced then
    return 'stale';
  end if;
  v_founding := coalesce(p_founding, v_founding);
  update public.profiles
     set plan = case when v_founding and p_plan in ('free', 'hook', 'pull') then 'founding' else p_plan end,
         founding = v_founding,
         plan_synced_at = p_event_at
   where id = p_user;
  return 'applied';
end;
$$;

revoke all on function public.apply_plan(uuid, text, boolean, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_plan(uuid, text, boolean, text, text, timestamptz) to service_role;

-- Founding seats sold, for the paywall counter. Counts the founding flag, so a
-- founder who later subscribes to Platform still holds a seat. No PII.
create or replace function public.founding_seats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('taken', count(*)::int, 'cap', 500)
    from public.profiles
   where founding;
$$;

revoke all on function public.founding_seats() from public;
grant execute on function public.founding_seats() to anon, authenticated, service_role;
