-- 0026_streak_grace_fixes.sql
-- Four fixes from the adversarial review of the streak-grace + flywheel SQL:
--
--   1. _increment_streak (0022) wiped lapsed_streak/lapsed_on on the
--      fresh-start branch too, killing paid repair and the
--      play-today-then-catch-up ordering. The lapse record is now cleared
--      ONLY when the chain actually continues (last = today - 1); a fresh
--      start preserves it.
--   1b. repair_streak (0024) only credited +1 for a played-today. After fix 1
--      a returning couple may have rebuilt a fresh chain of N days: the
--      repaired streak is now lapsed + current streak when the current
--      streak is a live fresh chain (last_played_on = today or yesterday),
--      else just the lapsed streak. Window/ledger/guards unchanged.
--   2. get_today_state (0022) reported catch_up_available = false when
--      yesterday was never minted but the couple has history and already
--      played today (or a freeze bridged yesterday). Any couple with play
--      history and no revealed yesterday now sees the door; brand-new
--      couples (no history) still do not.
--   3. _next_drop_for (0024) consumed pack_override even when no matching
--      drop existed, and ensure_yesterday_drop spent the override on a
--      catch-up mint (the sender was told "tomorrow's drop"). The override
--      is now cleared only when a matching drop was found, and only the
--      today path uses it (new p_use_override arg; yesterday passes false).
--      send_pack additionally rejects themes with nothing unplayed +
--      spice-eligible for this couple, so a send can't silently fizzle.
--
-- Grants/revokes re-issued exactly as 0022/0024 set them.

-- ----------------------------------------------------------------------------
-- FIX 1: _increment_streak — clear the lapse record only when the chain
-- continues; a fresh start preserves it (repair/catch-up still possible).
-- Everything else (idempotency, milestone/played logging, weekly freeze
-- earn-back) unchanged from 0022.
-- ----------------------------------------------------------------------------
create or replace function public._increment_streak(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_last date;
  v_streak int;
begin
  select (now() at time zone coalesce(tz, 'Asia/Singapore'))::date, last_played_on, coalesce(streak, 0)
    into v_today, v_last, v_streak
  from public.couples where id = p_couple;

  if v_today is null then
    raise exception 'couple not found';
  end if;

  -- Already counted today — idempotent.
  if v_last = v_today then
    return;
  end if;

  if v_last = v_today - 1 then
    v_streak := v_streak + 1;
    update public.couples
    set streak = v_streak,
        longest_streak = greatest(coalesce(longest_streak, 0), v_streak),
        last_played_on = v_today,
        lapsed_streak = null,
        lapsed_on = null
    where id = p_couple;
  else
    v_streak := 1;
    update public.couples
    set streak = v_streak,
        longest_streak = greatest(coalesce(longest_streak, 0), v_streak),
        last_played_on = v_today
    where id = p_couple;
  end if;

  perform public._earn_freeze_if_weekly(p_couple, v_streak);
  perform public.log_activity(p_couple, 'played', '{}');

  if v_streak in (3, 7, 14, 30, 50, 100) then
    perform public.log_activity(p_couple, 'milestone', json_build_object('days', v_streak)::jsonb);
  end if;
end;
$$;

revoke all on function public._increment_streak(uuid) from public;

-- ----------------------------------------------------------------------------
-- FIX 1b: repair_streak — the repaired streak folds in a rebuilt fresh chain
-- (last_played_on = today or yesterday), not just a played-today +1.
-- ----------------------------------------------------------------------------
create or replace function public.repair_streak(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_last date;
  v_streak int;
  v_lapsed int;
  v_lapsed_on date;
  v_last_repair date;
  v_new int;
begin
  select (now() at time zone coalesce(tz, 'Asia/Singapore'))::date,
         last_played_on, coalesce(streak, 0), lapsed_streak, lapsed_on, last_repair_on
    into v_today, v_last, v_streak, v_lapsed, v_lapsed_on, v_last_repair
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_today is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if coalesce(v_lapsed, 0) <= 0 or v_lapsed_on is null or v_lapsed_on < v_today - 7 then
    raise exception 'nothing repairable — no streak lapsed in the last 7 days';
  end if;

  if v_last_repair is not null and v_last_repair > v_today - 30 then
    raise exception 'streak repair is available once every 30 days';
  end if;

  -- Restore the chain as if the gap never happened; a live fresh chain the
  -- couple rebuilt since the lapse (last played today or yesterday) folds in.
  if v_last = v_today or v_last = v_today - 1 then
    v_new := v_lapsed + v_streak;
  else
    v_new := v_lapsed;
  end if;

  update public.couples
  set streak = v_new,
      longest_streak = greatest(coalesce(longest_streak, 0), v_new),
      last_played_on = greatest(coalesce(v_last, v_today - 1), v_today - 1),
      lapsed_streak = null,
      lapsed_on = null,
      last_repair_on = v_today
  where id = p_couple;

  perform public.log_activity(p_couple, 'milestone', json_build_object('days', v_new, 'repaired', true)::jsonb);
end;
$$;

revoke all on function public.repair_streak(uuid) from public;
grant execute on function public.repair_streak(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- FIX 2: get_today_state — catch_up_available is true for any not-revealed
-- yesterday row, or for a missing yesterday row when the couple has ANY play
-- history (freeze-bridged and played-today couples included). Brand-new
-- couples (last_played_on null, no rows) still read false.
-- ----------------------------------------------------------------------------
create or replace function public.get_today_state(p_couple uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_status text;
  v_today date;
  v_last date;
  v_cd_id uuid;
  v_state text;
  v_wave int;
  v_drop_id uuid;
  v_prompt_count int;
  v_me_done boolean := false;
  v_partner_done boolean := false;
  v_partner uuid;
  v_y_state text;
  v_catch_up boolean := false;
begin
  select c.member_a, c.member_b, c.status,
         (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date,
         c.last_played_on
    into v_member_a, v_member_b, v_status, v_today, v_last
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select cd.state into v_y_state
  from public.couple_drops cd
  where cd.couple_id = p_couple and cd.date = v_today - 1;

  -- Catch-up: yesterday exists unfinished, or was never opened by a couple
  -- that has a history. Held entirely while pending (no reveal to chase).
  v_catch_up := v_status <> 'pending' and (
    (v_y_state is not null and v_y_state <> 'revealed')
    or (v_y_state is null and v_last is not null)
  );

  select cd.id, cd.state, cd.wave_pct, cd.drop_id
    into v_cd_id, v_state, v_wave, v_drop_id
  from public.couple_drops cd
  where cd.couple_id = p_couple and cd.date = v_today;

  if v_cd_id is null then
    return json_build_object(
      'exists', false,
      'date', v_today,
      'catch_up_available', v_catch_up,
      'yesterday_state', v_y_state
    );
  end if;

  select count(*)::int into v_prompt_count
  from public.drop_prompts where drop_id = v_drop_id;

  v_partner := case when auth.uid() = v_member_a then v_member_b else v_member_a end;

  select v_prompt_count > 0 and count(*) = v_prompt_count into v_me_done
  from public.answers where couple_drop_id = v_cd_id and author = auth.uid();

  if v_partner is not null then
    select v_prompt_count > 0 and count(*) = v_prompt_count into v_partner_done
    from public.answers where couple_drop_id = v_cd_id and author = v_partner;
  end if;

  return json_build_object(
    'exists', true,
    'date', v_today,
    'couple_drop_id', v_cd_id,
    'state', v_state,
    'wave_pct', v_wave,
    'i_answered', v_me_done,
    'partner_answered', v_partner_done,
    'held', (v_status = 'pending'),
    'catch_up_available', v_catch_up,
    'yesterday_state', v_y_state
  );
end;
$$;

grant execute on function public.get_today_state(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- FIX 3a: _next_drop_for — the override is consumed only when a matching drop
-- was actually found, and only when the caller wants it (p_use_override).
-- Signature changes, so the old one-arg version is dropped first.
-- ----------------------------------------------------------------------------
drop function if exists public._next_drop_for(uuid);

create or replace function public._next_drop_for(p_couple uuid, p_use_override boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_override text;
  v_allowed int;
  v_drop_id uuid;
begin
  select c.member_a, c.member_b, c.pack_override
    into v_member_a, v_member_b, v_override
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  v_allowed := coalesce((
    select min(case lower(p.spice_level) when 'sweet' then 0 when 'spicy' then 2 else 1 end)
    from public.profiles p
    where p.id in (v_member_a, v_member_b)
  ), 1);

  -- 5.3: a sent pack steers the next drop, once — consumed only on a hit.
  if p_use_override and v_override is not null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.theme = v_override
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

    if v_drop_id is not null then
      update public.couples set pack_override = null where id = p_couple;
      return v_drop_id;
    end if;
  end if;

  -- 1.3: unplayed drops, themes matching either member's intents first.
  with intent_themes as (
    select distinct m.theme
    from public.profiles p
    cross join lateral unnest(coalesce(p.intents, '{}')) as i(intent)
    join (values
      ('know', 'deeper'), ('know', 'memory'),
      ('talk', 'spark'),  ('talk', 'daily'),
      ('rough', 'deeper'),
      ('far', 'memory'),  ('far', 'daily'),
      ('fun', 'fun'),     ('fun', 'spark'), ('fun', 'spicy')
    ) as m(intent, theme) on m.intent = i.intent
    where p.id in (v_member_a, v_member_b)
  )
  select d.id into v_drop_id
  from public.drops d
  where d.position is not null
    and d.spice <= v_allowed
    and not exists (
      select 1 from public.couple_drops cd
      where cd.couple_id = p_couple and cd.drop_id = d.id
    )
  order by (d.theme in (select theme from intent_themes)) desc,
           d.position
  limit 1;

  -- Catalog exhausted: cycle from the least-recently-used eligible drop.
  if v_drop_id is null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.spice <= v_allowed
    order by (select max(cd.date)
              from public.couple_drops cd
              where cd.couple_id = p_couple and cd.drop_id = d.id) asc,
             d.position asc
    limit 1;
  end if;

  if v_drop_id is null then
    raise exception 'no eligible drop in catalog';
  end if;

  return v_drop_id;
end;
$$;

revoke all on function public._next_drop_for(uuid, boolean) from public;

-- ----------------------------------------------------------------------------
-- FIX 3b: ensure_today_drop keeps the override (a sent pack steers TODAY'S
-- next drop); ensure_yesterday_drop is a catch-up mint and must not spend it.
-- Guards + idempotency unchanged from 0024.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_today_drop(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_drop_id uuid;
  v_drop_id uuid;
  v_today date;
begin
  select (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date into v_today
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_today is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select id into v_couple_drop_id
  from public.couple_drops
  where couple_id = p_couple
    and date = v_today;

  if v_couple_drop_id is null then
    v_drop_id := public._next_drop_for(p_couple, true);
    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, v_today, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;

create or replace function public.ensure_yesterday_drop(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_drop_id uuid;
  v_state text;
  v_drop_id uuid;
  v_yesterday date;
  v_status text;
begin
  select (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date - 1, c.status
    into v_yesterday, v_status
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_yesterday is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_status = 'pending' then
    raise exception 'catch-up opens once you are paired';
  end if;

  select cd.id, cd.state into v_couple_drop_id, v_state
  from public.couple_drops cd
  where cd.couple_id = p_couple
    and cd.date = v_yesterday;

  if v_state = 'revealed' then
    raise exception 'yesterday is already revealed';
  end if;

  if v_couple_drop_id is null then
    v_drop_id := public._next_drop_for(p_couple, false);
    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, v_yesterday, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;

grant execute on function public.ensure_today_drop(uuid) to authenticated;
grant execute on function public.ensure_yesterday_drop(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- FIX 3c: send_pack — a send must be able to land: the theme needs at least
-- one unplayed, spice-eligible drop for THIS couple.
-- ----------------------------------------------------------------------------
create or replace function public.send_pack(p_couple uuid, p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_allowed int;
begin
  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_member_a is null and v_member_b is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if not exists (
    select 1 from public.drops d
    where d.position is not null and d.theme = p_theme
  ) then
    raise exception 'unknown pack theme %', p_theme;
  end if;

  v_allowed := coalesce((
    select min(case lower(p.spice_level) when 'sweet' then 0 when 'spicy' then 2 else 1 end)
    from public.profiles p
    where p.id in (v_member_a, v_member_b)
  ), 1);

  if not exists (
    select 1 from public.drops d
    where d.position is not null
      and d.theme = p_theme
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
  ) then
    raise exception 'that pack has nothing new for you two right now';
  end if;

  update public.couples set pack_override = p_theme where id = p_couple;
  perform public.log_activity(p_couple, 'pack', json_build_object('theme', p_theme)::jsonb);
end;
$$;

revoke all on function public.send_pack(uuid, text) from public;
grant execute on function public.send_pack(uuid, text) to authenticated;
