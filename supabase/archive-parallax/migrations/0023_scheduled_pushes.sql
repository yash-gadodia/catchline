-- 0023_scheduled_pushes.sql
-- IMPROVEMENT_PLAN.md 3.2 + 3.8 — the sanctioned scheduled outbound set
-- (law #9: partner-triggered pushes plus exactly these, warm, zero guilt):
--   * streak-saver push (~10pm couple-local): streak > 0 and exactly ONE
--     member played today — the other gets one honest heads-up.
--   * drift reminder push: NEITHER member played and the couple-local time is
--     past their ritual hour (earliest profiles.notify_time, 20:00 default).
--     Scoped to couples active in the last 3 days — beyond that the couple is
--     email-reengage's lane, not a daily push-forever.
--   * re-engagement email: couple silent 3+ days, at most one email per
--     14 days per couple (one per silence spell).
--
-- Shape: SECURITY DEFINER candidate functions (service_role-only) that CLAIM
-- a push_ledger row as they select — unique(couple_id, kind, sent_on) +
-- insert ... on conflict do nothing returning = at-most-once per couple per
-- couple-local day per kind, so a rerun or two overlapping hourly invocations
-- can never double-send.
--
-- Invocation choice (why there is NO pg_cron job in this file): the repo's
-- pg_cron pattern (0014/0021) schedules plain SQL. Invoking an edge function
-- from SQL needs pg_net + the service-role bearer IN the database — and this
-- repo is public, so the key can only live in Vault/dashboard, never in a
-- migration. Scheduling the candidate functions directly from pg_cron would
-- be worse: they claim the day's ledger row with no sender attached, burning
-- the send. So the cron lives OUTSIDE the DB: invoke the scheduled-pushes and
-- email-reengage edge functions HOURLY with the service-role bearer
-- (Supabase Dashboard cron via pg_net + Vault, or any external scheduler) —
-- the generate-drops ops-gate pattern. The ledger makes the cadence forgiving.
--
-- Every function takes p_now (default now()) so pgTAP can pin time —
-- service_role-only, not a client-reachable dial.
--
-- Grants per the 0006 lesson: explicit; everything here is a service-only
-- surface, revoked from public/anon/authenticated.

-- ----------------------------------------------------------------------------
-- push_ledger: the outbound-contact dedupe ledger (pushes AND email).
-- ----------------------------------------------------------------------------
create table if not exists public.push_ledger (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null check (kind in ('streak_saver', 'drift_reminder', 'email_reengage')),
  sent_on date not null,
  created_at timestamptz default now(),
  unique (couple_id, kind, sent_on)
);

alter table public.push_ledger enable row level security;

revoke all on table public.push_ledger from public, anon, authenticated;
grant select, insert on table public.push_ledger to service_role;

-- ----------------------------------------------------------------------------
-- _streak_saver_candidates: couples with a live streak where exactly one
-- member finished today's drop (state 'one_done'), couple-local hour >= 22.
-- Claims the ledger row; only newly-claimed, pushable rows are returned.
-- Targets without a push_token are NOT claimed (nothing would be sent).
-- ----------------------------------------------------------------------------
create or replace function public._streak_saver_candidates(p_now timestamptz default now())
returns table (
  couple_id uuid,
  target_member uuid,
  push_token text,
  partner_name text,
  streak int
)
language sql
security definer
set search_path = public
as $$
  with cand as (
    select c.id as couple_id,
           c.streak,
           c.member_a,
           c.member_b,
           cd.id as cd_id,
           cd.drop_id,
           (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::date as local_day
    from public.couples c
    join public.couple_drops cd
      on cd.couple_id = c.id
     and cd.date = (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::date
    where c.status = 'active'
      and c.member_a is not null
      and c.member_b is not null
      and coalesce(c.streak, 0) > 0
      and cd.state = 'one_done'
      and extract(hour from (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))) >= 22
  ),
  resolved as (
    select cand.couple_id,
           case when done_a.done then cand.member_b else cand.member_a end as tgt,
           case when done_a.done then cand.member_a else cand.member_b end as player,
           cand.streak,
           cand.local_day
    from cand
    cross join lateral (
      select (select count(*) from public.answers a
               where a.couple_drop_id = cand.cd_id and a.author = cand.member_a)
           = (select count(*) from public.drop_prompts dp
               where dp.drop_id = cand.drop_id) as done
    ) done_a
  ),
  reachable as (
    select r.*, pt.push_token as tgt_token
    from resolved r
    join public.profiles pt on pt.id = r.tgt and pt.push_token is not null
  ),
  claimed as (
    insert into public.push_ledger (couple_id, kind, sent_on)
    select rc.couple_id, 'streak_saver', rc.local_day from reachable rc
    on conflict do nothing
    returning push_ledger.couple_id
  )
  select r.couple_id,
         r.tgt,
         r.tgt_token,
         coalesce(pp.display_name, 'your person'),
         r.streak
  from reachable r
  join claimed cl on cl.couple_id = r.couple_id
  left join public.profiles pp on pp.id = r.player;
$$;

revoke all on function public._streak_saver_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public._streak_saver_candidates(timestamptz) to service_role;

-- ----------------------------------------------------------------------------
-- _drift_reminder_candidates: neither member played today (no couple_drop or
-- state still 'open'), couple-local time past the ritual hour, couple active
-- within the last 3 days. Returns one row per pushable member; one ledger
-- claim per couple. Only claimed if at least one member is pushable.
-- ----------------------------------------------------------------------------
create or replace function public._drift_reminder_candidates(p_now timestamptz default now())
returns table (
  couple_id uuid,
  target_member uuid,
  push_token text,
  partner_name text,
  local_day date
)
language sql
security definer
set search_path = public
as $$
  with cand as (
    select c.id as couple_id,
           c.member_a,
           c.member_b,
           (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::date as local_day
    from public.couples c
    join public.profiles pa on pa.id = c.member_a
    join public.profiles pb on pb.id = c.member_b
    left join public.couple_drops cd
      on cd.couple_id = c.id
     and cd.date = (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::date
    where c.status = 'active'
      and c.member_a is not null
      and c.member_b is not null
      and (cd.id is null or cd.state = 'open')
      and c.last_played_on is not null
      and c.last_played_on >= (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::date - 3
      and (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::time
            >= coalesce(least(pa.notify_time, pb.notify_time), time '20:00')
  ),
  targets as (
    select cand.couple_id, m.tgt, m.player, cand.local_day, pt.push_token as tgt_token
    from cand
    cross join lateral (
      values (cand.member_a, cand.member_b), (cand.member_b, cand.member_a)
    ) as m(tgt, player)
    join public.profiles pt on pt.id = m.tgt and pt.push_token is not null
  ),
  claimed as (
    insert into public.push_ledger (couple_id, kind, sent_on)
    select distinct t.couple_id, 'drift_reminder', t.local_day from targets t
    on conflict do nothing
    returning push_ledger.couple_id
  )
  select t.couple_id,
         t.tgt,
         t.tgt_token,
         coalesce(pp.display_name, 'your person'),
         t.local_day
  from targets t
  join claimed cl on cl.couple_id = t.couple_id
  left join public.profiles pp on pp.id = t.player;
$$;

revoke all on function public._drift_reminder_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public._drift_reminder_candidates(timestamptz) to service_role;

-- ----------------------------------------------------------------------------
-- _email_reengage_candidates: active couples with no answer activity for 3+
-- days (never-played couples count from couples.created_at) and no
-- email_reengage ledger entry in the last 14 days. Returns one row per member
-- with an email; one ledger claim per couple. streak_at_death is the real
-- streak the silence killed (couples.lapsed_streak once the nightly reset has
-- run, 0021). last_question is the QUESTION the partner most recently
-- answered — never their answer (the reveal gate stays intact).
-- ----------------------------------------------------------------------------
create or replace function public._email_reengage_candidates(p_now timestamptz default now())
returns table (
  couple_id uuid,
  target_member uuid,
  email text,
  display_name text,
  partner_name text,
  streak_at_death int,
  last_question text,
  last_answered_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with cand as (
    select c.id as couple_id,
           c.member_a,
           c.member_b,
           greatest(coalesce(c.streak, 0), coalesce(c.lapsed_streak, 0)) as streak_at_death,
           (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::date as local_day
    from public.couples c
    where c.status = 'active'
      and c.member_a is not null
      and c.member_b is not null
      and coalesce((
        select max(a.created_at)
        from public.answers a
        join public.couple_drops cd on cd.id = a.couple_drop_id
        where cd.couple_id = c.id
      ), c.created_at) < p_now - interval '3 days'
      and not exists (
        select 1 from public.push_ledger pl
        where pl.couple_id = c.id
          and pl.kind = 'email_reengage'
          and pl.sent_on > (p_now at time zone coalesce(c.tz, 'Asia/Singapore'))::date - 14
      )
  ),
  targets as (
    select cand.couple_id, m.tgt, m.player, cand.streak_at_death, cand.local_day,
           u.email::text as tgt_email, pt.display_name as tgt_name
    from cand
    cross join lateral (
      values (cand.member_a, cand.member_b), (cand.member_b, cand.member_a)
    ) as m(tgt, player)
    join auth.users u on u.id = m.tgt and u.email is not null
    left join public.profiles pt on pt.id = m.tgt
  ),
  claimed as (
    insert into public.push_ledger (couple_id, kind, sent_on)
    select distinct t.couple_id, 'email_reengage', t.local_day from targets t
    on conflict do nothing
    returning push_ledger.couple_id
  )
  select t.couple_id,
         t.tgt,
         t.tgt_email,
         t.tgt_name,
         coalesce(pp.display_name, 'your person'),
         t.streak_at_death,
         la.question,
         la.created_at
  from targets t
  join claimed cl on cl.couple_id = t.couple_id
  left join public.profiles pp on pp.id = t.player
  left join lateral (
    select dp.question, a.created_at
    from public.answers a
    join public.couple_drops cd on cd.id = a.couple_drop_id
    join public.drop_prompts dp on dp.id = a.prompt_id
    where cd.couple_id = t.couple_id and a.author = t.player
    order by a.created_at desc
    limit 1
  ) la on true;
$$;

revoke all on function public._email_reengage_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public._email_reengage_candidates(timestamptz) to service_role;
