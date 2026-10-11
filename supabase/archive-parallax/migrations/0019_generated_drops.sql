-- 0019_generated_drops.sql
-- Phase 1.4 (docs/IMPROVEMENT_PLAN.md §4): the generative engine's review queue.
--   1. drop_candidates: LLM-authored (or hand-authored) candidate drops, written
--      by the generate-drops edge function. An OPS surface: RLS on, zero grants
--      to anon/authenticated — only service_role can touch it. Prompt shape
--      (exactly 3 prompts x 5 non-empty options) is enforced by a check
--      constraint so malformed LLM output can never land.
--   2. publish_drop_candidate(uuid): approves a candidate and publishes it as a
--      GLOBAL catalog drop (code 'GEN <shortid>', position = max+1), plus its 3
--      drop_prompts. ensure_today_drop (0015) then serves it naturally in every
--      couple's rotation. Idempotent via drop_candidates.published_drop_id.
--      Couple-SCOPED serving is a documented v2 (docs/GENERATIVE_ENGINE.md);
--      v1 keeps published candidates global.
-- Idempotent: if-not-exists / create-or-replace throughout.

-- ----------------------------------------------------------------------------
-- 1. Prompt-shape validator: an array of exactly 3 objects, each with a
--    non-empty emoji + question and exactly 5 non-empty string options.
-- ----------------------------------------------------------------------------
create or replace function public.is_valid_candidate_prompts(p jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) = 3
     and not exists (
       select 1
       from jsonb_array_elements(p) as el
       where jsonb_typeof(el) <> 'object'
          or coalesce(btrim(el->>'emoji'), '') = ''
          or coalesce(btrim(el->>'question'), '') = ''
          or jsonb_typeof(el->'options') <> 'array'
          or jsonb_array_length(el->'options') <> 5
          or exists (
            select 1
            from jsonb_array_elements(el->'options') as o
            where jsonb_typeof(o) <> 'string'
               or coalesce(btrim(o #>> '{}'), '') = ''
          )
     );
$$;

-- ----------------------------------------------------------------------------
-- 2. The review queue
-- ----------------------------------------------------------------------------
create table if not exists public.drop_candidates (
  id uuid not null primary key default gen_random_uuid(),
  -- null couple_id = a global candidate (generated from the catalog at large)
  couple_id uuid null references public.couples(id) on delete cascade,
  title text,
  theme text,
  spice int not null default 0,
  prompts jsonb not null,
  source text not null default 'llm',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  published_drop_id uuid null references public.drops(id),
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  constraint drop_candidates_prompts_shape
    check (public.is_valid_candidate_prompts(prompts))
);

-- Ops surface: NO client access at all. RLS is on with zero policies, and the
-- 0006 blanket grant predates this table, so anon/authenticated hold nothing —
-- the explicit revoke keeps that true even if defaults ever change.
alter table public.drop_candidates enable row level security;
revoke all on public.drop_candidates from anon, authenticated;
grant all on public.drop_candidates to service_role;

-- ----------------------------------------------------------------------------
-- 3. publish_drop_candidate: approve + publish into the global rotation.
--    Calling it IS the approval (no pre-approval required): flips status to
--    'approved', creates the drop (position = next after the current catalog
--    max) + its 3 prompts, records published_drop_id. Re-publishing an
--    already-published candidate returns the existing drop id (idempotent).
--    service_role only.
-- ----------------------------------------------------------------------------
create or replace function public.publish_drop_candidate(p_candidate uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cand public.drop_candidates%rowtype;
  v_drop_id uuid;
  v_position int;
begin
  select * into v_cand
  from public.drop_candidates
  where id = p_candidate
  for update;

  if v_cand.id is null then
    raise exception 'candidate not found';
  end if;

  -- Idempotent: already published -> same drop id, no duplicates.
  if v_cand.published_drop_id is not null then
    return v_cand.published_drop_id;
  end if;

  select coalesce(max(d.position), 0) + 1 into v_position
  from public.drops d
  where d.position is not null;

  insert into public.drops (code, title, theme, position, spice)
  values (
    'GEN ' || upper(substr(replace(p_candidate::text, '-', ''), 1, 6)),
    v_cand.title,
    v_cand.theme,
    v_position,
    greatest(0, least(2, v_cand.spice))
  )
  returning id into v_drop_id;

  insert into public.drop_prompts (drop_id, position, emoji, question, options)
  select
    v_drop_id,
    (el.ord - 1)::int,
    el.val->>'emoji',
    el.val->>'question',
    (select array_agg(o.v #>> '{}' order by o.ord)
     from jsonb_array_elements(el.val->'options') with ordinality as o(v, ord))
  from jsonb_array_elements(v_cand.prompts) with ordinality as el(val, ord);

  update public.drop_candidates
  set status = 'approved',
      published_drop_id = v_drop_id,
      reviewed_at = now()
  where id = p_candidate;

  return v_drop_id;
end;
$$;

-- Functions default to EXECUTE for public — strip that; this is service_role's.
revoke execute on function public.publish_drop_candidate(uuid) from public, anon, authenticated;
grant execute on function public.publish_drop_candidate(uuid) to service_role;
