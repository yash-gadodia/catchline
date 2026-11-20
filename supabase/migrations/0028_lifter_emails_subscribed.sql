-- 0028_lifter_emails_subscribed.sql
-- A third email from the owner: a thank-you when a lifter starts Pro or buys the founding lifetime (the first
-- INITIAL_PURCHASE or NON_RENEWING_PURCHASE the store reports for them). Only purchases from 20 Nov 2026 on: earlier
-- payers were written to by hand. A trial start counts; the email says "went Pro", which is true of both.
-- Additive only.

alter table public.lifter_emails drop constraint if exists lifter_emails_kind_check;
alter table public.lifter_emails add constraint lifter_emails_kind_check check (kind in ('welcome', 'first_lift', 'subscribed'));

create or replace function public.lifter_emails_due(p_limit integer default 20)
returns table (user_id uuid, email text, display_name text, kind text, founding boolean)
language sql
security definer
set search_path = ''
as $$
  with people as (
    select u.id, coalesce(c.email, u.email::text) as email, p.display_name, coalesce(p.founding, false) as founding,
           (select min(l.created_at) from public.lifts l where l.user_id = u.id and l.status = 'done') as first_lift,
           coalesce(c.created_at, (select min(i.created_at) from auth.identities i where i.user_id = u.id)) as signed_in,
           (select min(r.received_at) from public.revenuecat_events r
             where r.user_id = u.id and r.type in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE')
               and r.received_at > timestamptz '2026-11-20 03:30:00+00') as bought
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.lifter_contacts c on c.user_id = u.id
    where coalesce(c.email, u.email::text) is not null
      and coalesce(c.email, u.email::text) not like '%@catchline.test'
      and coalesce(p.display_name, '') <> 'John Apple'
  )
  select id, email, display_name, 'subscribed', founding
  from people
  where bought < now() - interval '5 minutes'
    and not exists (select 1 from public.lifter_emails e where e.user_id = people.id and e.kind = 'subscribed')
  union all
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
