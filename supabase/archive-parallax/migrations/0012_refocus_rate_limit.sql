-- 0012_refocus_rate_limit.sql
-- Per-user rate limit for the `refocus` edge function. Refocus spends real
-- Anthropic tokens, so cap how often any one user can call it. The edge fn calls
-- claim_refocus_slot() with the caller's JWT before hitting Anthropic; a null
-- auth.uid() (e.g. an anon-key call with no real user) is rejected too.

create table if not exists public.refocus_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists refocus_calls_user_time
  on public.refocus_calls (user_id, created_at desc);

alter table public.refocus_calls enable row level security;
-- No client policies + no grants: only the SECURITY DEFINER function below touches
-- this table. (RLS on + zero policies = clients read/write nothing directly.)

-- Returns true and records the call if the caller is under the limit in the
-- window; false otherwise (over limit, or no authenticated user).
create or replace function public.claim_refocus_slot(
  p_limit int default 12,
  p_window_secs int default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return false;
  end if;

  -- light GC of rows well outside any window
  delete from public.refocus_calls
  where created_at < now() - make_interval(secs => p_window_secs * 6);

  select count(*) into v_count
  from public.refocus_calls
  where user_id = v_uid
    and created_at > now() - make_interval(secs => p_window_secs);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.refocus_calls (user_id) values (v_uid);
  return true;
end;
$$;

grant execute on function public.claim_refocus_slot(int, int) to authenticated;
