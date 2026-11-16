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
- [ ] (Yash) Phone pass on TestFlight, then the go to submit 4.0.5

### After Apple approves 4.0.4 (WAITING_FOR_REVIEW since 15-11, manual release; both custom product pages too)
- [ ] (Yash) Release 4.0.4
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

## Notes
- 0025 was numbered past flywheel's unapplied 0024; pushing 0024 later needs `supabase db push --include-all`.
- Free tier 1 a week changes behaviour for live users the moment the OTA lands.
