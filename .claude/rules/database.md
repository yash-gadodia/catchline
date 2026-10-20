---
paths: ["supabase/**", "src/lib/supabase.ts", "src/types/db.ts", "src/features/**"]
---

# Supabase / data layer

Backend is Supabase (Postgres + Auth + Storage + Realtime + pgmq/pg_cron). Migrations `supabase/migrations/0001..0006` (`0001_catchline_core`, `0002_lift_pipeline`, `0003_storage`, `0004_plan_sync`, `0005_lifts_ahead`, `0006_account_transfer`); the typed client is `src/lib/supabase.ts`; types in `src/types/db.ts`. Edge functions: `delete-account`, `revenuecat-webhook`, `sync-plan` (caller's JWT -> RevenueCat subscriber -> `apply_plan`, upgrades only).


> Local dev runs only on the **Mac Mini** (`ssh mini`, colima, ports 554xx), never the laptop. See `docs/catchline/BACKEND_SETUP.md` "Local run" for the exact `supabase start -x ...` line, then `supabase db reset` + `supabase test db`.

## RLS is the security backbone (don't bypass)
- Tables: `profiles`, `consents`, `usage_counters`, `lifts`, `analyses`, `cues`, `coach_links`, `feature_flags`, `clip_deletions`, `revenuecat_events`. RLS is **owner-only** everywhere (`user_id = auth.uid()`); `feature_flags` is the shared read-only exception.
- Clients never write status, counters, plan or analyses. **Caps, consent and job state are enforced server-side** in SECURITY DEFINER functions: `create_lift` (checks `consent_granted` + `lift_allowance`/`plan_cap`), `refund_lift`, `enqueue_lift`, `claim_lift_job` / `complete_lift_job` / `fail_lift_job` (worker), `create_coach_link` / `get_coach_link` / `save_coach_feedback` (the one cross-user path, token-gated), `delete_my_account`, `apply_plan` (service role, RevenueCat webhook), `founding_seats`, `lifts_ahead` (queue position), `mark_clip_deleted`, `purge_storage`, `begin_account_transfer` / `complete_account_transfer` (anonymous -> Apple: single-use 15 min token, reassigns every owner-scoped row, sums usage counters, keeps the higher plan). Clients call them via `supabase.rpc(...)`.
- **Raw clips**: `raw-clips` bucket is write-only for the client (insert the one object its pending lift names); nobody but the service role reads it. Deleted after analysis, with `purge_storage` on pg_cron (`catchline-purge-storage`, every 10 min) as the 24 h backstop and `clip_deletions` as the audit log.
- Proven by `supabase/tests/{rls,caps,purge,pipeline,plan_sync,coach_link,lifts_ahead,account_transfer}_test.sql`, which switch into `authenticated` / `anon` with `request.jwt.claims` and assert real row counts. Keep them green.
- **Never rely on default privileges — state grants AND revokes explicitly.** Stock Supabase grants `anon`+`authenticated` ALL on every new table via default ACLs (the Parallax 0036 lesson). Every table starts from `revoke all` and grants back only what the client needs; RLS still gates rows.
- Apple (0009): `apple_tokens` is service-role only (RLS on, no policies); `apple-token` stores it, `delete-account` revokes it. Proven by `apple_tokens_test.sql`.
- Ops (0008): `worker_heartbeats` + `ops_alerts` are service-role only; `worker_heartbeat` (worker), `ops_health` / `ops_health_check` (pg_cron `catchline-health`, every 5 min, posts changes to the `ops-alert` function). Proven by `ops_health_test.sql`.
- Retest (0011): `lifts.retest_cue_id` is set only by `create_lift(p_movement, p_load_kg, p_retest_cue_id)` (own trying cue, same movement, else null); `complete_lift_job` counts a retest as a session of that cue even when another fault is the headline. Proven by `retest_cue_test.sql`.
- Traces (0014): `lift-traces` bucket (`<user>/<lift>.json.gz`, service-role write, lift owner reads), `analysis_history` (superseded analyses, owner reads via the lift), `save_reanalysis` (service role, the worker's `rerun`), `delete_lift_traces` (called by `delete_my_account`). `purge_storage` sweeps only traces whose lift is gone. Proven by `lift_traces_test.sql`.
- On-device analysis (0018): `lifts.status` gains `analysing`, `pose_source` gains `on_device`, `lifts.cue_id` / `no_cue_code` hold the per-lift record. `record_lift_outcome` is the one finish (status, refund, cue memory, retest session) behind `complete_lift_job` (worker) and the owner RPCs `start_device_analysis` / `save_device_analysis(lift, cue, no_cue_code)` / `fail_device_lift(lift, code)`. A 3.1 phone keeps analysis, trace and stills locally and calls `delete_my_server_analyses()` (owner, idempotent) to drop its server copies. Proven by `device_analysis_test.sql`.
- Realtime needs the table in `supabase_realtime` (`lifts`, `analyses` today).
- `service_role` / secrets never ship in the client — only `EXPO_PUBLIC_SUPABASE_URL` + anon key (`.env.local`, gitignored).

## Migrations & local dev
- New schema → a new `00NN_*.sql` migration, **idempotent** (`if not exists`, `on conflict do nothing`, `drop policy if exists` before `create policy`).
- After agent psql verification the local DB is dirty → `supabase db reset` before trusting `supabase test db`.

## supabase-js typing
- Typed `.rpc()` / `.update()` sometimes infers args as `never` (a known supabase-js limitation with the generated `Database` generic). Use a single documented `// @ts-expect-error supabase-js typed ... resolves to never` — this is the established codebase pattern. **Never `as any`.**
- New RPCs go in `Database['public']['Functions']` and new tables in `Tables` in `src/types/db.ts`.

## Dev mode
Without `EXPO_PUBLIC_SUPABASE_URL` + `ANON_KEY` the repositories fall back to local fixture stores (`src/data/backend.ts` owns the switch), so the app runs without a backend.
