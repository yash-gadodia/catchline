-- Couple memory: what the mediator knows before it mediates.
--
-- v2 makes two-sided AI mediation the product. A mediator that starts cold
-- every time is just ChatGPT with extra steps; the moat is that it remembers
-- what worked for THIS couple. This migration adds the compact memory unit and
-- one read path for it.
--
-- Additive only. Nothing is dropped, no existing column changes meaning.

-- 1. Sessions distil to a summary, never re-read raw sides.
--    The vents are the most sensitive text in the product; they are written
--    once, mediated, and must never re-enter a later prompt. A 1-2 sentence
--    recap plus topic themes is what carries forward.
alter table public.refocus_sessions
  add column if not exists summary text,
  add column if not exists themes text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'refocus_sessions_summary_check'
  ) then
    alter table public.refocus_sessions
      add constraint refocus_sessions_summary_check
      check (summary is null or char_length(summary) <= 1000);
  end if;
end
$$;

-- 2. The pulse carries tap-only context tags (no typing, per the product law
--    that the daily unit must never become homework).
alter table public.mood_checks
  add column if not exists context_tags text[];

-- 3. Learnings can now originate from a repair check-in or the pulse, not just
--    a drop or a refocus session.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'learnings_source_check'
  ) then
    alter table public.learnings drop constraint learnings_source_check;
  end if;
  alter table public.learnings
    add constraint learnings_source_check
    check (source in ('drop', 'refocus', 'repair', 'pulse'));
end
$$;

-- 4. get_couple_context: the single read path the mediator uses.
--
-- SECURITY DEFINER so the edge function (service_role) can assemble context
-- without a user JWT, and so a member can see exactly what the mediator knows
-- about them (transparency is the trust story). Membership is checked
-- explicitly below — definer rights mean RLS does NOT apply inside this body,
-- so the guard is the only thing standing between a caller and another
-- couple's private life. Do not remove it.
--
-- PRIVACY: only shared learnings (is_private = false) are included. A private
-- reflection note belongs to its author alone; leaking one into a mediation
-- both partners read would expose it to the person it was withheld from.
-- Row caps keep the prompt bounded.
create or replace function public.get_couple_context(p_couple uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_member boolean;
  v_result jsonb;
begin
  if p_couple is null then
    raise exception 'couple id required';
  end if;

  -- auth.uid() is null for service_role (the edge function); a JWT-bearing
  -- caller must be a member of this couple.
  if auth.uid() is not null then
    select exists (
      select 1 from public.couples c
      where c.id = p_couple
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    ) into v_is_member;

    if not v_is_member then
      raise exception 'not a member of this couple';
    end if;
  end if;

  select jsonb_build_object(
    'learnings', coalesce((
      select jsonb_agg(l)
      from (
        select emoji, need, detail, about, created_at
        from public.learnings
        where couple_id = p_couple
          and is_private = false
        order by created_at desc
        limit 25
      ) l
    ), '[]'::jsonb),

    'sessions', coalesce((
      select jsonb_agg(s)
      from (
        select topic, summary, themes, state, created_at
        from public.refocus_sessions
        where couple_id = p_couple
          and summary is not null
        order by created_at desc
        limit 10
      ) s
    ), '[]'::jsonb),

    'mood_trend', coalesce((
      select jsonb_agg(m)
      from (
        select couple_local_date, mood, context_tags
        from public.mood_checks
        where couple_id = p_couple
          and couple_local_date >= (current_date - interval '14 days')
        order by couple_local_date desc
        limit 28
      ) m
    ), '[]'::jsonb),

    'open_repair', (
      select to_jsonb(r)
      from (
        select couple_local_date, state, created_at
        from public.repair_checkins
        where couple_id = p_couple
          and state = 'open'
        order by created_at desc
        limit 1
      ) r
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Functions are EXECUTE-able by PUBLIC by default — state the grants
-- explicitly in both directions (the 0036/0037 lesson: never rely on the
-- environment's default ACLs).
revoke execute on function public.get_couple_context(uuid) from public, anon;
grant execute on function public.get_couple_context(uuid) to authenticated, service_role;
