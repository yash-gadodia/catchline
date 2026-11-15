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
- [ ] OTA to production after Yash sees it on a phone

## Notes
- 0025 was numbered past flywheel's unapplied 0024; pushing 0024 later needs `supabase db push --include-all`.
- Free tier 1 a week changes behaviour for live users the moment the OTA lands.
