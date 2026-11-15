-- 0025_referrals.sql
-- Give a month, get a month (TASKS-referrals.md, decided 15-11-2026).
--
-- A signed-in lifter has one code. A new lifter claims a code within 30 days of
-- their account, signed in with Apple; one claim per Apple ID ever, even after
-- the account is deleted (referral_claimed_subs keeps a hash, not the id).
-- The referral qualifies when the invited lifter has a done lift (at claim time
-- or later, through the lifts trigger). Qualifying writes reward rows:
--   invited  30 days for the invited lifter (friend and coach codes)
--   inviter  30 days for the owner of a friend code
--   milestone_3  90 days at the owner's 3rd qualified friend
--   milestone_10 365 days at the 10th, which also earns the badge
-- referral-rewards (edge function) grants pending rows as RevenueCat
-- promotional time on the `pull` entitlement, at most 12 months ahead of now.
-- Coach codes are made by the owner (admin_make_coach); coaches get Pro for
-- life by hand and a cash share computed outside the database.
-- Tables are read only through these functions; RLS is on with no policies.

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4,12}$'),
  kind text not null default 'friend' check (kind in ('friend', 'coach')),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referee_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('friend', 'coach')),
  status text not null default 'claimed' check (status in ('claimed', 'qualified')),
  claimed_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (referrer_id <> referee_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, status);

create table if not exists public.referral_claimed_subs (
  sub_hash text primary key,
  claimed_at timestamptz not null default now()
);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  referral_id uuid references public.referrals (id) on delete set null,
  reason text not null check (reason in ('invited', 'inviter', 'milestone_3', 'milestone_10')),
  days integer not null check (days > 0),
  status text not null default 'pending' check (status in ('pending', 'granted', 'capped', 'failed')),
  granted_until timestamptz,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  granted_at timestamptz
);
create unique index if not exists referral_rewards_once
  on public.referral_rewards (user_id, referral_id, reason) where reason in ('invited', 'inviter');
create unique index if not exists referral_rewards_milestone_once
  on public.referral_rewards (user_id, reason) where reason in ('milestone_3', 'milestone_10');
create index if not exists referral_rewards_pending_idx on public.referral_rewards (status) where status in ('pending', 'failed');

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_claimed_subs enable row level security;
alter table public.referral_rewards enable row level security;

revoke all on public.referral_codes, public.referrals, public.referral_claimed_subs, public.referral_rewards
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- helpers

create or replace function public.referral_signed_in_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign_in_required';
  end if;
  return v_uid;
end;
$$;

-- First name letters, up to 6, then 2 digits; LIFT when there is no usable name.
create or replace function public.referral_new_code(p_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text := left(upper(regexp_replace(split_part(coalesce(trim(p_name), ''), ' ', 1), '[^A-Za-z]', '', 'g')), 6);
  v_code text;
begin
  if char_length(v_base) < 3 then
    v_base := 'LIFT';
  end if;
  for i in 1..50 loop
    v_code := v_base || lpad((floor(random() * case when i < 20 then 100 else 10000 end))::int::text,
                             case when i < 20 then 2 else 4 end, '0');
    exit when not exists (select 1 from public.referral_codes c where c.code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.referral_wake_rewards()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'catchline_api_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'catchline_service_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/referral-rewards',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                  'Content-Type', 'application/json'));
end;
$$;

-- Qualify one claimed referral and write its rewards. Returns true when it qualified now.
create or replace function public.referral_qualify(p_referral uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.referrals;
  v_count integer;
begin
  update public.referrals
     set status = 'qualified', qualified_at = now()
   where id = p_referral and status = 'claimed'
  returning * into r;
  if not found then
    return false;
  end if;

  insert into public.referral_rewards (user_id, referral_id, reason, days)
  values (r.referee_id, r.id, 'invited', 30)
  on conflict do nothing;

  if r.kind = 'friend' then
    insert into public.referral_rewards (user_id, referral_id, reason, days)
    values (r.referrer_id, r.id, 'inviter', 30)
    on conflict do nothing;

    select count(*) into v_count
      from public.referrals q
     where q.referrer_id = r.referrer_id and q.status = 'qualified' and q.kind = 'friend';
    if v_count >= 3 then
      insert into public.referral_rewards (user_id, referral_id, reason, days)
      values (r.referrer_id, r.id, 'milestone_3', 90)
      on conflict do nothing;
    end if;
    if v_count >= 10 then
      insert into public.referral_rewards (user_id, referral_id, reason, days)
      values (r.referrer_id, r.id, 'milestone_10', 365)
      on conflict do nothing;
    end if;
  end if;

  perform public.referral_wake_rewards();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- app RPCs

-- The caller's code (made on first call) and progress.
create or replace function public.my_referral()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.referral_signed_in_user();
  c public.referral_codes;
  v_name text;
  v_qualified integer;
  v_joined integer;
  v_days integer;
  v_until timestamptz;
  v_friends jsonb;
begin
  select * into c from public.referral_codes where user_id = v_uid;
  if not found then
    select display_name into v_name from public.profiles where id = v_uid;
    insert into public.referral_codes (user_id, code)
    values (v_uid, public.referral_new_code(v_name))
    on conflict (user_id) do nothing;
    select * into c from public.referral_codes where user_id = v_uid;
  end if;

  select count(*), count(*) filter (where status = 'qualified')
    into v_joined, v_qualified
    from public.referrals where referrer_id = v_uid;

  select coalesce(sum(days) filter (where status = 'granted'), 0), max(granted_until)
    into v_days, v_until
    from public.referral_rewards where user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', nullif(split_part(coalesce(p.display_name, ''), ' ', 1), ''),
           'status', f.status,
           'at', coalesce(f.qualified_at, f.claimed_at)) order by f.claimed_at desc), '[]'::jsonb)
    into v_friends
    from (select * from public.referrals where referrer_id = v_uid order by claimed_at desc limit 50) f
    left join public.profiles p on p.id = f.referee_id;

  return jsonb_build_object(
    'code', c.code,
    'kind', c.kind,
    'joined', v_joined,
    'qualified', v_qualified,
    'daysEarned', v_days,
    'proUntil', v_until,
    'badge', v_qualified >= 10,
    'nextMilestone', case when v_qualified < 3 then 3 when v_qualified < 10 then 10 else null end,
    'friends', v_friends);
end;
$$;

-- Claim a friend's or coach's code. Errors: code_not_found, own_code,
-- already_claimed, too_late, sign_in_required.
create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.referral_signed_in_user();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c public.referral_codes;
  v_created timestamptz;
  v_sub text;
  v_id uuid;
  v_qualified boolean := false;
  v_name text;
begin
  select * into c from public.referral_codes where code = v_code;
  if not found then
    raise exception 'code_not_found';
  end if;
  if c.user_id = v_uid then
    raise exception 'own_code';
  end if;
  if exists (select 1 from public.referrals where referee_id = v_uid) then
    raise exception 'already_claimed';
  end if;

  select coalesce(p.created_at, u.created_at) into v_created
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = v_uid;
  if v_created < now() - interval '30 days' then
    raise exception 'too_late';
  end if;

  select i.provider_id into v_sub from auth.identities i where i.user_id = v_uid and i.provider = 'apple' limit 1;
  if v_sub is null then
    raise exception 'sign_in_required';
  end if;
  begin
    insert into public.referral_claimed_subs (sub_hash)
    values (encode(extensions.digest(v_sub, 'sha256'), 'hex'));
  exception when unique_violation then
    raise exception 'already_claimed';
  end;

  insert into public.referrals (referrer_id, referee_id, code, kind)
  values (c.user_id, v_uid, c.code, c.kind)
  returning id into v_id;

  if exists (select 1 from public.lifts l where l.user_id = v_uid and l.status = 'done') then
    v_qualified := public.referral_qualify(v_id);
  end if;

  select nullif(split_part(coalesce(display_name, ''), ' ', 1), '') into v_name
    from public.profiles where id = c.user_id;
  return jsonb_build_object('status', case when v_qualified then 'qualified' else 'claimed' end,
                            'kind', c.kind, 'inviter', v_name);
end;
$$;

-- For the public invite page: the inviter's first name, or null for an unknown code.
create or replace function public.referral_preview(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', nullif(split_part(coalesce(p.display_name, ''), ' ', 1), ''), 'kind', c.kind)
    from public.referral_codes c
    left join public.profiles p on p.id = c.user_id
   where c.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- A first done lift qualifies a claimed referral.
create or replace function public.referral_on_lift_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    select id into v_id from public.referrals where referee_id = new.user_id and status = 'claimed';
    if v_id is not null then
      perform public.referral_qualify(v_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists referral_on_lift_done on public.lifts;
create trigger referral_on_lift_done
after insert or update of status on public.lifts
for each row execute function public.referral_on_lift_done();

-- ---------------------------------------------------------------------------
-- service role: rewards and coaches

create or replace function public.admin_make_coach(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  insert into public.referral_codes (user_id, code, kind)
  values (p_user, v_code, 'coach')
  on conflict (user_id) do update set code = excluded.code, kind = 'coach';
  return jsonb_build_object('user', p_user, 'code', v_code, 'kind', 'coach');
end;
$$;

-- Rewards to grant, oldest first, with the user's latest granted end so the
-- function can stack time without reading RevenueCat first.
create or replace function public.referral_rewards_due(p_user uuid default null, p_limit integer default 50)
returns table (id uuid, user_id uuid, reason text, days integer, attempts integer, banked_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.user_id, r.reason, r.days, r.attempts,
         (select max(g.granted_until) from public.referral_rewards g
           where g.user_id = r.user_id and g.status = 'granted')
    from public.referral_rewards r
   where r.status in ('pending', 'failed') and r.attempts < 5
     and (p_user is null or r.user_id = p_user)
   order by r.created_at
   limit p_limit;
$$;

create or replace function public.referral_reward_result(p_id uuid, p_status text, p_until timestamptz, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.referral_rewards
     set status = p_status,
         granted_until = coalesce(p_until, granted_until),
         granted_at = case when p_status = 'granted' then now() else granted_at end,
         attempts = attempts + 1,
         error = p_error
   where id = p_id;
$$;

revoke all on function public.referral_signed_in_user() from public, anon;
revoke all on function public.referral_new_code(text) from public, anon, authenticated;
revoke all on function public.referral_wake_rewards() from public, anon, authenticated;
revoke all on function public.referral_qualify(uuid) from public, anon, authenticated;
revoke all on function public.referral_on_lift_done() from public, anon, authenticated;
revoke all on function public.admin_make_coach(uuid, text) from public, anon, authenticated;
revoke all on function public.referral_rewards_due(uuid, integer) from public, anon, authenticated;
revoke all on function public.referral_reward_result(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.my_referral() from public, anon;
revoke all on function public.claim_referral(text) from public, anon;
revoke all on function public.referral_preview(text) from public;

grant execute on function public.referral_signed_in_user() to authenticated;
grant execute on function public.my_referral() to authenticated;
grant execute on function public.claim_referral(text) to authenticated;
grant execute on function public.referral_preview(text) to anon, authenticated;
grant execute on function public.admin_make_coach(uuid, text) to service_role;
grant execute on function public.referral_rewards_due(uuid, integer) to service_role;
grant execute on function public.referral_reward_result(uuid, text, timestamptz, text) to service_role;
