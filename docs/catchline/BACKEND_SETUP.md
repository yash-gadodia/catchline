# Catchline backend: setup and go-live steps

The backend is **hosted** since 2026-10-11: Supabase project `slowxjhvrdswdabjfydk` (the former Parallax project, wiped and renamed "Catchline") plus an always-on worker on the Mac Mini. See "Hosted backend" below. No Modal app exists yet; the RevenueCat webhook function is live but not yet configured in the RevenueCat dashboard. The steps marked **(Yash)** need an account, a dashboard or a credential.

## What exists

| Piece | Where | Proven by |
|---|---|---|
| Schema, RLS, caps, job queue, coach link, clip purge | `supabase/migrations/0001..0003` | `supabase test db` (6 files, 131 pgTAP assertions) |
| Plan sync (`apply_plan`, `founding`, `revenuecat_events`) + `founding_seats()` | `supabase/migrations/0004_plan_sync.sql` | `supabase/tests/plan_sync_test.sql` (22) |
| RevenueCat webhook -> `profiles.plan` | `supabase/functions/revenuecat-webhook/` | `deno test` in that folder (11) |
| Plan sync on demand (`sync-plan`: caller's JWT -> RevenueCat `GET /v1/subscribers/{uid}` -> `apply_plan`, upgrades only) | `supabase/functions/sync-plan/` | `deno test` in that folder (12) |
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

## Hosted backend (live, 2026-10-11)

| What | State |
|---|---|
| Project | `slowxjhvrdswdabjfydk`, `https://slowxjhvrdswdabjfydk.supabase.co`, Singapore, **Free plan**, display name "Catchline". Keys: `.secrets/catchline/` (index in `.secrets/KEYS.md`), never committed. |
| Parallax | Wiped. Backup first: `.secrets/catchline/parallax-final-backup.sql` (pg_dump of public/auth/storage, schema + data, 9 users). Then the remote DB was reset to `0001..0003` only (`supabase db reset --linked` from a scratch workdir holding just the Catchline migrations, run on the Mini because the laptop hook blocks `db reset`). Auth users were truncated; the 5 Parallax edge functions (refocus, notify-partner, generate-drops, scheduled-pushes, email-reengage) were deleted; `delete-account` redeployed from this repo (`--use-api`, no docker). The `ANTHROPIC_API_KEY` function secret is still set (unused for now). |
| Unused project | A separate "catchline" project `qpmnupqfkzvlurosudwm` was created first, then **paused** when the plan changed to reuse Parallax. Delete it from the dashboard when sure. |
| Verified on hosted | extensions pg_cron 1.6.4, pgmq 1.5.1, pg_net 0.20.3; pgmq queue `lift_jobs`; cron `catchline-purge-storage` (*/10); buckets `raw-clips` (500 MB, mov/mp4) + `keyframes` (5 MB, jpeg); `supabase_realtime` has `lifts` + `analyses`; RLS on all public tables; migrations 0001-0004 (0004 via `supabase db push --linked`, no docker). |
| Vault | `catchline_api_url`, `catchline_service_key` set; `select public.purge_storage()` returns `0`. No `catchline_worker_url`: the Mini worker polls every 5 s, so no wake is needed. |
| Auth | Anonymous sign-ins **on** (the app starts anonymous); Email on; Apple + Google already enabled from Parallax with client id `com.yashgadodia.parallax` (same bundle id). Site URL `catchline://`, redirects `catchline://auth-callback`, `catchline://**`. Email subjects/templates can't be changed on Free without custom SMTP (API returns 400), so they are still Supabase defaults. |
| pgTAP | 131/131 (6 files) pass against the hosted DB, no docker: each `supabase/tests/*.sql` piped through `psql` (they are `begin ... rollback`, so nothing persists). The CLI temp login role needs `set role postgres` first, and `reset role` in the tests is rewritten to `set local role postgres` for that run. |
| EAS env | `EXPO_PUBLIC_SUPABASE_URL` (plaintext) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (sensitive, the project's `sb_publishable_` key) were already set for production + preview from Parallax and match this project, so nothing changed. `EXPO_PUBLIC_REVENUECAT_IOS_KEY` kept. |

### Mini worker (always on)
- Code: `~/catchline-worker/{worker,cv}` on the Mini, exported with `git archive catchline worker cv` (revision in `~/catchline-worker/REVISION`); `uv sync --no-dev` in `worker/`.
- Env: `~/.config/catchline-worker/env` (600; `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), outside any repo. Wrapper `~/catchline-worker/run.sh` runs `uv run python -m catchline_worker --poll 5`.
- launchd: `~/Library/LaunchAgents/com.catchline.worker.plist` (RunAtLoad, KeepAlive), log `~/Library/Logs/catchline-worker.log`. Status: `launchctl print gui/$(id -u)/com.catchline.worker | grep state`.
- Update after a merge (from the laptop):
  ```sh
  rm -rf /tmp/wk && mkdir /tmp/wk && git archive catchline worker cv | tar -x -C /tmp/wk && git rev-parse --short catchline > /tmp/wk/REVISION
  rsync -a --delete --exclude .venv --exclude tmp --exclude run.sh /tmp/wk/ mini:catchline-worker/
  ssh mini 'export PATH=/opt/homebrew/bin:$PATH; cd ~/catchline-worker/worker && uv sync --no-dev && launchctl kickstart -k gui/$(id -u)/com.catchline.worker'
  ```

### Hosted end-to-end (2026-10-11, worker at 8d94028)
Anonymous sign-up (publishable key) -> consent -> `create_lift` -> TUS upload with `src/lib/api/tus.ts` -> `enqueue_lift` -> Mini worker -> result:
`lift: done`, `analysis: snatch reps=2`, `cue: jump_forward | Land where you started | low`, cue row `trying sessions=1`, 14 keyframes, raw clip objects left 0, deletion audit `worker`, queue 0, and the user signs a keyframe URL (HTTP 200 image/jpeg). The power-snatch reference `2026-08-26_FF600EFA.mov` also completes (`done`, 7 keyframes, raw deleted) but its rep measures all normal, so `cue: null`.

Re-run on 2026-10-11 with the worker at a8b790c (CV v2): `FF600EFA` (the re-encoded copy under 50 MB) still returns `cue: null`, but the original 58 MB clip gives `jump_forward` (6 cm) on the same Mini code. The re-encode changes the plate scale (2.96 vs 3.53 px/cm), which pushes the foot jump under the threshold. So the scale estimate depends on the input encoding, and the clip the app transcodes needs its own check on a device.

**Free-plan blocker:** the project-wide upload limit is 50 MB, so the 58 MB reference clip fails with `413 Maximum size exceeded` before the bucket's 500 MB limit applies. The runs above used the same clips re-encoded under 50 MB (h264). The app now trims and re-encodes every clip before upload (`modules/clip-transcoder`, `src/features/capture/compress.ts`): H.264, 1080 px long edge, source frame rate kept up to 120 fps, no audio, under 45 MB (the 58 MB reference goes up as 12.4 MB). Pro + a larger Storage file limit is no longer needed for uploads.

## Go-live steps (Yash)

### 1. Supabase project
Done on 2026-10-11 (see "Hosted backend"): project, migrations, Vault, auth URLs + anonymous, `delete-account`, EAS env. Left for Yash:
1. **Upgrade to Pro and set Storage upload limit >= 500 MB** (Settings -> Storage). Free caps files at 50 MB, too small for slo-mo clips. Free projects also pause after a week without activity (the worker's polling should count as activity).
2. Resend SMTP (then the Catchline email subjects/templates from `supabase/config.toml` can be applied) as in `docs/archive/parallax/APP_DEPLOYMENT.md` and `docs/archive/parallax/PROD_SETUP.md`.
3. Delete the paused unused project `qpmnupqfkzvlurosudwm` when sure.
4. Optional: TUS on the direct storage host (`https://<ref>.storage.supabase.co/storage/v1/upload/resumable`) is faster for large files; `uploadLiftClip` currently uses `<SUPABASE_URL>/storage/v1/upload/resumable`.

### 2. Modal worker
1. `pip install modal && modal setup` (account).
2. `modal secret create catchline-supabase SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service key> WORKER_TOKEN=<the token from 1.3>`
3. `modal deploy worker/modal_app.py` (from the repo root). It builds an image with ffmpeg + the CV deps and bakes the RTMPose/YOLOX ONNX weights in. CPU only (2 cores, 4 GiB), `scaledown_window` 180 s, at most 4 containers.
4. Put the printed `wake` URL into Vault as `catchline_worker_url` (1.3). The `sweep` cron drains the queue every 2 min anyway, so a lost wake only delays a result.
5. Smoke test: upload one clip from a dev build; watch `modal app logs catchline-worker`; expect a `{"status": "done", ...}` line and the lift going `queued -> processing -> done` in the app.

### 3. RevenueCat webhook
Built and deployed (2026-10-11): `revenuecat-webhook`, `verify_jwt` off, secret `REVENUECAT_WEBHOOK_AUTH` (value in `.secrets/catchline/revenuecat_webhook_auth.txt`).
- App: RevenueCat is configured with the Supabase user id (or `logIn(uid)` once the anonymous session exists, and always before a purchase or restore), so `app_user_id` = `profiles.id`. After a purchase or restore the app polls `lift_allowance()` (up to ~12 s) until the server plan catches up.
- Function: checks `Authorization` (constant time, else 401), finds the profile from `app_user_id` / `original_app_user_id` / `aliases` (RevenueCat anonymous ids -> 200 no-op, logged), maps entitlements + product ids to the highest plan and calls `apply_plan` (dedupes by event id, skips events older than the last applied one). INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / NON_RENEWING_PURCHASE set the plan; PRODUCT_CHANGE applies upgrades only (downgrades land with the RENEWAL); EXPIRATION -> free unless founding; TRANSFER moves the old owners' plan + founding to the new owner; TEST -> 200; anything else -> 200 ignored.
- Founding is the `profiles.founding` flag and floors the plan at `founding` (Platform still ranks above it). Refunds do not revoke it. Consumable 10-packs are not wired.
- **(Yash)** RevenueCat -> Integrations -> Webhooks: URL `https://slowxjhvrdswdabjfydk.supabase.co/functions/v1/revenuecat-webhook`, Authorization header = the whole contents of the secret file (it starts with `Bearer `). Send a test event (expect 200 `ignored: test`).
- `sync-plan` (deployed 2026-10-14, `verify_jwt` on, secret `REVENUECAT_SECRET_KEY` from `.secrets/catchline/revenuecat_secret_v1.txt`): the app calls it when the webhook is missed or slow (after a purchase/restore once `lift_allowance` polling gives up, on launch when RevenueCat ranks above the server plan, and on `cap_reached` for a paid lifter before the cap paywall). It reads the JWT's user, fetches the subscriber, and applies the highest active entitlement through `apply_plan` (event id `sync:<uid>:<latest date>`, event_at now); it never downgrades (expiry stays the webhook's job). Deploy: `supabase functions deploy sync-plan --project-ref slowxjhvrdswdabjfydk --use-api`.
- Deploy: `supabase functions deploy revenuecat-webhook --project-ref slowxjhvrdswdabjfydk --use-api --no-verify-jwt`.
- Proven on hosted: wrong/missing header 401; synthetic INITIAL_PURCHASE (pull) on a throwaway anonymous user -> `profiles.plan = pull`, `lift_allowance` cap 40/month; replay -> `duplicate`; EXPIRATION -> free, cap 3 lifetime; user deleted after.

### 4. Ops alerts (built 2026-10-15, NOT deployed)
What it does: the worker calls `worker_heartbeat(worker, version)` (service role only) at most once a minute from its poll loop; `worker_heartbeats` holds the last beat per worker (`CATCHLINE_WORKER_ID` or the hostname; version = `~/catchline-worker/REVISION`). pg_cron `catchline-health` (every 5 min) runs `ops_health_check()` (0008), which judges three conditions: a lift `queued`/`processing` for more than 5 min, no heartbeat for 3 min (or none ever), more than 3 failed lifts in 30 min. A condition that newly holds opens one `ops_alerts` row (a partial unique index allows one open row per kind, so one incident = one alert); when it clears the row gets `closed_at` and a recovery goes out. Each run with changes posts once (pg_net, `catchline_api_url` + `catchline_service_key` from Vault) to the `ops-alert` function, which sends an Expo push to the `profiles.push_token` of each id in the `OPS_ALERT_USER_IDS` secret, e.g. "Catchline alert: 3 lifts waiting over 5 min, worker last seen 12 min ago", then "Catchline recovered: recovered: queue moving, worker back". `ops-alert` runs with `verify_jwt` on and requires role `service_role` (Vault holds the legacy service-role JWT, which the gateway accepts). Without the Vault secrets the check changes nothing and returns null. Proven by `supabase/tests/ops_health_test.sql` (27), `deno test supabase/functions/ops-alert` (8), `worker/tests/test_heartbeat.py` (3).

Deploy, in this order (worker first, or the first check alerts "no worker heartbeat yet"):
```sh
# 1. Worker with heartbeats: the "Update after a merge" block under "Mini worker" above.
# 2. Migration 0008 (pushes every pending migration; check the list first)
supabase migration list --linked
supabase db push --linked
# 3. Recipients (comma-separated profile ids; never in the repo) + the function
supabase secrets set OPS_ALERT_USER_IDS=<owner profile id> --project-ref slowxjhvrdswdabjfydk
supabase functions deploy ops-alert --project-ref slowxjhvrdswdabjfydk --use-api
# 4. Check: the job exists, a heartbeat landed, the check returns health and no changes
#    select jobname, schedule from cron.job where jobname = 'catchline-health';
#    select * from public.worker_heartbeats;
#    select public.ops_health_check();
```
The owner's profile needs a `push_token` (the app writes it once notifications are allowed). Caveat: the worker beats between jobs, so a single analysis longer than 3 minutes raises `worker_silent` (and a recovery right after).

## Known gaps (not built here)
- **Face blur.** Bystanders are blurred from pose boxes and head keypoints are dropped (CV v2). The lifter's face is not yet blurred in exports/coach links (`14-legal-privacy.md` s.9.2); do it before the coach link is public.
- **Coach page.** `get_coach_link` returns the analysis, but keyframe images are private storage paths; the public page needs an edge function that mints signed URLs for a valid token. No page exists yet.
- **Movements.** CV v2 (worker at a8b790c) analyses all six v1 movements; jerk and kipping HSPU are validated on synthetic data only.
- **Claude cue phrasing** (Haiku) is not wired; the cue text is the rules engine's canned text.
- **Push on completion** (Expo push "your analysis is ready") is not wired; Realtime only.
- **Plan gating** of coach links (Pull view-only, Platform full) is not enforced server-side; every user can mint one.
- Abuse: deleting and re-creating an account restarts the free 3.
- Usage gate on the device still uses the client tier; if the webhook is late, `create_lift` can still say `cap_reached` right after a purchase (the app waits up to ~12 s first).
