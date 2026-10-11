-- 0006_harden.sql
-- Security + integrity hardening:
--   1. Remove the broad couples UPDATE policy (clients could set plus/streak/status
--      directly). All couple mutations already go through SECURITY DEFINER fns.
--   2. submit_answers: validate each prompt belongs to this drop and pick/hunch are
--      within the prompt's option range.
--   3. learnings: make add_learning idempotent per (couple, about, origin) so
--      re-saving a refocus resolution upserts instead of duplicating.

-- ============================================================================
-- 0. Explicit table privileges for authenticated/anon
-- ============================================================================
-- This Postgres' default privileges only grant Dxt (truncate/refs/trigger) to
-- anon/authenticated, NOT the DML a logged-in user needs — so every PostgREST
-- read/write for an authenticated user fails with "permission denied". RLS is
-- enabled on every table and gates WHICH rows are visible; these grants just open
-- the door for RLS to do its job. (Tables created in later migrations must grant
-- themselves the same way.)
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- ============================================================================
-- 1. Drop the trust-the-client couples UPDATE policy
-- ============================================================================
-- create_couple / join_couple / complete_streak run as SECURITY DEFINER (owner),
-- so they bypass RLS and do not need this policy. Without it, a member can no
-- longer client-side flip plus=true, streak, status, member_b, or freezes_remaining.
drop policy if exists "update_own_couple" on public.couples;

-- ============================================================================
-- 2. submit_answers with input validation
-- ============================================================================
create or replace function public.submit_answers(
  p_couple_drop uuid,
  p_answers jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_drop_id uuid;
  v_prompt_id uuid;
  v_pick int;
  v_hunch int;
  v_answer jsonb;
  v_new_state text;
  v_member_a_done boolean;
  v_member_b_done boolean;
  v_prompt_count int;
  v_opt_count int;
begin
  -- Get the couple_drop and verify membership
  select cd.couple_id, cd.drop_id into v_couple_id, v_drop_id
  from public.couple_drops cd
  where cd.id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  -- Verify caller is a member of the couple
  if not exists (
    select 1
    from public.couples c
    where c.id = v_couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Count prompts for this drop (for the "all answered" check)
  select count(*)::int into v_prompt_count
  from public.drop_prompts dp
  where dp.drop_id = v_drop_id;

  -- Insert or update each answer, validating each one
  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    v_prompt_id := (v_answer->>'prompt_id')::uuid;
    v_pick := (v_answer->>'pick')::int;
    v_hunch := (v_answer->>'hunch')::int;

    -- The prompt must belong to THIS drop (not just exist somewhere)
    select coalesce(array_length(options, 1), 0) into v_opt_count
    from public.drop_prompts
    where id = v_prompt_id and drop_id = v_drop_id;

    if v_opt_count is null then
      raise exception 'prompt % does not belong to this drop', v_prompt_id;
    end if;

    -- pick/hunch (when present) must index a real option
    if v_pick is not null and (v_pick < 0 or v_pick >= v_opt_count) then
      raise exception 'pick % out of range for prompt %', v_pick, v_prompt_id;
    end if;
    if v_hunch is not null and (v_hunch < 0 or v_hunch >= v_opt_count) then
      raise exception 'hunch % out of range for prompt %', v_hunch, v_prompt_id;
    end if;

    insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
    values (p_couple_drop, v_prompt_id, auth.uid(), v_pick, v_hunch)
    on conflict (couple_drop_id, prompt_id, author) do update
    set pick = excluded.pick, hunch = excluded.hunch, created_at = now();
  end loop;

  -- Check if member_a has answered all prompts
  select (count(*) = v_prompt_count) into v_member_a_done
  from public.answers a
  join public.couple_drops cd on a.couple_drop_id = cd.id
  where cd.id = p_couple_drop
    and a.author = (select member_a from public.couples where id = v_couple_id);

  -- Check if member_b has answered all prompts
  select (count(*) = v_prompt_count) into v_member_b_done
  from public.answers a
  join public.couple_drops cd on a.couple_drop_id = cd.id
  where cd.id = p_couple_drop
    and a.author = (select member_b from public.couples where id = v_couple_id);

  -- Determine new state
  if v_member_a_done and v_member_b_done then
    v_new_state := 'revealed';
  elsif v_member_a_done or v_member_b_done then
    v_new_state := 'one_done';
  else
    v_new_state := 'open';
  end if;

  -- Update couple_drops state
  update public.couple_drops
  set state = v_new_state
  where id = p_couple_drop;

  return json_build_object(
    'success', true,
    'couple_drop_id', p_couple_drop,
    'new_state', v_new_state
  );
end;
$$;

grant execute on function public.submit_answers(uuid, jsonb) to authenticated;

-- ============================================================================
-- 3. Idempotent learnings (dedupe on couple + about + origin)
-- ============================================================================
-- Collapse any pre-existing duplicates before adding the unique index.
delete from public.learnings a
using public.learnings b
where a.ctid < b.ctid
  and a.couple_id = b.couple_id
  and a.about = b.about
  and a.origin = b.origin;

create unique index if not exists learnings_couple_about_origin_key
  on public.learnings (couple_id, about, origin);

create or replace function public.add_learning(
  p_couple uuid,
  p_about uuid,
  p_emoji text,
  p_need text,
  p_detail text,
  p_source text,
  p_origin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learning_id uuid;
begin
  -- Guard: caller must be a member of p_couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Guard: p_about must be a member of p_couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = p_about or c.member_b = p_about)
  ) then
    raise exception 'p_about is not a member of this couple';
  end if;

  -- Guard: p_source must be 'drop' or 'refocus'
  if p_source not in ('drop', 'refocus') then
    raise exception 'p_source must be drop or refocus';
  end if;

  -- Upsert: same (couple, about, origin) refreshes the row instead of duplicating
  insert into public.learnings (
    couple_id, about, emoji, need, detail, source, origin
  )
  values (p_couple, p_about, p_emoji, p_need, p_detail, p_source, p_origin)
  on conflict (couple_id, about, origin) do update
  set emoji = excluded.emoji,
      need = excluded.need,
      detail = excluded.detail,
      source = excluded.source
  returning id into v_learning_id;

  return v_learning_id;
end;
$$;

grant execute on function public.add_learning(uuid, uuid, text, text, text, text, text) to authenticated;
