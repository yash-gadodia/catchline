-- 0001_catchline_core.sql
-- Catchline schema: profiles, consents, usage counters, lifts, analyses, cues,
-- coach links, feature flags. RLS is owner-only everywhere; anything that
-- crosses users (the coach link) or that the client must not forge (status,
-- counters, analyses) goes through SECURITY DEFINER functions in 0002.
--
-- Grants are explicit on every table: stock Supabase default ACLs hand anon and
-- authenticated ALL on new tables (the Parallax 0036/0037 lesson), so each
-- table starts from `revoke all` and grants back only what the client needs.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles: one per auth user, created by trigger. `plan` is written only by
-- the server (RevenueCat webhook later), never by the client.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  plan text not null default 'free'
    check (plan in ('free', 'hook', 'pull', 'platform', 'founding')),
  push_token text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, push_token) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- consents: append-only evidence log (kind + version + timestamp), per
-- 14-legal-privacy s.9.1. The latest row per kind wins. `upload_privacy` gates
-- create_lift; `model_training` is a separate opt-in, off unless granted.
-- ---------------------------------------------------------------------------
create table if not exists public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('terms', 'health_disclaimer', 'upload_privacy', 'model_training')),
  version text not null check (char_length(version) between 1 and 32),
  granted boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists consents_user_kind_idx on public.consents (user_id, kind, created_at desc, id desc);

alter table public.consents enable row level security;

drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
  for select to authenticated using (user_id = auth.uid());

drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents
  for insert to authenticated with check (user_id = auth.uid());

revoke all on public.consents from public, anon, authenticated;
grant select on public.consents to authenticated;
grant insert (kind, version, granted) on public.consents to authenticated;
grant all on public.consents to service_role;

create or replace function public.consent_granted(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.granted from public.consents c
    where c.user_id = p_user and c.kind = p_kind
    order by c.created_at desc, c.id desc
    limit 1
  ), false);
$$;

revoke all on function public.consent_granted(uuid, text) from public, anon, authenticated;
grant execute on function public.consent_granted(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- usage_counters: what the free and tier caps count. Written only by
-- create_lift (charge) and the failure paths (refund).
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lifetime_count integer not null default 0 check (lifetime_count >= 0),
  period_start date not null default (date_trunc('month', now()))::date,
  period_count integer not null default 0 check (period_count >= 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  updated_at timestamptz not null default now()
);

alter table public.usage_counters enable row level security;

drop policy if exists usage_select_own on public.usage_counters;
create policy usage_select_own on public.usage_counters
  for select to authenticated using (user_id = auth.uid());

revoke all on public.usage_counters from public, anon, authenticated;
grant select on public.usage_counters to authenticated;
grant all on public.usage_counters to service_role;

-- ---------------------------------------------------------------------------
-- lifts: one uploaded clip. Status machine:
--   uploading -> queued -> processing -> done | failed
-- (processing -> queued again on a retryable worker error).
-- clip_path is the object name in the raw-clips bucket: '<user_id>/<lift_id>'.
-- charged_to records which allowance paid for it ('cap' or a 'bonus' credit),
-- so a failed or expired lift is refunded exactly once (then set to null).
-- ---------------------------------------------------------------------------
create table if not exists public.lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movement text not null check (movement in
    ('snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu')),
  load_kg numeric(5, 1) check (load_kg is null or (load_kg > 0 and load_kg < 500)),
  status text not null default 'uploading'
    check (status in ('queued', 'uploading', 'processing', 'done', 'failed')),
  clip_path text not null unique,
  error text,
  charged_to text check (charged_to in ('cap', 'bonus')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  queued_at timestamptz,
  processed_at timestamptz,
  clip_deleted_at timestamptz
);

create index if not exists lifts_user_created_idx on public.lifts (user_id, created_at desc);
create index if not exists lifts_status_idx on public.lifts (status, created_at);

alter table public.lifts enable row level security;

drop policy if exists lifts_select_own on public.lifts;
create policy lifts_select_own on public.lifts
  for select to authenticated using (user_id = auth.uid());

drop policy if exists lifts_delete_own on public.lifts;
create policy lifts_delete_own on public.lifts
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.lifts from public, anon, authenticated;
grant select, delete on public.lifts to authenticated;
grant all on public.lifts to service_role;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lifts_touch on public.lifts;
create trigger lifts_touch before update on public.lifts
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- analyses: the Analysis JSON (src/analysis/types.ts, version 1) per lift.
-- Written only by the worker (complete_lift_job).
-- ---------------------------------------------------------------------------
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null unique references public.lifts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis jsonb not null check (analysis ->> 'version' = '1'),
  created_at timestamptz not null default now()
);

create index if not exists analyses_user_idx on public.analyses (user_id, created_at desc);

alter table public.analyses enable row level security;

drop policy if exists analyses_select_own on public.analyses;
create policy analyses_select_own on public.analyses
  for select to authenticated using (user_id = auth.uid());

revoke all on public.analyses from public, anon, authenticated;
grant select on public.analyses to authenticated;
grant all on public.analyses to service_role;

-- ---------------------------------------------------------------------------
-- cues: cue memory. One active ('trying') cue per user + movement + fault; a
-- repeat of the same fault bumps `sessions` instead of adding a row. The user
-- moves it to stuck / didnt_stick / dropped.
-- ---------------------------------------------------------------------------
create table if not exists public.cues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movement text not null,
  fault_id text not null,
  text text not null,
  why text,
  status text not null default 'trying'
    check (status in ('trying', 'stuck', 'didnt_stick', 'dropped')),
  sessions integer not null default 1 check (sessions >= 1),
  first_lift_id uuid references public.lifts (id) on delete set null,
  last_lift_id uuid references public.lifts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cues_one_trying_idx
  on public.cues (user_id, movement, fault_id) where status = 'trying';
create index if not exists cues_user_idx on public.cues (user_id, updated_at desc);

alter table public.cues enable row level security;

drop policy if exists cues_select_own on public.cues;
create policy cues_select_own on public.cues
  for select to authenticated using (user_id = auth.uid());

drop policy if exists cues_update_own on public.cues;
create policy cues_update_own on public.cues
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.cues from public, anon, authenticated;
grant select on public.cues to authenticated;
grant update (status) on public.cues to authenticated;
grant all on public.cues to service_role;

drop trigger if exists cues_touch on public.cues;
create trigger cues_touch before update on public.cues
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- coach_links: a no-login, expiring, revocable read link for one lift. The
-- coach never touches the table; get_coach_link / save_coach_feedback (0002)
-- are the only way in by token.
-- ---------------------------------------------------------------------------
create table if not exists public.coach_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lift_id uuid not null references public.lifts (id) on delete cascade,
  token text not null unique
    default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'),
  overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(overrides) = 'object' and pg_column_size(overrides) <= 8192),
  notes text check (notes is null or char_length(notes) <= 4000),
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_links_lift_idx on public.coach_links (lift_id);

alter table public.coach_links enable row level security;

drop policy if exists coach_links_select_own on public.coach_links;
create policy coach_links_select_own on public.coach_links
  for select to authenticated using (user_id = auth.uid());

drop policy if exists coach_links_update_own on public.coach_links;
create policy coach_links_update_own on public.coach_links
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists coach_links_delete_own on public.coach_links;
create policy coach_links_delete_own on public.coach_links
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.coach_links from public, anon, authenticated;
grant select, delete on public.coach_links to authenticated;
grant update (revoked_at) on public.coach_links to authenticated;
grant all on public.coach_links to service_role;

drop trigger if exists coach_links_touch on public.coach_links;
create trigger coach_links_touch before update on public.coach_links
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- feature_flags (kept from Parallax 0042; src/lib/flags.ts reads it).
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key text not null primary key,
  enabled boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_select on public.feature_flags
  for select to authenticated using (true);

revoke all on public.feature_flags from public, anon, authenticated;
grant select on public.feature_flags to authenticated;
grant all on public.feature_flags to service_role;

-- ---------------------------------------------------------------------------
-- New auth user -> profile + usage row.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.usage_counters (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime: the app subscribes to its lift's status and the analysis insert.
-- postgres_changes silently never fires for tables missing from the
-- publication (Parallax 0047), so they are added here, with the schema.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lifts') then
    alter publication supabase_realtime add table public.lifts;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'analyses') then
    alter publication supabase_realtime add table public.analyses;
  end if;
end;
$$;
