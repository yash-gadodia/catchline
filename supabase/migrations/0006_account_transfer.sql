-- 0006_account_transfer.sql
-- Anonymous -> Apple account transfer. The app starts anonymous; when the lifter
-- signs in with Apple on a phone that already has lifts, those rows move to the
-- Apple user so the free cap, the plan and the library follow the person.
--
-- Flow (client): begin_account_transfer() as the anonymous user -> token;
-- signInWithIdToken (new session) -> complete_account_transfer(token) as the
-- Apple user. The token is single-use and expires after 15 minutes. Nothing
-- reads account_transfers but these two SECURITY DEFINER functions.

create table if not exists public.account_transfers (
  token uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.account_transfers enable row level security;

revoke all on public.account_transfers from public, anon, authenticated;
grant all on public.account_transfers to service_role;

-- The anonymous caller mints a token for its own rows. One open token per user.
create or replace function public.begin_account_transfer()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not_anonymous';
  end if;
  delete from public.account_transfers where from_user = v_uid;
  insert into public.account_transfers (from_user) values (v_uid) returning token into v_token;
  return v_token;
end;
$$;

revoke all on function public.begin_account_transfer() from public, anon, authenticated;
grant execute on function public.begin_account_transfer() to authenticated;

-- The signed-in (non-anonymous) caller claims the token's rows. Reassigns every
-- owner-scoped row, merges the usage counters (sums, so the free cap cannot be
-- reset by signing in), keeps the higher plan, and returns what moved.
create or replace function public.complete_account_transfer(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_from uuid;
  v_lifts integer := 0;
  v_analyses integer := 0;
  v_cues integer := 0;
  v_consents integer := 0;
  v_coach_links integer := 0;
  v_events integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'anonymous_caller';
  end if;

  delete from public.account_transfers where created_at < now() - interval '15 minutes';

  delete from public.account_transfers
   where token = p_token
  returning from_user into v_from;
  if v_from is null then
    raise exception 'transfer_not_found';
  end if;
  if v_from = v_uid then
    raise exception 'same_user';
  end if;

  with moved as (
    update public.lifts set user_id = v_uid, updated_at = now() where user_id = v_from returning 1
  ) select count(*) into v_lifts from moved;

  with moved as (
    update public.analyses set user_id = v_uid where user_id = v_from returning 1
  ) select count(*) into v_analyses from moved;

  -- Only one 'trying' cue per (user, movement, fault): the kept account's wins.
  update public.cues s
     set status = 'dropped', updated_at = now()
   where s.user_id = v_from and s.status = 'trying'
     and exists (select 1 from public.cues t
                  where t.user_id = v_uid and t.status = 'trying'
                    and t.movement = s.movement and t.fault_id = s.fault_id);
  with moved as (
    update public.cues set user_id = v_uid where user_id = v_from returning 1
  ) select count(*) into v_cues from moved;

  with moved as (
    update public.consents set user_id = v_uid where user_id = v_from returning 1
  ) select count(*) into v_consents from moved;

  with moved as (
    update public.coach_links set user_id = v_uid, updated_at = now() where user_id = v_from returning 1
  ) select count(*) into v_coach_links from moved;

  with moved as (
    update public.revenuecat_events set user_id = v_uid where user_id = v_from returning 1
  ) select count(*) into v_events from moved;

  update public.usage_counters t
     set lifetime_count = t.lifetime_count + s.lifetime_count,
         period_count = case
           when t.period_start = s.period_start then t.period_count + s.period_count
           when s.period_start > t.period_start then s.period_count
           else t.period_count end,
         period_start = greatest(t.period_start, s.period_start),
         bonus_credits = t.bonus_credits + s.bonus_credits,
         updated_at = now()
    from public.usage_counters s
   where t.user_id = v_uid and s.user_id = v_from;
  update public.usage_counters set user_id = v_uid
   where user_id = v_from
     and not exists (select 1 from public.usage_counters where user_id = v_uid);
  delete from public.usage_counters where user_id = v_from;

  update public.profiles t
     set founding = t.founding or s.founding,
         plan = case
           when (t.founding or s.founding) and
                (case s.plan when 'platform' then 3 when 'pull' then 2 when 'founding' then 2 when 'hook' then 1 else 0 end) <= 2 and
                (case t.plan when 'platform' then 3 when 'pull' then 2 when 'founding' then 2 when 'hook' then 1 else 0 end) <= 2
             then 'founding'
           when (case s.plan when 'platform' then 3 when 'pull' then 2 when 'founding' then 2 when 'hook' then 1 else 0 end) >
                (case t.plan when 'platform' then 3 when 'pull' then 2 when 'founding' then 2 when 'hook' then 1 else 0 end)
             then s.plan
           else t.plan end,
         plan_synced_at = greatest(t.plan_synced_at, s.plan_synced_at),
         display_name = coalesce(t.display_name, s.display_name)
    from public.profiles s
   where t.id = v_uid and s.id = v_from;

  return jsonb_build_object(
    'from_user', v_from,
    'lifts', v_lifts,
    'analyses', v_analyses,
    'cues', v_cues,
    'consents', v_consents,
    'coach_links', v_coach_links,
    'revenuecat_events', v_events
  );
end;
$$;

revoke all on function public.complete_account_transfer(uuid) from public, anon, authenticated;
grant execute on function public.complete_account_transfer(uuid) to authenticated;
