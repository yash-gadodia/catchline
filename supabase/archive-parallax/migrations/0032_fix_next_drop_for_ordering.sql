-- 0032_fix_next_drop_for_ordering.sql
-- Two fixes surfaced by the pre-prod adversarial review (03-07-2026):
--
--   1. MIGRATION-ORDER CLOBBER: 0029 and 0030 were authored concurrently
--      against a local DB where 0030 was already applied, so 0029 "copied
--      forward" 0030's _next_drop_for and added the reinforcement cadence.
--      On a virgin database the numeric order is 0029 -> 0030, so 0030's
--      version (no drops.kind cadence, no classic fence, no any-unplayed
--      fallback) OVERWRITES 0029's. This migration re-asserts the correct
--      FINAL version — byte-identical to 0029's — after every dependency
--      (drops.kind from 0029, drops.couple_id from 0030) exists.
--      Priority: pack_override > own-couple scoped > reinforcement cadence
--      (played % 5 = 4) > intent-weighted unplayed classic > any unplayed
--      eligible drop > LRU cycle. Every branch keeps the couple fence
--      (couple_id is null or couple_id = p_couple) and the spice fence.
--      Behavior proven by supabase/tests/money_dates_reinforcement_test.sql +
--      couple_scoped_drops_test.sql running against a virgin `db reset`.
--
--   2. record_journey_checkin (0028) accepted an UNBOUNDED note while the
--      money-date RPCs cap theirs at 2000 chars — re-asserted here with the
--      same cap (journey_note_too_long). Existing longer rows (none expected)
--      are untouched; only new writes are guarded.
--
-- Idempotent: create-or-replace only. No schema changes.

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
  v_played int;
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
      and (d.couple_id is null or d.couple_id = p_couple)
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

  -- v2: the couple's OWN scoped unplayed drops (its personal moat) win over
  -- any global pick. Spice-gated, catalog order.
  select d.id into v_drop_id
  from public.drops d
  where d.position is not null
    and d.couple_id = p_couple
    and d.spice <= v_allowed
    and not exists (
      select 1 from public.couple_drops cd
      where cd.couple_id = p_couple and cd.drop_id = d.id
    )
  order by d.position
  limit 1;

  if v_drop_id is not null then
    return v_drop_id;
  end if;

  -- 0029: reinforcement cadence — every 5th round (the couple's 5th, 10th, …
  -- drop, i.e. played-count % 5 = 4) serves one unplayed reinforcement drop
  -- (kind <> 'classic'), fenced exactly like every other branch. Nothing
  -- unplayed of those kinds -> fall through unchanged.
  select count(*) into v_played
  from public.couple_drops cd
  where cd.couple_id = p_couple;

  if v_played % 5 = 4 then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.kind <> 'classic'
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

    if v_drop_id is not null then
      return v_drop_id;
    end if;
  end if;

  -- 1.3: unplayed CLASSIC drops, themes matching either member's intents
  -- first. Reinforcement kinds are held back for the cadence branch so they
  -- sprinkle (~1-in-5) instead of clumping in catalog order.
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
    and d.kind = 'classic'
    and (d.couple_id is null or d.couple_id = p_couple)
    and d.spice <= v_allowed
    and not exists (
      select 1 from public.couple_drops cd
      where cd.couple_id = p_couple and cd.drop_id = d.id
    )
  order by (d.theme in (select theme from intent_themes)) desc,
           d.position
  limit 1;

  -- 0029: classics exhausted — any unplayed eligible drop (any kind) still
  -- beats recycling. Repeat-prompt rate stays 0 while anything is unplayed.
  if v_drop_id is null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;
  end if;

  -- Catalog exhausted: cycle from the least-recently-used eligible drop.
  if v_drop_id is null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
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

-- 2. record_journey_checkin: same behavior as 0028 + the note-length guard
--    (the money-date RPCs' 2000-char cap, applied consistently).
create or replace function public.record_journey_checkin(p_couple_journey uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cj public.couple_journeys%rowtype;
begin
  select cj.* into v_cj
  from public.couple_journeys cj
  join public.couples c on c.id = cj.couple_id
  where cj.id = p_couple_journey
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_cj.id is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_cj.completed_at is not null then
    raise exception 'this journey is already complete';
  end if;

  if char_length(coalesce(p_note, '')) > 2000 then
    raise exception 'journey_note_too_long';
  end if;

  insert into public.journey_checkins (couple_journey_id, stage_position, author, note)
  values (p_couple_journey, v_cj.current_stage, auth.uid(), p_note)
  on conflict (couple_journey_id, stage_position, author)
  do update set note = excluded.note;
end;
$$;

revoke all on function public.record_journey_checkin(uuid, text) from public;
grant execute on function public.record_journey_checkin(uuid, text) to authenticated;
