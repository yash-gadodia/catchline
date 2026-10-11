-- 0034_auto_publish_candidates.sql
-- Phase 1.4 (docs/GENERATIVE_ENGINE.md v2 — auto-approve): once a generation source
-- has quality history (>= 5 reviewed candidates, acceptance rate >= 0.8), high-confidence
-- pending candidates skip the human review queue and auto-publish.
--
-- Key behaviors:
--   1. auto_publish_candidates(): a SECURITY DEFINER function (service_role only) that
--      finds pending candidates not older than 30 days, computes their source's
--      historical acceptance rate (global vs per-couple), and auto-publishes if the
--      source qualifies. Capped at 5 auto-publishes per invocation. Idempotent.
--   2. auto_published (boolean): flags a candidate that was published by this function,
--      not by human review. Distinguishes the two paths even though both end in
--      status='approved'.
--   3. Safe by design: deliberately inert until history accrues; permissions gated to
--      service_role only, matching the generate-drops edge function pattern.
--
-- Idempotent: if-not-exists / create-or-replace throughout.

-- ----------------------------------------------------------------------------
-- 1. Mark auto-published rows: a boolean flag + standard reviewed_at timestamp
--    (set by publish_drop_candidate).
-- ----------------------------------------------------------------------------
alter table public.drop_candidates
  add column if not exists auto_published boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. auto_publish_candidates(): the auto-approve orchestrator.
--    For each pending candidate not older than 30 days, compute its source's
--    acceptance rate from reviewed candidates (same couple_id or both global).
--    If source has >= 5 reviewed AND acceptance rate >= 0.8, publish it.
--    Capped at 5 auto-publishes per invocation (a guard rail against bad batches).
--    Returns a table of (candidate_id, source_couple_id, published_drop_id).
--    service_role only.
-- ----------------------------------------------------------------------------
create or replace function public.auto_publish_candidates()
returns table (
  candidate_id uuid,
  source_couple_id uuid,
  published_drop_id uuid,
  acceptance_rate numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.drop_candidates%rowtype;
  v_acceptance_rate numeric;
  v_reviewed_count int;
  v_approved_count int;
  v_auto_published_count int := 0;
  v_max_auto_publish int := 5;
  v_cutoff_date timestamptz := now() - interval '30 days';
  v_published_drop_id uuid;
begin
  -- Iterate through pending candidates not older than 30 days.
  for v_candidate in
    select * from public.drop_candidates
    where status = 'pending'
      and created_at > v_cutoff_date
    order by created_at
  loop
    exit when v_auto_published_count >= v_max_auto_publish;

    -- Compute the source's historical acceptance rate.
    -- A "source" is identified by: global (couple_id is null) or per-couple (couple_id = X).
    -- Acceptance rate = (candidates with status='approved') / (candidates with status in ('approved','rejected'))
    -- Human decisions only: auto-published rows must not feed their own gate,
    -- or the rate can only ratchet up and never re-tighten.
    select count(*)
      into v_reviewed_count
      from public.drop_candidates
      where ((couple_id is null and v_candidate.couple_id is null)
         or (couple_id = v_candidate.couple_id and v_candidate.couple_id is not null))
        and status in ('approved', 'rejected')
        and auto_published = false;

    -- Only compute the rate if there's enough history (>= 5 reviewed).
    if v_reviewed_count >= 5 then
      select count(*)
        into v_approved_count
        from public.drop_candidates
        where ((couple_id is null and v_candidate.couple_id is null)
           or (couple_id = v_candidate.couple_id and v_candidate.couple_id is not null))
          and status = 'approved'
          and auto_published = false;

      v_acceptance_rate := v_approved_count::numeric / v_reviewed_count::numeric;

      -- If acceptance rate meets the threshold (>= 0.8), auto-publish.
      if v_acceptance_rate >= 0.8 then
        v_published_drop_id := public.publish_drop_candidate(v_candidate.id);

        -- Mark the candidate as auto-published (distinguish from manual review).
        update public.drop_candidates
        set auto_published = true
        where id = v_candidate.id;

        return query select v_candidate.id, v_candidate.couple_id, v_published_drop_id, v_acceptance_rate;
        v_auto_published_count := v_auto_published_count + 1;
      end if;
    end if;
  end loop;
end;
$$;

-- Functions default to EXECUTE for public — strip that; this is service_role's.
revoke execute on function public.auto_publish_candidates() from public, anon, authenticated;
grant execute on function public.auto_publish_candidates() to service_role;
