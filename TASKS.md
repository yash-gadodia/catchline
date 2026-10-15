- [ ] (Claude, build 29, Yash 15-10) Compare with a past lift: pick any earlier lift of the same movement, ghost its bar path aligned at lift-off, side by side (compare is dev-only today, fixtures)
- [ ] (Claude, build 29) Movement picker defaults to "Auto": worker already detects snatch/clean/jerk (cv/detect.py); add gymnastics detection, keep manual override
- [ ] (Claude, build 30) Long video (10 min, 5 sets): find sets on the phone (Apple Vision body pose at low fps or bar motion), upload each set as its own lift; `detectSets` in src/features/capture/sets.ts is a stub today; Supabase Free caps uploads at 50 MB
- [ ] (Yash decision) Speed: today upload 3-11 s, analysis 41-66 s idle (262 s when the Mini is busy). Options: pose on fewer/smaller frames (2-3x), GPU worker on Modal (5-10x, parallel), pose on the phone with Apple Vision (seconds, no video upload)
- Note (15-10): camera angle. Measurements need true side-on (camera at 90 deg to the bar); at 45 deg forward/back bar drift shows ~30% smaller and plates hide the bar. The "~43 deg off side-on" warnings on Yash's cleans were correct (filmed front three-quarter), not an angle-estimator bug.
# Catchline: first slice

Goal: the Analysis flow running in the iOS simulator on real measurements from one of Yash's own lifts. Branch `catchline`. Parallax is preserved at tag `parallax-final` and branch `archive/parallax`.

Design source: `~/dev/liftcheck-research/design/` (Claude Design export; `Catchline Design System.dc.html`, `Catchline 04 Analysis.dc.html`, `exports/04-analysis/*.png`). Research: `~/dev/liftcheck-research/SYNTHESIS.md`.

## Track A: UI slice (app)
- [x] Strip Parallax product screens/features from the branch; keep auth, RevenueCat wiring, EAS/OTA config, shared infra
- [x] Strobe tokens (colours, type scale, radii, spacing) + fonts (Big Shoulders Display, Schibsted Grotesk, Sometype Mono)
- [x] Analysis JSON contract (`src/analysis/types.ts`) shared with the CV spike
- [x] Processing sheet (in progress, long wait, done)
- [x] Result reveal (strobe pops, path draw, dimension line, cue type-in, haptics, Reduce Motion)
- [x] Cue screen + "why this" drawer
- [x] Player (4:5 stage, path overlay, phase chips, scrubber with phase ticks, jog wheel, speed, overlay toggles)
- [x] Compare (ghost, side by side), low confidence, why did I miss
- [x] typecheck + tests green; simulator screenshots of every state vs design

### Track A notes (11 Oct)
- Run it: `npm run ios` builds the debug app (`expo run:ios`); Expo Go cannot run this repo (reanimated 4.5 / worklets 0.10 vs Expo Go SDK 56's 4.3.1 / 0.8.3, pre-existing). The dev entry at `/` opens every state; deep links work too, e.g. `catchline://analysis/player?frame=446`, `catchline://analysis/cue?fixture=snatch-mock-low`.
- Fixtures: `src/analysis/fixtures/snatch-mock.json` (bar-end trace measured by eye on the 7 real frames, so the path sits on the far plate). Low-confidence, miss and compare targets are derived in `fixtures/index.ts`. To load the CV output, drop `snatch-real.json` next to it and add one line to `ANALYSES`; `parseAnalysis` rejects pixel (non-normalised) traces.
- v1 "video" is the keyframe image sequence (`asset:` ids in `KeyFrame.image`, resolved by `src/analysis/frames.ts`; any other string is used as a uri). `Stage` is the seam for a real expo-video surface.
- Join note: `snatch-real.json` parses, but its `KeyFrame.image` values are repo-relative paths (`assets/analysis/snatch-real/r1-1-setup.jpg`), which RN cannot load as a uri. Register them in `src/analysis/frames.ts` (bundled `require`s, keyed as `asset:snatch-real/r1-1-setup`) and emit those ids, then add the fixture to `ANALYSES`.
- Contract unchanged. Assumption the CV side should match: `pxPerCm` is in the same pixel space as `video.width`, and the lifter faces +x (signed compare deltas use it).
- Not built: 4c landscape (app is portrait-locked), 4e skeleton, 4f overflow sheet, 4g move markers, 5c compare empty, 7 gymnastics result (needs a bar MU fixture + hip trace). `···` is inert.
- Left for later: `supabase/` migrations, `src/types/db.ts`, auth UI screens (login/callback) were removed with the product; `authActions`/`useSession` remain.

## Track B: CV spike (runs on the Mini)
- [x] `cv/` pipeline: RTMPose (Apache) + plate tracking (no Ultralytics/AGPL) on a real clip
- [x] Phase segmentation + metrics + rule for "hips rise early" / bar drift
- [x] Emits the Analysis JSON contract
- [x] Run on Yash's snatch clip; output committed as a fixture the UI loads (cee8b2f)

## Join
- [x] UI renders the spike's real JSON for Yash's snatch (dev entry "Real CV · cue")

## Integration (catchline-integrate)
- [x] Identity: display name Catchline, scheme `catchline`, Catchline permission copy; bundle id, package, slug, EAS projectId and updates URL unchanged (same App Store record). Parallax widget target + live-activity module removed; Parallax docs in `docs/archive/parallax/`
- [x] Monogram "C" (from `~/dev/liftcheck-research/brand/`): app icon, Android adaptive foreground, splash mark on black, web favicon; `src/components/Mark` (static + launch draw after the native splash, Reduce Motion aware). Flare is now signal red `#FF1F3D` (light `#D90F2D`)
- [x] One data source: Supabase via `src/lib/api` when `EXPO_PUBLIC_SUPABASE_*` is set, local fixtures otherwise (`src/data/`)
- [x] Analyse → paywall gate → consent → createLift + TUS → live processing → reveal/cue on the real Analysis; failure and cap routes; usage recorded; `routeAfterAnalysis()` on leaving the cue
- [x] Founding seats counter: `founding_seats()` RPC (0004, live on hosted); the app reads it when the backend is on, stub in fixture mode (0b4f4dc)
- [ ] Settings stay on-device (no settings table); usage gate reads the local counter, the server cap is authoritative and a `cap_reached` from `create_lift` opens the paywall
- [ ] Trim and rep choice are not sent to the backend (the worker analyses the whole clip)
- Notes: local smoke needs `enable_anonymous_sign_ins = true` (in `supabase/config.toml`; restart the stack after changing it) and the worker running (`uv run python -m catchline_worker`). The app reaches the Mini at `http://yash-mac-mini:55421` (Tailscale) through `.env.local`.

## Goal: a fully working Catchline 3.0 on TestFlight (11-10-2026)
- [x] Integration (merged): real flow capture → paywall gate → upload → processing → cue; rename to Catchline; signal red #FF1F3D; C monogram icon + launch animation (agent, worktree parallax-integrate)
- [x] Hosted backend: Parallax Supabase project slowxjhvrdswdabjfydk wiped and reset to Catchline (Singapore); 109/109 pgTAP; anonymous auth
- [x] Worker: always-on launchd service on the Mac Mini against the hosted project (Modal later)
- [x] CV v2 (merged a8b790c, live on the Mini worker): clean, jerk, kipping pull-up, bar muscle-up, kipping HSPU; bystander blur (agent, worktree parallax-cv2)
- [x] ASC: version 3.0 created; name "Catchline: Lift Form Check" (en-GB)
- [x] ASC: Catchline subscription group + Hook/Pull/Platform (+ trial variants) + Founding lifetime (review screenshots still needed)
- [x] RevenueCat: project renamed Catchline; entitlements hook/pull/platform/founding
- [x] RevenueCat: 9 products imported and attached; offerings `default` (7 Catchline packages) and `ad_trial` (2 trial packages)
- [x] Clip compression before upload (50 MB free-plan cap): 58 MB → 12.4 MB, fps kept
- [x] Mobbin P0 polish merged (29d3219)
- [x] app.json version 3.0 (done 6c1d236); build 21 VALID in TestFlight 2026-10-11; EAS env vars; `eas build -p ios --profile production` + submit to TestFlight
- [ ] Smoke test on Yash's phone via TestFlight: onboarding → film/import → real cue
- [x] 14-10 evening, build 25 (EAS 61179849, submitted): post-purchase upload fix (6bd2a75), Sign in with Apple + anon→Apple transfer (0006, live in prod), `sync-plan` edge function (deployed), no sample/fixture reachable in release, Catchline legal pages on GitHub Pages (source: `catchline` /docs), ASC copy/URLs/review notes/categories applied via API
- [ ] (Yash) Log in to App Store Connect in Chrome so App Privacy labels can be filled (no API); confirm age rating 4+ saved; confirm support address pirsquare.yash+catchline@gmail.com
- [ ] (Dani/Yash, 14-10) Rethink the "one cue" flow: keep one headline cue (the biggest fault) but show the other detected faults under it; users are fine with several cues. Needs the worker to return ranked faults, then a result screen revision
- Note (14-10): the account transfer (0006) moves rows, never storage objects; keyframes stay under the old user folder, so bucket policies key on the lift (0007), not on `foldername[1] = auth.uid()`. Any new bucket must follow that.
- [x] IAP review screenshot + six 6.9" store screenshots uploaded via asc_replace.py (14-10 evening); App Privacy labels published (6 types, App Functionality, linked, no tracking); categories Health & Fitness / Sports; age rating 4+
 → `asc_replace.py --only iaps,subscriptions --iap-review-screenshot`; new 6.9" store screenshots (ghost cutouts + real screens; drop "You vs your best")
- [x] Push when a lift finishes: worker POSTs to the Expo push API on done / failed (`worker/catchline_worker/push.py`, payload is title + body + `{ liftId }`, never media); "Notify me" awaits the token write; a tapped push opens the reveal or the failure screen (`routeForLift`). pgTAP proves `push_token` is owner-scoped. APNs key already on EAS (key `5KKY3JZJ3T`, team `P6QG53Y747`). Not yet proven on a real phone.
- Note: `eas credentials` has no read-only or `--non-interactive` mode. Inspect iOS push keys without touching them via the Expo GraphQL API (`api.expo.dev/graphql`, header `expo-session` from `~/.expo/state.json`, query `app.byId(appId).iosAppCredentials { pushKey { keyIdentifier } }`).
- [x] Purchases reach the server: RevenueCat app user id = Supabase user id; `revenuecat-webhook` (live) sets `profiles.plan` via `apply_plan`; app waits for the server plan after purchase/restore (ad93d8a, 9e36aa4, 9a023b6). Proven on hosted with a synthetic INITIAL_PURCHASE/EXPIRATION
- [x] (Yash) RevenueCat webhook created 14-10, test event answered 200 (TEST events are ignored by design, so revenuecat_events stays empty until a real purchase)
- [x] `sync-plan` edge function (live 14-10, secret `REVENUECAT_SECRET_KEY`): the app syncs the plan from RevenueCat when the webhook is missed or slow (after purchase/restore, on launch when RevenueCat ranks above the server, and on `cap_reached` for a paid lifter with one retry); a purchase the Apple ID already holds (RevenueCat code 6) becomes a restore. The owner's 04:42 sandbox purchase (before the webhook existed) lands on his next app open. Supabase Management API logs endpoint answered "Backend error" for every query on 14-10, so webhook deliveries could not be read from logs; `revenuecat_events` was still empty at 11:15 UTC.
- [ ] Founding refunds do not revoke the seat or plan (founding is permanent in `apply_plan`); consumable 10-packs not wired

## Polish pass (catchline-polish, 11 Oct)
- [x] Mobbin P0 + S-effort P1 (27-mobbin-fitness, 28-mobbin-polish): baseline sentence, sample lift, last-free heads-up, chip fades, player toggles low, signed compare deltas, Lifts headline number, Trends recap + cue markers, small-text contrast
- [ ] (Claude) Deferred, capture path owned elsewhere: import rep filmstrip (27 #3, 28 #32), capture failure wrong/right frames (27 #4), upload first-frame backdrop (28 #4, needs a clip thumbnail), Import `Cancel` underline (28 #33)
- [ ] (Dani) Design-led: cue check before reveal (27 #7), coach-link disclosure + flags (27 #9), merge the tier table into the paywall sheet (27 #10; plans + founding are already one sheet), low-confidence copy template (28 #23, CV copy)
- Note: `userInterfaceStyle: dark` needs a native rebuild before the photo picker turns dark. Never run `npx prettier` here: there is no config and it rewrites whole files.
- [x] Compress before upload (Free plan 50 MB cap): local Expo module `modules/clip-transcoder` (AVAssetReader/Writer on iOS, Media3 Transformer on Android) applies the trim, H.264, 1080 px long edge, source fps kept (240 → 120), no audio, 8/10/12 Mbps by fps, re-encode or "Too long to send" over 45 MB. Sim: 58.4 MB ref → 12.4 MB, 364/364 frames at 29.97 fps, hosted lift `done`. Android not compiled yet (no SDK on laptop or Mini).
- [ ] (Claude) Send the chosen rep to the backend: `create_lift` only takes movement + load; the trim is baked into the uploaded clip.
- [ ] (Claude) Simulator encoder overshoots the bitrate on synthetic high-motion clips (12 Mbps target → 17.7 Mbps); check on a real phone and add `AVVideoDataRateLimitsKey` if real clips overshoot too.

## Movement check (14 Oct)
- [x] Prod: a clean uploaded with the selector left on snatch got a snatch analysis. The CV now reads the lift from where the bar was received (`cv/catchline_cv/detect.py`, README "Movement detection"); the worker runs the detected rule set at confidence ≥ 0.8 and records `movementUsed` (`movement` stays the lifter's choice, `detectedMovement` the read); the reveal screen says "Looks like a clean, not a snatch. Analysed as a clean." (or "Keep as snatch?" when weak). Real clips: 2 bot snatches + the reference snatch 0.9, 3 cleans 0.9, the front-on presses jerk 0.7, 3 hanging clips unknown.
- [x] Import/share/capture routes now wait for the capture store to hydrate before reading `movement`; before, the picker could open on the default (snatch) while the saved lift was still loading.
- [ ] (Claude) `complete_lift_job` keys the cue memory on `lifts.movement` (the choice), so a switched analysis files its cue under the chosen lift; a follow-up migration should prefer `p_analysis->>'movementUsed'`.
- [ ] (Claude) No clean or jerk clip in `~/.catchline-bot/clips` yet; the clean reads come from the 45° Photos clips on the Mini and the only "jerk" is a front-on press set. Film a side-on clean and jerk to pin the rack and dip thresholds.
- Note: pose heights in torsos (shoulder to hip joint centres): a snatch lockout reads 0.78-0.88 (the wrist point sits below the hand), a front rack 0.10-0.26, so the lockout cut is 0.5 (sure at 0.7) and the rack 0.35 (sure at 0.3). A bar muscle-up reads rack-then-overhead like a jerk; the feet rising > 0.4 torsos tells them apart.
- Note: on the Mini `cat` is aliased to `bat` (pipe through `/bin/cat -v`), and a script run from outside the synced `cv/` dir imports the venv's editable `~/catchline-cv2/cv` instead (run from inside the dir, or set PYTHONPATH).

## Scale vs encoding (catchline-scale, 11 Oct)
- [x] Root cause for FF600EFA (orig 3.53 px/cm + jump_forward vs re-encode 2.96 + no cue): the plate ellipse was stable (210x220 px on every encoding); the side-on depth ratio (wrist rise / plate rise) was a slope anchored at the lift-off sample (far wrist guessed behind the plate) over a plate track quantised to 0.05-diameter (~11 px) grid steps, so it read 0.75-0.89 by encoding; jump forward compared two single frames while the catch frame moved +-2 frames with the feet still travelling; analysis windows began one frame late on iPhone 600-timescale files. Fixed in f92b0c6, 197e8a5, 23c5f0a: FF600EFA orig / under50 / 1080x1920 ffmpeg / avconvert now 3.39-3.51 px/cm, jump_forward on all four.
- [ ] (Claude) Not fixed: on the app's real format (608x1080, HLG tone-mapped to Rec.709) the eval set still drifts (same cue 18/27, pxPerCm within 5% 15/30). Causes: `plate_mask` uses a fixed `V < 75` and tone mapping darkens frames ~20%, so plates sit either side of the cut (21B27BAF plate 241 vs 402 px); and the scale method flips between parallax and near-plate-only when the track survives or not (20-40% jumps). An exposure-relative cut (0.5 x median V) helped some clips and broke others (tried, reverted). Needs a colour-invariant plate detector, and the eval should run on app-format clips. FF600EFA on app format: scale stable (+0.5%) but bar_forward_off_hips 8.9 -> 12.3 cm, so its cue changes.
- Note: Theil-Sen on the depth ratio reads ~16% lower than least squares (0.72 vs 0.86 on FF600EFA), the same size as the known "scale ~15% high on floor cameras". Worth checking against a measured clip.
- Note: the app uploads 1080 px on the LONG edge (608x1080 portrait), below the CV's 1280 px inference height, and tone-mapped to Rec.709. Test re-encodes must match that (avconvert Preset1920x1080 then ffmpeg scale; ffmpeg on the Mini has no zscale/tonemap).

## From Huilong's feedback (12-10-2026, ~/dev/liftcheck-research/29-huilong-feedback.md)
- [ ] (Claude) Root cause as the headline of the result; the cue comes second
- [ ] (Claude) Cue side effects: after a cue, flag a NEW fault on the next lifts; after N misses rotate the cue wording, then switch to a drill
- [ ] (Claude) Trends finds cross-session patterns (fault vs load %, drift vs load, recurring faults), not only recaps
- [ ] (Claude) Soft mobility hint once a fault survives the cue over several sessions ("may be mobility, not technique", prep drills, ask a coach; never diagnose)
- [ ] (Dani) Onboarding asks experience + "do you have a coach"; output adapts by level (copy + design)
## Release-build fixture sweep (14 Oct)
Rule now enforced by tests: a release build never shows fixture or sample content as the lifter's own data, and no dev route is reachable. `getAnalysis()` with no id resolves only in `__DEV__`; result routes without an id show the missing state and processing goes home; Review/Trim/Share with no draft go to `/capture`; `?demo` links, `/dev`, `/paywall/dev` and `/analysis/compare` are dev-build only. Tests flip `(global as unknown as { __DEV__: boolean }).__DEV__` to cover the release branch.
- [ ] (Claude) Compare needs real targets (the lifter's own best / last session for that movement, fetched by lift id) and the 5c empty state before it comes back in release; today `COMPARE_TARGETS` are fixture variants of the demo snatch.
- [ ] (Dani) Paywall / cap copy promises a queue ("Not now, keep it queued", "Your queued snatch is first in line") that does not exist: the draft stays on Review (in memory only; `useCapture` does not persist it, so a relaunch loses it) and nothing uploads later. Either persist the draft and build the queue, or reword.
- [ ] (Claude) A release build with `EXPO_PUBLIC_SUPABASE_URL` unset silently runs on the fixture stores (`backendEnabled()` false): seeded library, fixture analyse. Fail loudly at startup instead.
- [ ] (Claude) `/analysis/processing?live=1&lift=<id>` follows a lift from the library after a relaunch, but a stale failed job still in memory would route it to that job's failure. Clear the job when its lift is done or failed.
- Why-this sheet: a Close button was added (the scrim behind a tall sheet was the only way out). The scrim press itself passes in the render test, so the bot's "cannot dismiss" was not reproduced as a logic bug; most likely the sheet covered the scrim on a small screen.
- Session storage is AsyncStorage (`src/lib/supabase.ts`), not Keychain: deleting the app deletes the anonymous session, so a reinstall is a fresh anonymous user.

## Cues and Trends on real data (14 Oct, worktree branch off catchline)
Build 26: Cues crashed and Trends was empty on a real account. Root cause: the CV writes measurement ids equal to its fault ids (`jump_forward`, `hips_rise_early`, `bar_forward_off_hips`, plus `catch_depth`, `turnover_time`, `bar_peak_height`) and a `cues` row's `fault_id` is the cue's metric, but `METRICS` only knew the design-era ids (`bar_drift_hip`, `pull_time`...), so `METRICS[cue.metricId].caption` threw and every Trends series was empty. Rules now:
- `metricFor(id)` never throws (label from the id, cm, lower is better); `measuredMetrics()` / `measuredMovements()` drive the Trends chips and switcher from the data the account actually has. Add a `METRICS` entry when the CV learns a fault (cv/catchline_cv/rules.py FAULTS + lifts.py LABELS).
- The library store boots **empty** with `synced=false` when Supabase is configured (never the design fixtures); `syncLibrary()` flips `synced`. Jest sets the Supabase env, so a test that wants the fixtures must call `loadLibrary('seeded')` in `beforeEach`.
- A cue's session count is the server's `cues.sessions` (`sessionsDone`), not a local count; cue outcomes write through `updateCue()` and a rejected write re-syncs.
- RN's jest `RefreshControl` mock drops its props: test pull-to-refresh with `container.queryAll(i => i.type === 'RCTRefreshControl')` + `fireEvent(el, 'refresh')`.
- `npm install` must run **after** the worktree is on the right commit; an install at an old commit leaves `expo-file-system` and the fonts missing (jest "Super expression must either be null", export "Unable to resolve @expo-google-fonts").
- [ ] (Claude) `PRIMARY_METRIC` / `COMPARE_IDS` / `baselineSentence` still use the design ids, so the Lifts row headline and the cue-screen baseline sentence fall back to the cue caption on real data. Point them at the CV ids per movement.
- [ ] (Yash) Every prod cue today is `jump_forward`; see the CV note in the Cues/Trends report before deciding whether `choose_cue` needs a threshold change.

## Worker speed (14 Oct, worktree branch off catchline)
- Profile of a 364-frame app-format clip on the Mini: 77 s, of which YOLOX-m 39 s + RTMPose-m 28 s (88%, 5-9 people per gym frame, all needed for the blur), plates 4.5 s, keyframes 1.9 s, decode < 1 s. Download and the 7 keyframe uploads are < 2 s per job (worker log timestamps). 4K originals decode 10x slower but the app never sends them.
- Landed, all bit-identical on the 10 reference goldens (`cv/tests/test_golden.py`): ORT `session.intra_op.allow_spinning=0` (1.11x in a per-frame interleaved A/B on the loaded Mini), keyframe seeks in a thread pool, `ellipse_search` vectorised over ratios, `_refine` opening on a padded crop. Mini A/B on FF600EFA-app608: 75.2/73.2 s -> 64.4/61.7 s.
- Rejected because they change numbers: CoreML EP (MLProgram, 2x faster, keypoints move up to 8.7 px; the default CoreML format fails on YOLOX's NMS node), other ORT thread counts / EXTENDED optimisation (kernel choice changes keypoints by 0.4-8.7 px), batched RTMPose (slower and 5e-6 drift), videotoolbox decode (identical on sequential decode, but a `-ss` seek on the 1080p H.264 app clip returned a different frame), rawvideo keyframes instead of PNG (max diff 4).
- The Mini itself: Spotlight (`mds_stores`, `mds`, `corespotlightd`, 8+ `mdworker_shared`) has averaged ~35% CPU for 3 days, plus `mediaanalysisd`, the OpenClaw gateway and the colima VM (7.9 GB); load average 50-60 on 10 cores while the 128-142 s jobs ran. (Yash) exclude `~/catchline-worker/tmp`, `~/.openclaw`, colima and the runner dirs from Spotlight, or `mdutil -i off` the data volume, before buying any more CPU.
- `ssh mini '<cmd>'` is a zsh function that always exits 0 (SetProfile echo); use `command ssh mini` in until-loops.

## Sign in with Apple (14 Oct, worktree branch off catchline)

- [x] Native Sign in with Apple (nonce, id-token) + anonymous -> Apple transfer (0006) + onboarding account step + You tab sign in/out (Claude)
- [ ] (Yash) `supabase db push` 0006 to the hosted project; new dev build (expo-crypto is a new native module)
- [ ] (Claude) Apple token revocation on account deletion: Apple requires apps using Sign in with Apple to call the revoke endpoint when the user deletes their account; `supabase/functions/delete-account` does not do it yet (needs the Apple services key / client secret)
- [ ] (Claude) Orphaned anonymous auth users after a transfer are never deleted (harmless, but they accumulate; Supabase's anonymous-user cleanup query or a cron)
- [ ] (Claude) After a transfer the local usage store keeps the phone's count; the server's merged counter is what enforces the cap, so only the "N of 3 videos left" label can drift until the next launch

### TestFlight journey audit (14 Oct evening, build 25 code)

- [x] Pay once on a fresh install: RevenueCat `logIn` never moves a receipt, so a lifter who paid as anonymous and reinstalled saw the paywall again. After the Apple session the app logs RevenueCat in, restores once while the tier is still free, then adopts the server plan when it ranks above RevenueCat (`adoptServerPlan`), 3c92799
- [x] Leaving a live result (Hide, Notify me, Not for me, Film another set) went `router.back()` to the Review of the clip already sent, inviting a second upload; now `dismissTo('/')` (Lifts tab), c48dcca. Same commit: a paid lifter the server still caps after the sync retry gets `/paywall/cap`, not `/paywall`; coming back to the foreground resubscribes to the lift (Realtime can drop in the background)
- [x] A server-queued lift (uploaded, worker not yet on it) showed the library's "Unlock" row and opened the paywall, 5425479
- [x] Sign out left RevenueCat logged in as the Apple user, so its next customer-info refresh handed the paid plan back to the anonymous account, d8f1074
- [ ] (Dani) An anonymous lifter upgrading from build 24 never sees the account step: `completed` is already true so the tabs never redirect to onboarding; Sign in with Apple is only on the You tab. Decide whether to surface it once (e.g. a one-time prompt from the Lifts tab)
- [ ] (Yash, device) `restorePurchases` runs silently after every Apple sign-in whose RevenueCat tier is free. If an App Store / sandbox login prompt appears right after the Apple sheet, switch `settlePlanAfterSignIn` to `Purchases.syncPurchases()` (never prompts)
- [ ] (Claude) You tab sign-out has no catch: an offline `auth.signOut()` rejects unhandled (busy flag still resets). Show the app's own error copy
- Gotchas: RNTL v14 `unmount()` is async; an un-awaited one leaks an act() into the next test ("overlapping act() calls") and every later render in the file fails. The RN jest preset stubs `AppState.addEventListener` with a bare `jest.fn()` (returns undefined, so `.remove()` throws on cleanup); `jest-setup.ts` now gives it a subscription

## Build 28 (15 Oct, worktree branch off catchline)

- [x] One plan: the paywall offers Pull (Monthly / Annual toggle, annual preselected, "save X%" from the store's own Pull prices) plus the Founding seat. Hook and Platform are gone from the paywall, plans table, cap sheet and dev menu; the upgrade sheet and `/paywall/upgrade` are deleted. A Pull or founding lifter at the cap sees "You've used your 40 this month" and the reset date, no upgrade. Free stays 3 for life; the ad trial is unchanged
- [ ] (Yash) RevenueCat's `default` offering still holds the `hook_*` and `platform_*` packages. The app now ignores them (it only reads `pull_monthly`, `pull_annual`, `founding`), so nothing breaks; remove them from the offering when convenient. Product ids, entitlements and `tierFromEntitlements` stay so a Hook or Platform receipt (none exist) still resolves
