-- 0029_lifter_emails_nudges.sql
-- Two more emails from the owner, and then silence:
--   nudge:   no tracked lift for 7 days (and no email from us in the last 7), once per lifter.
--   goodbye: 7 days after the nudge with still no lift. It thanks them and says they will not hear again, and that is
--            kept: after a goodbye only the purchase thank-you can ever be sent. A paying lifter never gets a goodbye.
-- "Activity" is a tracked lift reaching the server (or signing in / leaving an address): app opens are not known here.
-- Additive only.

alter table public.lifter_emails drop constraint if exists lifter_emails_kind_check;
alter table public.lifter_emails add constraint lifter_emails_kind_check
  check (kind in ('welcome', 'first_lift', 'subscribed', 'nudge', 'goodbye'));

create or replace function public.lifter_emails_due(p_limit integer default 20)
returns table (user_id uuid, email text, display_name text, kind text, founding boolean)
language sql
security definer
set search_path = ''
as $$
  with base as (
    select u.id, coalesce(c.email, u.email::text) as email, p.display_name, coalesce(p.founding, false) as founding,
           coalesce(p.plan, 'free') as plan,
           (select min(l.created_at) from public.lifts l where l.user_id = u.id and l.status = 'done') as first_lift,
           (select max(l.created_at) from public.lifts l where l.user_id = u.id) as last_lift,
           coalesce(c.created_at, (select min(i.created_at) from auth.identities i where i.user_id = u.id), u.created_at) as signed_in,
           (select min(r.received_at) from public.revenuecat_events r
             where r.user_id = u.id and r.type in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE')
               and r.received_at > timestamptz '2026-11-20 03:30:00+00') as bought,
           (select max(e.sent_at) from public.lifter_emails e where e.user_id = u.id) as last_mail,
           (select max(e.sent_at) from public.lifter_emails e where e.user_id = u.id and e.kind = 'nudge') as nudged,
           exists (select 1 from public.lifter_emails e where e.user_id = u.id and e.kind = 'goodbye') as gone
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.lifter_contacts c on c.user_id = u.id
    where coalesce(c.email, u.email::text) is not null
      and coalesce(c.email, u.email::text) not like '%@catchline.test'
      and coalesce(p.display_name, '') <> 'John Apple'
  ),
  people as (select *, greatest(coalesce(last_lift, signed_in), signed_in) as active_at from base)
  select id, email, display_name, 'subscribed', founding
  from people
  where bought < now() - interval '5 minutes'
    and not exists (select 1 from public.lifter_emails e where e.user_id = people.id and e.kind = 'subscribed')
  union all
  select id, email, display_name, 'first_lift', founding
  from people
  where not gone and first_lift < now() - interval '1 hour'
    and not exists (select 1 from public.lifter_emails e where e.user_id = people.id and e.kind = 'first_lift')
  union all
  select id, email, display_name, 'welcome', founding
  from people
  where not gone and first_lift is null
    and signed_in between now() - interval '2 days' and now() - interval '10 minutes'
    and last_mail is null
  union all
  select id, email, display_name, 'nudge', founding
  from people
  where not gone and nudged is null
    and active_at < now() - interval '7 days'
    and (last_mail is null or last_mail < now() - interval '7 days')
  union all
  select id, email, display_name, 'goodbye', founding
  from people
  where not gone and plan = 'free'
    and nudged < now() - interval '7 days'
    and active_at < nudged
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.lifter_emails_due(integer) from public, anon, authenticated;
grant execute on function public.lifter_emails_due(integer) to service_role;
