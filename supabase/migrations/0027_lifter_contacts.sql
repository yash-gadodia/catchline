-- 0027_lifter_contacts.sql
-- A lifter may leave an email address so the owner can reply to them (the feedback form, and a link after the first
-- lift). Nine in ten accounts are anonymous and have no address otherwise. The address is used for the owner's two
-- emails (0026) and his replies, nothing else.
-- Additive only. Service role reads; the lifter can only set their own, through set_contact_email.

create table if not exists public.lifter_contacts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.lifter_contacts enable row level security;
revoke all on public.lifter_contacts from public, anon, authenticated;
grant all on public.lifter_contacts to service_role;

-- The signed-in caller (an anonymous account counts) sets or replaces their own address. An empty value removes it.
create or replace function public.set_contact_email(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if v_email = '' then
    delete from public.lifter_contacts where user_id = v_user;
    return;
  end if;
  insert into public.lifter_contacts (user_id, email) values (v_user, v_email)
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
end;
$$;

revoke all on function public.set_contact_email(text) from public, anon;
grant execute on function public.set_contact_email(text) to authenticated;

-- 0026's picker, now also reading the address a lifter left: it wins over the account's own (a relay address), and
-- it makes an anonymous account reachable. "Signed in" for the welcome is then the moment the address was left.
create or replace function public.lifter_emails_due(p_limit integer default 20)
returns table (user_id uuid, email text, display_name text, kind text, founding boolean)
language sql
security definer
set search_path = ''
as $$
  with people as (
    select u.id, coalesce(c.email, u.email::text) as email, p.display_name, coalesce(p.founding, false) as founding,
           (select min(l.created_at) from public.lifts l where l.user_id = u.id and l.status = 'done') as first_lift,
           coalesce(c.created_at, (select min(i.created_at) from auth.identities i where i.user_id = u.id)) as signed_in
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.lifter_contacts c on c.user_id = u.id
    where coalesce(c.email, u.email::text) is not null
      and coalesce(c.email, u.email::text) not like '%@catchline.test'
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
