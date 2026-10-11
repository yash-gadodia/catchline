-- 0037_least_privilege_grants.sql
-- Grants audit (follow-up to 0036): stock Supabase default ACLs hand
-- anon/authenticated ALL privileges on every table at creation, silently
-- exceeding each migration's stated grants. Restore every table to its
-- stated posture. RLS was never breached; this is defense-in-depth.
--
-- Pre-0006 tables keep the 0006 contract (authenticated DML, anon read —
-- signed-out clients rely on empty-result-not-error). Post-0006 tables get
-- exactly what their creating migration granted.

-- ---- pre-0006 tables: 0006 intent -------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'activity','answers','couple_drops','couples',
    'drop_prompts','drops','learnings','profiles'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select on public.%I to anon', t);
  end loop;
end;
$$;

-- ---- post-0006: client SELECT-only (writes are DEFINER-fn territory) --------
do $$
declare t text;
begin
  foreach t in array array[
    'closeness_feedback','journeys','journey_stages','couple_journeys',
    'couple_journey_stages','journey_checkins','money_date_sessions'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

-- ---- post-0006: client DML as stated (0018) ----------------------------------
revoke all on public.reactions from anon, authenticated;
grant select, insert, update, delete on public.reactions to authenticated;

-- ---- post-0006: no client access at all --------------------------------------
revoke all on public.refocus_calls from anon, authenticated;
revoke all on public.drop_candidates from anon, authenticated;   -- re-assert 0019
revoke all on public.push_ledger from anon, authenticated;       -- re-assert 0023
-- refocus_sessions handled by 0036.
