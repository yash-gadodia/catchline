# Catchline coach tier v1: design plan

## 0. What the code says today

- **Lift identity and storage.** One uuid per lift names `Documents/lifts/<id>/` with `analysis.json`, `body.json`, `clip.mp4`, `stills/` (`src/data/localLifts.ts`). Only a slim row syncs, through `sync_lift` (`supabase/migrations/0019_sync_lift.sql`).
- **One upload path exists.** "Send this clip" on a failed lift goes by TUS into the private `shared-clips` bucket: owner-insert only, service-role read, 30-day purge (`0021_shared_clips.sql`, `src/lib/api/sharedClips.ts`).
- **Coach review UI is mostly built.** `src/features/analysis/TrackerScreen.tsx` and `CompareScreen.tsx` take a `clipUri` plus `analysis` and `body`, and `DrawLayer.tsx` draws lines and angles in video coordinates.
- **An older coach link is still in the schema.** `coach_links` is a per-lift token link (`0001_catchline_core.sql`, `0016_coach_feedback_limits.sql`, `src/lib/api/coach.ts`). Leave it alone.
- **Auth.** Accounts start anonymous (`src/lib/api/account.ts`); Sign in with Apple transfers the rows (`src/features/auth/appleSignIn.ts`, `0006`). `referral_signed_in_user()` in `0025_referrals.sql` already refuses anonymous callers.
- **Billing.** The tier comes from RevenueCat entitlements (`src/features/paywall/entitlements.ts`), the webhook writes `profiles.plan` (`supabase/functions/revenuecat-webhook/plan.ts`), and `supabase/functions/referral-rewards/index.ts` already grants promotional `pull` time by REST.
- **Release.** Runtime version is the app version (`app.json`), the store build is 4.0.6 build 51 (`scripts/store-build.json`), and `scripts/check-native-surface.ts` blocks native drift in an OTA.
- **No microphone.** `microphonePermission` is `false` in `app.json` and there is no audio package in `package.json`.
- **Supabase plan.** `src/features/capture/compress.ts` says "Supabase Free caps one upload at 50 MB", so the project looks to be on the Free plan.

## 1. Product definition

**Coach jobs:**
1. See what my remote lifters did without chasing WhatsApp videos.
2. Scrub a lift frame by frame with bar path and joints.
3. Mark it up and send one correction.
4. Compare it with their earlier lift.

**Coach flow** (Sign in with Apple required):
- You tab → "Coach" → paywall → Roster tab (third tab).
- Roster: athletes, unseen count, "Invite athlete" (code and link, reusing the `app/invite/[code].tsx` pattern).
- Athlete screen: shared lifts, newest first.
- Lift screen: the existing tracker on the downloaded clip, then "Comment": pause on a frame, draw with `DrawLayer`, type a note, send.
- "Compare" opens `CompareScreen` on two shared lifts of that athlete.

**Athlete flow:**
- Open the invite link → consent screen: "Coach X will see only the lifts you send. Sending uploads that video."
- Tracker and Lifts row gain "Send to coach" (per lift, with upload progress).
- A sent lift shows a "Shared" mark, "Unsend", and the coach's comments drawn on their frame.
- You → "My coach": Pro included, "Leave coach" (deletes every shared file).

**Left out of v1:** voice-over, web dashboard, auto-share-all, chat, programming, groups, multiple coaches per athlete, Android coach, public links, push notifications.

## 2. What gets shared

| Option | For | Against |
|---|---|---|
| (a) Rendered overlay video | Plays anywhere | Needs a render per share at about 12 Mbps (`TrackRenderer.swift:428`); the coach cannot toggle overlays, measure or compare |
| (b) `clip.mp4`, `analysis.json`, `body.json` | Reuses the tracker, draw layer and compare screen unchanged; smallest build | Raw video on the server; the largest privacy change |
| (c) Analysis only | Keeps the promise intact | Coaches coach from video; not worth $20 |

**Recommend (b).** It uploads files that already exist, and the coach gets the full player the athlete has. Upload `clip.mp4` as it is: a re-encode would be JS-only through `Transcoder.transcode`, but path coordinates against a resized clip are unverified.

**Cost (all assumptions).**
- Clip: 8 to 10 Mbps for about 8 s, roughly 10 MB.
- Volume: 20 shared lifts a week, about 85 a month, so 0.85 GB uploaded per athlete per month.
- Retention: 30 days, so about 0.85 GB stored.
- Views: the coach downloads each clip once and caches it, so about 0.85 GB egress.
- Supabase Pro prices: $25 a month including 100 GB storage and 250 GB egress, then $0.021 per GB-month and $0.09 per GB.
- Result: about **$0.10 per athlete per month** at overage prices, or about $1 against $17 net on a 10-seat plan. Nothing marginal for roughly the first 100 athletes.
- The real cost is the fixed $25 a month: Free (assumed 1 GB storage, 5 GB egress) cannot carry even one full roster.

## 3. Migration outline: `0026_coach_tier.sql`

0024 is absent on this branch; confirm no other worktree holds 0024 to 0026 before numbering. Additive only, `create ... if not exists`, RLS on with no table policies, access through security-definer RPCs with `set search_path = ''` and revoke-then-grant, as in 0025.

**Tables**
- `coach_plans (coach_id pk → auth.users cascade, seats int, status text check in ('active','grace','expired'), product_id, expires_at, updated_at)`. Service-role writes only.
- `coach_invites (code pk check ~ '^[A-Z0-9]{6,10}$', coach_id, created_at, revoked_at)`.
- `coach_athletes (id, coach_id, athlete_id, status check in ('active','paused','ended'), consent_at, consent_version, created_at, ended_at)`, with a unique index on `athlete_id` where `status <> 'ended'` and `check (coach_id <> athlete_id)`.
- `lift_shares (lift_id pk → lifts cascade, athlete_id, coach_id, link_id → coach_athletes cascade, bytes, shared_at, seen_at, revoked_at)`.
- `lift_comments (id, lift_id → lift_shares cascade, author_id, frame int, shapes jsonb with a size cap, body text ≤ 2000, created_at)`.

**RPCs** (authenticated, non-anonymous)
- Coach: `coach_make_invite`, `coach_roster`, `coach_remove_athlete`, `coach_mark_seen`.
- Athlete: `coach_preview_invite`, `coach_accept_invite` (checks seats under `for update`), `coach_leave`, `share_lift`, `unshare_lift`.
- Both: `lift_comments_for`, `add_lift_comment`.
- Service role: `apply_coach_plan`.

**Bucket `coach-shares`**: private, 50 MB limit, `video/mp4`, `application/json`; path `<athlete_id>/<lift_id>/<file>`.
- Insert: own folder, and an unrevoked `lift_shares` row exists for that lift.
- Select: the owner, or `public.can_read_share(name)` (security definer: the caller is the coach on an active link with an unrevoked share and an active plan).
- No client delete. `purge_coach_shares()` copies the `purge_shared_clips` pattern (pg_net to the storage API, logged in `clip_deletions`, hourly cron). It removes files older than 30 days, revoked shares, ended links, and files whose owner is gone.

**Deletion and realtime**
- Extend `delete_my_account()` and `supabase/functions/delete-account/index.ts` to empty the `coach-shares` folder.
- Add `lift_comments` and `lift_shares` to `supabase_realtime`.

## 4. Billing

**Products.** Four auto-renewables in the existing `Catchline` group, ranked above Platform:
- `catchline_coach10_monthly` at $19.99 and `catchline_coach10_annual` at $199.
- `catchline_coach30_monthly` at $39.99 and `catchline_coach30_annual` at $399.

One group means Pro to Coach is an upgrade with Apple's refund of unused time, and 10 to 30 is a crossgrade.

**RevenueCat.**
- New entitlement `coach`, with the coach products also attached to `pull`.
- New offering `coach`.
- Seat count is derived server-side from the product id in `plan.ts` and written by `apply_coach_plan`. Never trust the client for seats.

**Athlete Pro.**
- Grant promotional time on a new entitlement `coached`, mapped to Pro in `tierFromEntitlements` and `plan.ts`.
- Do not grant on `pull`: that would collide with the banked referral time capped in `referral-rewards/handler.ts`.
- Grant 35 days on accept and re-grant on each coach `RENEWAL`.
- An athlete who already pays keeps their subscription; tell them they can cancel it.

**Coach cancels.**
- Everything works to period end.
- On `EXPIRATION`: the plan becomes `expired`, links go `paused`, `can_read_share` turns false, `coached` lapses within 35 days, and files purge after 30 days.
- Resubscribing restores the roster.
- Downgrade over seats: no new accepts and seven days to choose, then the newest links pause.

**App Store rules** (from memory; check the current text before submitting).
- Seat tiers as service levels in one group are standard under 3.1.2.
- A purchaser's subscription unlocking access for other accounts is the family-plan pattern and must go through in-app purchase for individuals (3.1.1).
- 3.1.3(c) may later allow invoicing clubs directly.
- 1.2 on user content needs block and report: "Leave coach" and the existing `app/report.tsx`.
- New paid functionality should be reviewed in a binary, not first appear by OTA.

## 5. JavaScript-only versus store build

**JS-only (OTA on 4.0.6):**
- Migration and edge functions.
- Invite, roster, share upload (`src/lib/api/tus.ts`), download to cache.
- Tracker, compare and draw on shared lifts; text and drawing comments.
- Coach paywall through RevenueCat offerings, and entitlement mapping.

**Store build:**
- Voice-over (mic permission plus an audio module).
- Remote push for "coach commented": `src/features/notifications/index.ts` fetches an Expo token; I did not verify the APNs entitlement.
- Any change to `app.json` or `modules/`.

**Recommended:** build coach as JS, but ship the paid launch as store build 4.1 so review sees it and the listing changes ride along. That costs one cloud build.

## 6. Staged plan

| Stage | What ships | Effort | Riskiest assumption |
|---|---|---|---|
| Week 0 (no code) | DM 20 coaches, starting from the referral coach codes (`TASKS.md:28`). Their athletes export the overlay video and send it over WhatsApp; you return marked-up screenshots within 24 hours for two weeks. Then ask for $19.99 by payment link for founding coach access. Pass: 5 of 20 pay. | About 10 hours | Coaches pay for review tooling, not just athlete Pro |
| 1. Link and share | Migration 0026, invite and accept, "Send to coach", roster, coach opens the lift in the tracker. Feature-flagged (`feature_flags`), free for pilot coaches. | 4 to 5 days | Athletes actually tap share for most sessions |
| 2. Feedback | Frame-pinned drawing and text comments, unseen counts, realtime, compare | 3 to 4 days | Text plus drawing is enough without voice |
| 3. Billing | Products, `coach` and `coached` entitlements, webhook seats, expiry and downgrade paths, Supabase Pro, privacy changes, build 4.1 | 4 to 5 days | Review accepts the seat grants; promotional grant behaviour on a second entitlement |
| 4. Voice and push | Voice-over, comment push | 3 to 4 days | Worth a native build |

## 7. Privacy and listing

**New wording:** "Your video stays on your iPhone unless you send a lift to your coach." Change it in:
- `docs/catchline/store-listing-4.0.md` (promotional text and description).
- `docs/legal/privacy.html` line 47, plus retention, the coach as recipient, and Supabase as storage processor.
- `src/i18n/en/onboarding.ts`, `src/i18n/en/you.ts`, `src/i18n/en/notifications.ts`.
- The Privacy invariant in `CLAUDE.md`.

**App Privacy label:** add "Photos or Videos" as user content, linked to identity, for app functionality.

**Consent:** log the versioned accept in the existing `consents` table. State plainly that unsend deletes the server copy and the coach's cache at next open, but cannot recall a screen recording.

**Minors:** the policy already says no under-13s and consent confirms 16 or over. Keep that, add it to the coach terms ("do not invite lifters under 16"), and do not build a parental consent flow in v1. This excludes youth clubs. The age threshold for consent varies by country; get it checked before marketing to clubs.

**Deletion:** an athlete deleting their account, leaving, or unsending purges the files; a coach deleting ends the links and purges.

## 8. Critical files for implementation

- `/Users/yash/dev/catchline-wt-referral/supabase/migrations/0025_referrals.sql` and `0021_shared_clips.sql` (conventions to copy into new `0026_coach_tier.sql`)
- `/Users/yash/dev/catchline-wt-referral/supabase/functions/revenuecat-webhook/plan.ts` (and `handler.ts`; `referral-rewards/index.ts` for the grant call)
- `/Users/yash/dev/catchline-wt-referral/src/features/paywall/entitlements.ts` (and `products.ts`, `docs/catchline/PRODUCTS.md`)
- `/Users/yash/dev/catchline-wt-referral/src/lib/api/sharedClips.ts` (pattern for new `src/lib/api/coachShares.ts`; new `src/features/coach/`)
- `/Users/yash/dev/catchline-wt-referral/src/features/analysis/TrackerScreen.tsx` (with `DrawLayer.tsx`, `CompareScreen.tsx`, `app/(tabs)/_layout.tsx`, `supabase/functions/delete-account/index.ts`, `docs/legal/privacy.html`)
