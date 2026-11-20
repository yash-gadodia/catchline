-- 0026_lifter_emails.sql
-- Two emails from the owner to a lifter who has given an address (Sign in with Apple): a welcome when they sign in,
-- and one after their first tracked lift. Both ask for a reply; the owner answers every one. Anonymous accounts have
-- no address and get nothing. The `lifter-emails` edge function sends them (hourly, pg_cron) and records each here so
-- nobody is written to twice.
-- Additive only. Service role only: RLS on, no policies, grants stated.

create table if not exists public.lifter_emails (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('welcome', 'first_lift')),
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.lifter_emails enable row level security;
revoke all on public.lifter_emails from public, anon, authenticated;
grant all on public.lifter_emails to service_role;

-- Who is owed which email now.
--   first_lift: a tracked lift at least an hour old, and no first_lift email yet.
--   welcome: signed in within the last two days (not the moment they did), no lift yet, no email of either kind yet.
-- A lifter who signs in and lifts within the hour gets the first_lift email only. Test accounts and App Review's
-- account are left out.
create or replace function public.lifter_emails_due(p_limit integer default 20)
returns table (user_id uuid, email text, display_name text, kind text, founding boolean)
language sql
security definer
set search_path = ''
as $$
  with people as (
    select u.id, u.email::text as email, p.display_name, coalesce(p.founding, false) as founding,
           (select min(l.created_at) from public.lifts l where l.user_id = u.id and l.status = 'done') as first_lift,
           (select min(i.created_at) from auth.identities i where i.user_id = u.id) as signed_in
    from auth.users u
    left join public.profiles p on p.id = u.id
    where coalesce(u.is_anonymous, false) = false
      and u.email is not null
      and u.email not like '%@catchline.test'
      and coalesce(p.display_name, '') <> 'John Apple'
  )
  select id, email, display_name, 'first_lift', founding
  from people
  where first_lift < now() - interval '1 hour'
    and not exists (select 1 from public.lifter_emails e where e.user_id = people.id and e.kind = 'first_lift')
  union all
  select id, email, display_name, 'welcome', founding
  from people
  where first_lift is null
    and signed_in between now() - interval '2 days' and now() - interval '10 minutes'
    and not exists (select 1 from public.lifter_emails e where e.user_id = people.id)
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.lifter_emails_due(integer) from public, anon, authenticated;
grant execute on function public.lifter_emails_due(integer) to service_role;

create or replace function public.lifter_emails_wake()
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
    url := v_url || '/functions/v1/lifter-emails',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'apikey', v_key,
                                  'Content-Type', 'application/json'));
end;
$$;

revoke all on function public.lifter_emails_wake() from public, anon, authenticated;
grant execute on function public.lifter_emails_wake() to service_role;

select cron.unschedule('catchline-lifter-emails') where exists (select 1 from cron.job where jobname = 'catchline-lifter-emails');
select cron.schedule('catchline-lifter-emails', '23 * * * *', 'select public.lifter_emails_wake()');
