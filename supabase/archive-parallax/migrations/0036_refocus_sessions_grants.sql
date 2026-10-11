-- 0036_refocus_sessions_grants.sql
-- Restore 0020's stated grant posture explicitly. Newer Supabase stacks ship
-- stock default privileges (anon/authenticated get ALL on new tables), so the
-- 0006-era assumption "defaults grant no DML" no longer holds — 0020's
-- SELECT-only intent must be enforced by revoke, not inherited. RLS was never
-- breached (policies gate all rows); this is defense-in-depth.

revoke all on public.refocus_sessions from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.refocus_sessions from authenticated;
grant select on public.refocus_sessions to authenticated;
