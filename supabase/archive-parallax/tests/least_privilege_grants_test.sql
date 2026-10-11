-- ============================================================================
-- LEAST-PRIVILEGE GRANTS TEST (0037)
-- Pins every table's grant posture against stock default-ACL drift: stated
-- grants hold, everything else is revoked. Complements RLS enforcement tests
-- (rows) — this asserts the privilege layer (defense-in-depth).
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(30);

  -- pre-0006 contract: authenticated DML + anon read
  select ok(has_table_privilege('authenticated', 'public.answers', 'select'), 'authenticated can select answers');
  select ok(has_table_privilege('authenticated', 'public.answers', 'insert'), 'authenticated can insert answers (0006)');
  select ok(has_table_privilege('authenticated', 'public.couples', 'update'), 'authenticated can update couples (0006)');
  select ok(has_table_privilege('anon', 'public.couples', 'select'), 'anon keeps read on pre-0006 tables (empty via RLS, not an error)');
  select ok(has_table_privilege('anon', 'public.answers', 'select'), 'anon keeps read on answers (RLS returns 0 rows)');
  select ok(not has_table_privilege('anon', 'public.answers', 'insert'), 'anon cannot insert answers');
  select ok(not has_table_privilege('anon', 'public.couples', 'insert'), 'anon cannot insert couples');
  select ok(not has_table_privilege('anon', 'public.couples', 'delete'), 'anon cannot delete couples');
  select ok(not has_table_privilege('authenticated', 'public.answers', 'truncate'), 'authenticated cannot truncate answers');
  select ok(not has_table_privilege('authenticated', 'public.couples', 'truncate'), 'authenticated cannot truncate couples');

  -- reactions: stated client DML (0018)
  select ok(has_table_privilege('authenticated', 'public.reactions', 'select'), 'authenticated can select reactions');
  select ok(has_table_privilege('authenticated', 'public.reactions', 'insert'), 'authenticated can insert reactions');
  select ok(has_table_privilege('authenticated', 'public.reactions', 'delete'), 'authenticated can delete reactions');
  select ok(not has_table_privilege('authenticated', 'public.reactions', 'truncate'), 'authenticated cannot truncate reactions');
  select ok(not has_table_privilege('anon', 'public.reactions', 'select'), 'anon has nothing on reactions');

  -- select-only surfaces
  select ok(has_table_privilege('authenticated', 'public.journeys', 'select'), 'authenticated can read journeys');
  select ok(not has_table_privilege('authenticated', 'public.journeys', 'insert'), 'journeys writes are definer-fn only');
  select ok(has_table_privilege('authenticated', 'public.money_date_sessions', 'select'), 'authenticated can read money_date_sessions');
  select ok(not has_table_privilege('authenticated', 'public.money_date_sessions', 'insert'), 'money date writes are definer-fn only');
  select ok(has_table_privilege('authenticated', 'public.closeness_feedback', 'select'), 'authenticated can read closeness_feedback');
  select ok(not has_table_privilege('authenticated', 'public.closeness_feedback', 'insert'), 'closeness writes are definer-fn only');
  select ok(not has_table_privilege('anon', 'public.journeys', 'select'), 'anon has nothing on journeys');
  select ok(not has_table_privilege('anon', 'public.money_date_sessions', 'select'), 'anon has nothing on money_date_sessions');
  select ok(has_table_privilege('authenticated', 'public.refocus_sessions', 'select'), 'authenticated keeps read on refocus_sessions (0036)');
  select ok(not has_table_privilege('authenticated', 'public.refocus_sessions', 'insert'), 'refocus_sessions writes stay definer-fn only (0036)');

  -- ops-only tables: no client access at all
  select ok(not has_table_privilege('authenticated', 'public.refocus_calls', 'select'), 'refocus_calls invisible to clients');
  select ok(not has_table_privilege('anon', 'public.refocus_calls', 'select'), 'refocus_calls invisible to anon');
  select ok(not has_table_privilege('authenticated', 'public.drop_candidates', 'select'), 'drop_candidates invisible to clients (0019)');
  select ok(not has_table_privilege('authenticated', 'public.push_ledger', 'select'), 'push_ledger invisible to clients (0023)');
  select ok(not has_table_privilege('anon', 'public.push_ledger', 'select'), 'push_ledger invisible to anon');

  select * from finish();
rollback;
