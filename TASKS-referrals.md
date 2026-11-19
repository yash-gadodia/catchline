# Referrals and free tier (feat/referrals, from 4.0.3)

Decided by Yash 15-11-2026: free tier 1 video a week; give a month, get a month when the invited lifter tracks a first lift; 3 friends = +3 months, 10 = +1 year and a badge; 12 months banked at most; Sign in with Apple to claim; coaches get Pro for life and 30% of their lifters' first year, paid outside Apple.

Everything ships as an OTA on the 4.0.3 runtime (no native code). Native end card on the exported video waits for the next store build.

## Backend
- [x] 0025_referrals.sql: codes, referrals, reward ledger, claim RPC, my_referrals RPC, preview RPC for the web page, qualify trigger on the first done lift, coach codes (payouts come from scripts/referrals/coach.py)
- [x] Edge function referral-rewards: grants pending rewards as RevenueCat promotional `pull`, 12-month cap, then applies the plan
- [x] Deno tests for the grant maths; SQL checks against a scratch run
- [x] Apply 0025 to prod, deploy the function (15-11; service-role call returns 200)
- [ ] End-to-end with a real pair of accounts (needs Yash's go: grants real promo time)

## App (OTA)
- [x] FREE_PER_WEEK 3 -> 1, copy and tests
- [x] Invite screen from You: code, share to a friend, share to a gym chat, counter, milestones, badge; Apple sign-in first when anonymous
- [x] Claim: "Got a code from a friend?" on the Invite screen; catchline://invite/CODE prefills it
- [ ] A first-run "Have an invite code?" prompt (not built: a link already opens Invite with the code filled in)
- [ ] Share caption carries the code and link (deferred: the share is a file, iOS drops the text for most targets; the native end card waits for the next store build)
- [x] After a share: "give a friend a free month" prompt, once
- [x] Analytics events: invite_opened, invite_shared, referral_claimed, invite_prompt_tapped (qualified friends are counted in the referrals table, not PostHog)
- [x] Tests, typecheck on the Mini

## Web
- [x] docs/i/index.html on the catchline branch (6b45042, live): code, App Store button, open-in-app link. No inviter name: gitleaks blocks the publishable key in the public repo; referral_preview stays for a later server-side page

## Ops
- [x] scripts/referrals: make a coach code, list coach payouts
- [x] OTA to production (15-11, runtime 4.0.3)

## Growth backlog (saved 16-11-2026, in priority order)

### Share story, 4.0.5 (the GTM: every shared lift is the ad)
Done on feat/referrals: StoryRenderer.swift (9:16, peak bar speed counting up, half-speed replay, path-art end card with the invite code), `story` in the spec, the "9:16 story" chip, tests. A harness render is in ~/dev/liftcheck-research/launch/share-redesign/story-v1-real-render.mp4.
- [ ] (Yash) Watch the render and approve or change the design (number = peak bar speed; end card title = the weight)
- [ ] (Yash) Create the Instagram and TikTok accounts and say the handle; connect them in Blotato
- [ ] (Claude) The handle on the end card and in an auto-copied caption ("Tracked with @handle", #catchline, the code)
- [ ] (Claude) The share screen preview shows the story layout (today it still previews the old lockup and graph)
- [ ] (Claude) Number and mark legibility: they can sit on the lifter's legs and under the bar path; try a shadow or the side away from the lifter
- [ ] (Claude) One-tap Instagram Story, Reels, TikTok and Save buttons (Instagram Stories pasteboard API; needs the Facebook app id in Info.plist), a transparent bar-path sticker for Stories, a 4:5 feed size
- [ ] (Claude) Proud-moment prompt ("your fastest lift at this weight") opening the share screen. A 4.0 lift has no movement, so "fastest snatch" cannot be said honestly: compare by weight, or ask the lift type first (Dani: product call)
- [ ] (Claude) "Founding member #N" on a founding member's end card
- [ ] (Claude) Story render watched in the real app on the simulator (the Mini has a dev client: sim udid in ~/scratch/sim-udid, build in ~/scratch/simbuild)
- [ ] (Claude) Full clip gate (`scripts/eval31/gate.sh --check`, native code changed), version 4.0.5, store build, scripts/store-build.json
- [x] 4.0.5 (build 50) submitted for review 17-11 on Yash's go, manual release, before a phone pass
- [ ] (Yash) Phone pass on TestFlight before releasing 4.0.5: track a clip, share as a story, try the Instagram and TikTok buttons

### After Apple approves 4.0.4 (WAITING_FOR_REVIEW since 15-11, manual release; both custom product pages too)
- [x] 4.0.4 released 17-11
- [ ] (Claude) OTA to runtime 4.0.4: the rating explanation sheet (70fa37d), the founding seat line and "invite 1 friend a month" (4c442a2, 340a7d9). 4.0.3 already has the last two (update group c6167837)
- [ ] (Claude) Read the App Store analytics reports for traffic sources (ONE_TIME_SNAPSHOT f8635a8e, ONGOING 3ca2b793)

### Founding seats
- [ ] (Claude) Raise `catchline_founding_lifetime` from $29.99 to $49.99 in App Store Connect when seat 100 sells (3 sold on 16-11). The paywall already says "N left at this price", so this must happen; automate it or alert at seat 90
- [ ] (Yash) Say "500 founding seats, Pro for life" in the Product Hunt maker comment and the App Store promo text
- [ ] (Claude) PostHog: paywall views to purchases by plan, founding against monthly and annual (one sale so far is not proof)

### Social content engine (after the handle exists)
- [ ] (Claude) One post a day through Blotato from Yash's own lifts rendered as the story; repost tagged lifts with the lifter's permission; no paid ads until a post spreads on its own

### Smaller
- [ ] (Claude) In-app event "Film season" as a draft for late February (no CrossFit or Open wording)
- [ ] (Claude) Coach offer codes in App Store Connect (subscription group 22463932)
- [ ] (Claude) asc_listing.py: set the support, marketing and privacy URLs for a new locale, then commit
- [ ] (Yash) Go for the two-account referral end-to-end test (grants real promo time)
- [ ] (Claude) Home-screen widget; win-back offers (deferred)
- [ ] (Yash) Mini: decide on an external SSD for builds, Docker and worktrees (the disk watchdog only buys headroom)

## First lift is the product (Yash, 17-11-2026)

The first lift after download has to be the "wow". Judge product work by whether a new lifter reaches a tracked bar path fast and finds it impressive. Measured in PostHog project 686264 (dashboard 2365960).

Baseline, 12 to 17 Nov, not filtered for Yash's own devices:
- 58 phones opened the app; 39 of them opened it exactly once.
- 38 accounts started a track, 32 finished one (6 started and never finished).
- Of the 32, 24 got a bar path; 8 tracked lifts and never got one.
- First track took 60 s at the median, 150 s at the 90th percentile.
- 14 did a second lift; 4 lifted on a second day; 7 exported a share; 18 saw the paywall.
- Opens and tracks cannot be joined per person until the identity fix (1b0e946) reaches phones.

Seen walking a fresh install on the simulator (17-11): picking a video is followed by iOS asking for full Photos access; a "Check the plate" confirmation; about a minute of waiting; the result opens on the full player with every control, no reveal; a lift with no bar path still uses the week's one free video (devicePipeline.ts countLift skips only failures).

- [x] (Claude) Identity fix live on 4.0.3, 4.0.4 and 4.0.5 (17-11)
- [x] (submitted 19-11, build 51, WAITING_FOR_REVIEW, manual release) 4.0.6 store build that embeds the current JS. Found 19-11: OTA never reaches a new install's first launch (`fallbackToCacheTimeout: 0`), so the sample lift, the welcome events and the first-lift reminders shipped on 17-11 have zero events. Build 50 (4.0.5) predates them
- [ ] (Yash) Feedback ask (19-11, live on runtime 4.0.5 only, update 554dc4af): open the app twice on 4.0.5 and confirm the "How is Catchline working for you?" sheet. Not seen on a simulator (the Mini's disk guard wipes the build folder)
- [ ] (Claude, after that) Feedback ask to runtimes 4.0.3, 4.0.4 and 4.0.6 (cherry-pick 1c8de44 f8a2fdb); a Telegram alert on the Mini for each new `problem_reports` row, nothing reads them today
- [ ] (Claude) Store builds on the Mini with `eas build --local`: the Expo free plan allows 15 iOS builds a month and 13 are used (19-11); needs the Mini's disk fixed first (10 GB free)
- [x] 19-11: lift kinds (pick per lift, own kinds, Lifts list "By date / By lift"), Report a problem always opens the form (Intercom unused in JS), made-by line on You. Live on runtimes 4.0.5 (9a804f96) and 4.0.6 (3525e8b5); seen on the Mini simulator except the emoji
- [x] 19-11: store screenshot 5 is the real story of Yash's Ubud snatch (launch/screenshots/4.0.6); 4.0.6 resubmitted with it
- [ ] (Yash) On the phone: the made-by line's heart and flag (the simulator draws no colour emoji in any font, so it showed boxes); the feedback sheet
- [ ] (Claude) Next store build: remove @intercom/intercom-react-native, its config plugin and plugins/withoutIntercomPush from the binary; then drop Intercom from the privacy policy and the App Store privacy answers
- [ ] (Claude) Player says peak 2.50 m/s, the story says 2.65 m/s for the same lift (IMG_1101, 19-11): find which is right and make them agree
- [ ] (Claude) "Check the plate" shows an HDR (HLG) clip blown out on the simulator; check on a phone before treating it as a bug
- [ ] (Claude) You screen: rows scroll under the status bar with nothing behind it
- [ ] (Claude) Ask the kind when a lift is tracked (one tap on the result) so gymnastics lifts do not sit in "Not sorted yet"; today it is set from the lift's "..." screen
- [ ] (Claude) Lift kinds, feedback ask and form-only reports to runtimes 4.0.3 and 4.0.4 once Yash has seen them on 4.0.5
- [x] 19-11: Telegram alert for every new `problem_reports` row (Mini: ~/bin/catchline-feedback-alert.sh, launchd ai.yash.catchline-feedback-alert, every 10 min)
- [ ] (Claude) Why a report can sit on the phone: Yash's 19-11 feedback (sent 09:49 UTC) only reached the server at 10:03 on a later launch, and a launch at 10:00 did not send it. Cause unknown. `report_send_failed` (step, cause) is live from update 01a1f33c: read it in PostHog when it next fires
- [x] 19-11: issues cleaned (108 open to 20: 79 closed as removed or fixed, 9 fixed and shipped); default branch `catchline` now carries the shipping code; the bot fixer merges and ships low-risk fixes (10%, everyone after 24 h)
- [ ] (Claude) 20-11: read ~/.catchline-bot/logs/loop.log after the first tester and fixer runs on 4.0 code (does the simulator build, do packages install, does a PR merge and publish)
- [ ] (Claude) Feed the loop the weekly funnel read and new feedback rows as `bot` issues
- [ ] (Yash) Decide from docs/catchline/research/strategy-2026-11-19/00-plan.md: store subtitle and keywords, free tier test (3 in week one), price ($4.99 / $29.99), 20 coach conversations, the accuracy check with a borrowed GymAware
- [ ] (Yash) Five older PRs aimed at release/3.1 (#154 #160 #179 #181 #232): close or keep
- [ ] (Claude) Re-read the funnel per person on 20-11, once phones have the fix
- [x] A lift with no path drawn does not use the free video, and the player says so (2731309, live on all three runtimes 17-11)
- [x] Three quiet reminders (1, 3 and 7 days) for a phone that never tracked a lift; the first lift cancels them (edd611b, live 17-11). Only reaches phones that open the app after the update
- [ ] (Claude) Measure the reminders: `nudges_scheduled`, `nudge_opened`, then a track within a day
- [x] Events for the gaps (7fd143d, live 17-11): welcome_viewed, welcome_choice, video_picked, import_cancelled, plate_check_shown / _result, track_cancelled, sample_opened, result_viewed, result_action, paywall_plan_selected, purchase_started, purchase_not_completed
- [ ] (Claude) Why 34% of phones never start a track: read the new events, then fix the largest step
- [x] The reveal (live 17-11): after the first look the lift opens on a result card (FirstLook.tsx): "Your first bar path", peak bar speed, Share, See the detail, Track another. A tap during the first look skips the card
- [x] A sample lift (the bundled one) from the welcome screen and from a cancelled picker, in the real player (app/analysis/sample.tsx)
- [ ] (Claude) Read on 20-11: welcome_choice split, sample_opened then video_picked, result_action split; then fix the largest step
- [ ] (Claude, after the 20-11 read) The software factory: a weekly job that reads the funnel in PostHog, names the biggest drop and opens a proposed fix for Yash to approve. Worth building only if the 17-11 changes moved the numbers; if they did not, find out why first. The parts exist: step-level events and dashboard 2365960, the clip gate and tests, ota.sh to every runtime, catchline-bot on the Mini. Yash stays the approver for price, what users are promised, and anything sent to Apple
- [x] No bar path: the card says so, gives three filming tips, says the free video was kept, and offers another video (live 17-11; seen in tests, not yet on a simulator)
- [ ] (Claude) Say the actual cause per lift (angle, plate cut off, too dark) instead of three general tips
- [x] The wait lists its three real steps and what comes next (live 17-11)
- [ ] (Claude) Draw the plate and joints on the clip as they are found: needs the native pass to report them, so a store build
- [ ] (Claude) Why Photos full access is asked after the private picker already returned the video; remove it if it is not needed

## Notes
- 0025 was numbered past flywheel's unapplied 0024; pushing 0024 later needs `supabase db push --include-all`.
- Free tier 1 a week changes behaviour for live users the moment the OTA lands.
