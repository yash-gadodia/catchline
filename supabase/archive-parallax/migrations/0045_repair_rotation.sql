-- 0045_repair_rotation.sql
-- V2 F4 (V2_PLAN §10 distribution + §11.19): repair literacy in the daily
-- rotation, server-side where 0015/0029/0032 selection already runs.
--
-- Deterministic hybrid:
--   * every 4th round (played-count % 4 = 3) serves one unplayed
--     repair-themed prompt (drops.theme = 'repair')
--   * each of the 2 rounds after ANY refocus reveal (two-sided reveal or a
--     saved solo reflection — both state 'revealed') boosts one repair
--     prompt to the front of selection
--   * couple + spice fences apply unchanged; repair prompts are held back
--     from the intent-weighted classic branch (like reinforcement kinds) so
--     they sprinkle on cadence instead of clumping in catalog order
--
-- The catalog has NO theme='repair' drops yet (that's Dani's F4 content
-- pass) — every repair branch falls through, so this ships inert.
--
-- Re-asserts _next_drop_for from 0032 with the repair branch added.
-- Priority: pack_override > own-couple scoped > REPAIR CADENCE/BOOST >
-- reinforcement cadence > intent-weighted classic > any unplayed > LRU.

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
  v_last_reveal timestamptz;
  v_since_reveal int;
  v_repair_due boolean := false;
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

  select count(*) into v_played
  from public.couple_drops cd
  where cd.couple_id = p_couple;

  -- V2 F4: repair cadence — every 4th round, plus a 2-round boost window
  -- after any refocus reveal (deterministic hybrid, §10).
  select max(rs.revealed_at) into v_last_reveal
  from public.refocus_sessions rs
  where rs.couple_id = p_couple
    and rs.state = 'revealed';

  if v_last_reveal is not null then
    select count(*) into v_since_reveal
    from public.couple_drops cd
    where cd.couple_id = p_couple
      and cd.created_at > v_last_reveal;
    if v_since_reveal < 2 then
      v_repair_due := true;
    end if;
  end if;

  if v_repair_due or (v_played % 4 = 3) then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.theme = 'repair'
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

  -- 0029: reinforcement cadence — every 5th round (the couple's 5th, 10th, …
  -- drop, i.e. played-count % 5 = 4) serves one unplayed reinforcement drop
  -- (kind <> 'classic'), fenced exactly like every other branch. Nothing
  -- unplayed of those kinds -> fall through unchanged.
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
  -- first. Reinforcement kinds and repair-themed prompts are held back for
  -- their cadence branches so they sprinkle instead of clumping.
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
    and d.theme is distinct from 'repair'
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
