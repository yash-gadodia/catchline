-- 0025_pairing_history.sql
-- IMPROVEMENT_PLAN.md 2.2 + 0.4 server side:
--
--   2.2  Invite hygiene: invite codes expire after 14 days (a stale code in a
--        chat thread shouldn't open a couple forever); regenerate_invite mints
--        a fresh one for the pending inviter.
--   0.4  couple_history now returns couple_drop_id (so dropDetail can render
--        the REAL drop, not the static demo archive) and prefers the STORED
--        wave_pct — a caught-up round's 80% score must match everywhere
--        (recomputing raw hits would quietly contradict the reveal).

alter table public.couples
  add column if not exists invite_issued_at timestamptz default now();

-- ----------------------------------------------------------------------------
-- join_couple: 0001 behavior + the 14-day expiry gate.
-- ----------------------------------------------------------------------------
create or replace function public.join_couple(p_code text)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple public.couples;
begin
  select * into target_couple
  from public.couples
  where invite_code = p_code;

  if target_couple is null then
    raise exception 'Invite code not found';
  end if;

  if target_couple.status != 'pending' then
    raise exception 'Couple is not pending (status: %)', target_couple.status;
  end if;

  if coalesce(target_couple.invite_issued_at, now()) < now() - interval '14 days' then
    raise exception 'This invite code has expired — ask them to send a fresh one';
  end if;

  if target_couple.member_a = auth.uid() then
    raise exception 'Cannot join a couple as member_a';
  end if;

  if exists (
    select 1
    from public.couples
    where (member_a = auth.uid() or member_b = auth.uid())
      and status in ('pending', 'active')
  ) then
    raise exception 'User is already a member of a pending or active couple';
  end if;

  update public.couples
  set member_b = auth.uid(),
      status = 'active',
      together_since = current_date
  where id = target_couple.id
  returning * into target_couple;

  return target_couple;
end;
$$;

-- ----------------------------------------------------------------------------
-- regenerate_invite: a pending inviter refreshes their code (new 14-day clock).
-- ----------------------------------------------------------------------------
create or replace function public.regenerate_invite(p_couple uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not exists (
    select 1 from public.couples c
    where c.id = p_couple
      and c.status = 'pending'
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a pending member of this couple';
  end if;

  v_code := public.gen_invite_code();

  update public.couples
  set invite_code = v_code,
      invite_issued_at = now()
  where id = p_couple;

  return v_code;
end;
$$;

revoke all on function public.regenerate_invite(uuid) from public;
grant execute on function public.regenerate_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- couple_history: + couple_drop_id + caught_up, wavelength prefers the stored
-- server score (0014/0021). Return type changes require a drop first.
-- ----------------------------------------------------------------------------
drop function if exists public.couple_history(uuid);

create function public.couple_history(p_couple uuid)
returns table (
  couple_drop_id uuid,
  date date,
  code text,
  title text,
  wavelength int,
  twins_count int,
  caught_up boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
begin
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c
  where c.id = p_couple;

  return query
  select
    cd.id as couple_drop_id,
    cd.date,
    d.code,
    d.title,
    coalesce(
      cd.wave_pct,
      case
        when prompt_count = 0 then 0
        else round(((yours_hits + theirs_hits) / (prompt_count::numeric * 2)) * 100)::int
      end
    ) as wavelength,
    coalesce(twins, 0) as twins_count,
    cd.caught_up
  from public.couple_drops cd
  join public.drops d on cd.drop_id = d.id
  left join lateral (
    select
      count(*)::int as prompt_count,
      sum(case when a_yours.hunch = a_theirs.pick then 1 else 0 end)::int as yours_hits,
      sum(case when a_theirs.hunch = a_yours.pick then 1 else 0 end)::int as theirs_hits,
      sum(case when a_yours.pick = a_theirs.pick then 1 else 0 end)::int as twins
    from public.drop_prompts dp
    left join public.answers a_yours
      on a_yours.couple_drop_id = cd.id and a_yours.prompt_id = dp.id and a_yours.author = v_member_a
    left join public.answers a_theirs
      on a_theirs.couple_drop_id = cd.id and a_theirs.prompt_id = dp.id and a_theirs.author = v_member_b
    where dp.drop_id = cd.drop_id
  ) hits on true
  where cd.couple_id = p_couple
    and cd.state = 'revealed'
  order by cd.date desc;
end;
$$;

revoke all on function public.couple_history(uuid) from public;
grant execute on function public.couple_history(uuid) to authenticated;
