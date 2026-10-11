# Catchline backend: setup and go-live steps

Everything below is built and tested **locally only** (Mac Mini, colima). No hosted Supabase project, Modal app, RevenueCat or store resource exists yet. The steps marked **(Yash)** need an account, a dashboard or a credential.

## What exists

| Piece | Where | Proven by |
|---|---|---|
| Schema, RLS, caps, job queue, coach link, clip purge | `supabase/migrations/0001..0003` | `supabase test db` (5 files, 109 pgTAP assertions) |
| Parallax history (not applied) | `supabase/archive-parallax/` | kept for the record; excluded from tsc |
| Worker (pgmq job -> `cv/catchline_cv` -> analysis + cue) | `worker/catchline_worker/` | `uv run pytest` (14), `ruff check` + `ruff format --check` |
| Modal deploy file (not deployed) | `worker/modal_app.py` | lint only |
| App API (`createLift` + TUS, `subscribeToLift`, `getAnalysis`, `listLifts`, `listCues`, `updateCue`, `createCoachLink`, `recordConsent`, `getAllowance`) | `src/lib/api/` | `npm test` (`src/lib/api/*.test.ts`) |
| DB types | `src/types/db.ts` (generated) | `npm run typecheck` |
| End-to-end | `scripts/catchline-e2e.sh` | see "Local run" |

### Data flow

1. App: `recordConsent('upload_privacy', v, true)` once, then `createLift({ movement, loadKg, file })`:
   - `create_lift` RPC checks consent and the cap (free 3 for life; Hook 12 / Pull 40 / Platform 100 / Founding 40 per month; bonus credits after that) and reserves `raw-clips/<user_id>/<lift_id>`.
   - TUS upload in 6 MB chunks (resumable: persist `onUploadUrl`, pass it back as `uploadUrl`). Storage RLS only allows an INSERT at that exact path while the lift is `uploading`; nobody can read raw clips back.
   - `enqueue_lift` RPC checks the object exists, sets `queued`, sends a pgmq message on `lift_jobs`, and calls `wake_worker()` (pg_net POST to the worker, if configured).
2. Worker: `claim_lift_job` (pgmq read, 600 s visibility, max 3 attempts) -> download -> `catchline_cv.pipeline.run` -> keyframes to `keyframes/<user_id>/<lift_id>/` -> `complete_lift_job` (analysis row; cue memory: the same active fault adds a session) -> delete the raw clip -> `mark_clip_deleted` (audited in `clip_deletions`). Errors retry; the last attempt fails the lift. Failed and expired lifts refund their credit.
3. App: `subscribeToLift(id, { onLift, onAnalysis })` (Realtime on `lifts`; `lifts` and `analyses` are in `supabase_realtime`). `getAnalysis` returns the Analysis JSON with keyframe paths swapped for 1 h signed URLs.
4. Backstop: pg_cron `catchline-purge-storage` every 10 min deletes (via the Storage API, with the URL + service key in Vault) raw clips older than 23 h 50 m or whose lift is finished/gone, and keyframes whose lift is gone (deleted lift or account). Lifts not finished by then fail as `expired` and are refunded.
5. Coach: `createCoachLink(liftId, days=14)` -> 32-char token. `get_coach_link(token)` / `save_coach_feedback(token, overrides, notes)` are callable by anon; expired or revoked links return nothing.

## Local run (Mini only, never the laptop)

```sh
rsync -a --delete --exclude node_modules --exclude .git --exclude .venv ./ mini:catchline-backend/
ssh mini
export PATH=/opt/homebrew/bin:$PATH && cd ~/catchline-backend
supabase start -x vector,analytics,imgproxy,edge-runtime,supavisor --ignore-health-check   # ports 554xx, project "catchline"
supabase db reset && ./scripts/catchline-local-secrets.sh    # reset wipes Vault; the purge needs these two secrets
supabase test db
(cd worker && uv sync && uv run ruff check . && uv run pytest -q)
E2E_NODE_PATH=~/catchline-e2e/node_modules ./scripts/catchline-e2e.sh ~/catchline-e2e/snatch-2026-09-20.mov
```

The e2e script signs a user up, records consent, creates a lift, uploads with the app's own `src/lib/api/tus.ts` (Node 25), enqueues, runs `python -m catchline_worker --once`, and prints the lift, analysis, cue, keyframe count, deletion audit and the Realtime events. `E2E_NODE_PATH` needs `@supabase/supabase-js` installed (`npm i @supabase/supabase-js` in `~/catchline-e2e`). The archived Parallax stack can keep running on 543xx alongside.

## Go-live steps (Yash)

### 1. Supabase project
1. Create a new project (region Singapore `ap-southeast-1`; permanent). Do not reuse the Parallax project (consent and data reasons, see `10-parallax-reuse.md`).
2. `supabase link --project-ref <ref>` then `supabase db push`. This applies 0001-0003: tables, RLS, buckets, pgmq queue, pg_cron job. Check in the dashboard that the `pgmq`, `pg_cron`, `pg_net` extensions are enabled (Database -> Extensions) if the push complains.
3. Vault secrets (SQL editor; values from Settings -> API, never committed):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'catchline_api_url');
   select vault.create_secret('<service_role key>', 'catchline_service_key');
   -- after step 2 below:
   select vault.create_secret('https://<modal wake url>', 'catchline_worker_url');
   select vault.create_secret('<random 32+ char token>', 'catchline_worker_token');
   ```
   Without the first two the purge job logs a warning and deletes nothing, so check: `select public.purge_storage();` returns a number, not `-1`.
4. Storage: Settings -> Storage -> upload file size limit >= 500 MB (Pro plan; Free caps files at 50 MB, too small for slo-mo clips). The bucket limits come from 0003.
5. Auth: Apple + Google providers, redirect URLs, Resend SMTP, as in `docs/APP_DEPLOYMENT.md` and `docs/PROD_SETUP.md`. `supabase/config.toml` still uses the `parallax://` scheme until the app identity changes.
6. Deploy `delete-account`: `supabase functions deploy delete-account`.
7. EAS env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for preview + production.
8. Optional: TUS on the direct storage host (`https://<ref>.storage.supabase.co/storage/v1/upload/resumable`) is faster for large files; `uploadLiftClip` currently uses `<SUPABASE_URL>/storage/v1/upload/resumable`.

### 2. Modal worker
1. `pip install modal && modal setup` (account).
2. `modal secret create catchline-supabase SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> WORKER_TOKEN=<the token from 1.3>`
3. `modal deploy worker/modal_app.py` (from the repo root). It builds an image with ffmpeg + the CV deps and bakes the RTMPose/YOLOX ONNX weights in. CPU only (2 cores, 4 GiB), `scaledown_window` 180 s, at most 4 containers.
4. Put the printed `wake` URL into Vault as `catchline_worker_url` (1.3). The `sweep` cron drains the queue every 2 min anyway, so a lost wake only delays a result.
5. Smoke test: upload one clip from a dev build; watch `modal app logs catchline-worker`; expect a `{"status": "done", ...}` line and the lift going `queued -> processing -> done` in the app.

### 3. RevenueCat (needed before paid caps mean anything)
`profiles.plan` defaults to `free` and only the service role can change it. Add a RevenueCat webhook (edge function, service-role write) that sets `plan` to `hook` / `pull` / `platform` / `founding` and back to `free` on expiry. Consumable 10-packs add to `usage_counters.bonus_credits`. Until then everyone is on the free 3-for-life cap.

## Known gaps (not built here)
- **Face blur.** Keyframes are stored unblurred. `14-legal-privacy.md` s.9.2 requires blurring secondary people and (in exports/coach links) the lifter's face from a pose-derived head box. That is a `cv/` change; do it before the coach link is public.
- **Coach page.** `get_coach_link` returns the analysis, but keyframe images are private storage paths; the public page needs an edge function that mints signed URLs for a valid token. No page exists yet.
- **Movements.** The CV pipeline only analyses snatch; other v1 movements get a `failure: unsupported_movement` analysis (and the credit back).
- **Claude cue phrasing** (Haiku) is not wired; the cue text is the rules engine's canned text.
- **Push on completion** (Expo push "your analysis is ready") is not wired; Realtime only.
- **Plan gating** of coach links (Pull view-only, Platform full) is not enforced server-side; every user can mint one.
- Abuse: deleting and re-creating an account restarts the free 3.
