-- ============================================================================
-- 0033: one open money date per couple — close the double-start race
--
-- start_money_date (0029) resumes a fresh (<24h) open session, but two rapid
-- concurrent starts (both partners tapping at once, a double-tap) could each
-- pass the "no open session" check and insert, leaving the couple with two
-- open sessions. A partial unique index makes the invariant a database fact,
-- and start_money_date handles the conflict by returning the session that won.
-- Idempotent; no data loss (a raced duplicate would have been abandoned by the
-- 24h sweep anyway).
-- ============================================================================

-- Existing duplicates (possible pre-index): keep each couple's newest open
-- session, abandon the rest, so the unique index can build.
with ranked as (
  select id,
         row_number() over (
           partition by couple_id
           order by created_at desc, id desc
         ) as rn
  from public.money_date_sessions
  where state = 'open'
)
update public.money_date_sessions s
set state = 'abandoned'
from ranked r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists money_date_sessions_one_open
  on public.money_date_sessions (couple_id)
  where state = 'open';

-- Same contract as 0029 (resume <24h, abandon stale), plus: a concurrent
-- insert that hits the unique index resolves to the existing open session
-- instead of erroring — both racers get the same session id.
create or replace function public.start_money_date(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  update public.money_date_sessions
  set state = 'abandoned'
  where couple_id = p_couple
    and state = 'open'
    and created_at < now() - interval '24 hours';

  select s.id into v_session_id
  from public.money_date_sessions s
  where s.couple_id = p_couple
    and s.state = 'open'
  order by s.created_at desc
  limit 1;

  if v_session_id is not null then
    return v_session_id;
  end if;

  insert into public.money_date_sessions (couple_id, started_by)
  values (p_couple, auth.uid())
  on conflict (couple_id) where state = 'open' do nothing
  returning id into v_session_id;

  if v_session_id is null then
    -- Lost the race: the other start's session committed first — resume it.
    select s.id into v_session_id
    from public.money_date_sessions s
    where s.couple_id = p_couple
      and s.state = 'open'
    order by s.created_at desc
    limit 1;
  end if;

  return v_session_id;
end;
$$;

grant execute on function public.start_money_date(uuid) to authenticated;
