-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- profiles: one row per person, extends auth.users
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  intents text[] default '{}',
  spice_level text default 'flirty',
  notify_time time,
  notify_tz text,
  push_token text,
  created_at timestamptz default now(),
  primary key (id)
);

-- couples: the pairing unit
create table if not exists public.couples (
  id uuid not null primary key default gen_random_uuid(),
  member_a uuid not null references public.profiles(id) on delete restrict,
  member_b uuid references public.profiles(id) on delete restrict,
  invite_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active')),
  together_since date,
  streak int default 0,
  longest_streak int default 0,
  freezes_remaining int default 2,
  last_played_on date,
  wavelength_avg numeric,
  plus boolean default false,
  created_at timestamptz default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on both tables
alter table public.profiles enable row level security;
alter table public.couples enable row level security;

-- profiles: allow SELECT own profile
create policy "select_own_profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- profiles: allow UPDATE own profile
create policy "update_own_profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- profiles: allow SELECT partner's profile (if both are in an active couple together)
create policy "select_partner_profile"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.couples c
      where c.status = 'active'
        and (
          (c.member_a = auth.uid() and c.member_b = id)
          or (c.member_b = auth.uid() and c.member_a = id)
        )
    )
  );

-- couples: allow SELECT if user is a member (pending or active)
create policy "select_own_couple"
  on public.couples
  for select
  using (auth.uid() = member_a or auth.uid() = member_b);

-- couples: allow UPDATE if user is a member (pending or active)
create policy "update_own_couple"
  on public.couples
  for update
  using (auth.uid() = member_a or auth.uid() = member_b)
  with check (auth.uid() = member_a or auth.uid() = member_b);

-- couples: prevent direct INSERT (only via create_couple function)
create policy "prevent_insert"
  on public.couples
  for insert
  with check (false);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- gen_invite_code: generate a unique 4-letter + dash + 4-digit code
create or replace function public.gen_invite_code()
returns text
language plpgsql
as $$
declare
  code text;
  max_attempts int := 100;
  attempt int := 0;
begin
  loop
    attempt := attempt + 1;
    if attempt > max_attempts then
      raise exception 'Failed to generate unique invite code after % attempts', max_attempts;
    end if;

    -- Generate 4 random uppercase alphanumeric + '-' + 4 random digits
    code := (
      substring('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
      substring('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
      substring('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
      substring('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::int + 1, 1) ||
      '-' ||
      lpad((floor(random() * 10000)::int)::text, 4, '0')
    );

    -- Check uniqueness in couples table
    if not exists (select 1 from public.couples where invite_code = code) then
      return code;
    end if;
  end loop;
end;
$$;

-- create_couple: creates a new pending couple with caller as member_a
create or replace function public.create_couple()
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  new_couple public.couples;
begin
  -- Guard: caller must not already be member of a pending/active couple
  if exists (
    select 1
    from public.couples
    where (member_a = auth.uid() or member_b = auth.uid())
      and status in ('pending', 'active')
  ) then
    raise exception 'User is already a member of a pending or active couple';
  end if;

  -- Generate invite code
  new_code := public.gen_invite_code();

  -- Insert new couple with caller as member_a, status='pending'
  insert into public.couples (member_a, invite_code, status)
  values (auth.uid(), new_code, 'pending')
  returning * into new_couple;

  return new_couple;
end;
$$;

-- join_couple: caller joins a pending couple as member_b
create or replace function public.join_couple(p_code text)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple public.couples;
begin
  -- Find the couple by invite code
  select * into target_couple
  from public.couples
  where invite_code = p_code;

  -- Error if not found
  if target_couple is null then
    raise exception 'Invite code not found';
  end if;

  -- Error if not pending
  if target_couple.status != 'pending' then
    raise exception 'Couple is not pending (status: %)', target_couple.status;
  end if;

  -- Error if caller is member_a
  if target_couple.member_a = auth.uid() then
    raise exception 'Cannot join a couple as member_a';
  end if;

  -- Error if caller already in a couple
  if exists (
    select 1
    from public.couples
    where (member_a = auth.uid() or member_b = auth.uid())
      and status in ('pending', 'active')
  ) then
    raise exception 'User is already a member of a pending or active couple';
  end if;

  -- Update the couple: set member_b, status='active', together_since=today
  update public.couples
  set member_b = auth.uid(),
      status = 'active',
      together_since = current_date
  where id = target_couple.id
  returning * into target_couple;

  return target_couple;
end;
$$;

-- handle_new_user: trigger function to insert profile row when auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    new.raw_user_meta_data->>'display_name'
  );
  return new;
end;
$$;

-- Create trigger for auth.users INSERT
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================================================

grant execute on function public.create_couple() to authenticated;
grant execute on function public.join_couple(text) to authenticated;
