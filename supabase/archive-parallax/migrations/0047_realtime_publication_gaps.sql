-- Realtime publication gaps.
--
-- The client subscribes to postgres_changes on five tables (activity,
-- couple_drops, couples, reactions, refocus_sessions) but only the latter two
-- were ever added to the supabase_realtime publication (0018, 0020). Postgres
-- silently emits nothing for an unpublished table, so three subscriptions have
-- always been dead:
--
--   * couples      — the inviter never saw the pairing flip to 'active'; they
--                    sat on the invite code until they force-quit the app.
--   * couple_drops — the partner-submitted / reveal-ready state change, i.e.
--                    the live half of the core daily loop.
--   * activity     — the feed never streamed.
--
-- Idempotent, 0018/0020 pattern. RLS still scopes what each subscriber receives:
-- publishing a table does not widen read access, it only lets the WAL stream
-- reach subscribers whose policies already allow the row.
do $$
declare
  t text;
begin
  foreach t in array array['couples', 'couple_drops', 'activity']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
