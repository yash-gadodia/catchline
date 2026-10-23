-- 0020_problem_reports.sql
-- 3.1 "Report a problem": the lifter's own words plus the build they ran, written
-- from the phone's local outbox once it is online. The client picks the id, so a
-- resend after a timeout hits the primary key and changes nothing.
-- Insert-only for the owner; nobody reads them back but service_role.
-- Additive only: 3.0 binaries never touch it.

create table if not exists public.problem_reports (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  app_version text check (char_length(app_version) <= 32),
  update_id text check (char_length(update_id) <= 64),
  device text check (char_length(device) <= 128),
  lift_id text check (char_length(lift_id) <= 64),
  context text check (char_length(context) <= 500),
  reported_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.problem_reports enable row level security;

drop policy if exists problem_reports_insert_own on public.problem_reports;
create policy problem_reports_insert_own on public.problem_reports
  for insert to authenticated with check (user_id = auth.uid());

revoke all on public.problem_reports from public, anon, authenticated;
grant insert (id, body, app_version, update_id, device, lift_id, context, reported_at) on public.problem_reports to authenticated;
grant all on public.problem_reports to service_role;
