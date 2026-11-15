# Referrals and free tier (feat/referrals, from 4.0.3)

Decided by Yash 15-11-2026: free tier 1 video a week; give a month, get a month when the invited lifter tracks a first lift; 3 friends = +3 months, 10 = +1 year and a badge; 12 months banked at most; Sign in with Apple to claim; coaches get Pro for life and 30% of their lifters' first year, paid outside Apple.

Everything ships as an OTA on the 4.0.3 runtime (no native code). Native end card on the exported video waits for the next store build.

## Backend
- [ ] 0025_referrals.sql: codes, referrals, reward ledger, claim RPC, my_referrals RPC, preview RPC for the web page, qualify trigger on the first done lift, coach codes, coach payout view
- [ ] Edge function referral-rewards: grants pending rewards as RevenueCat promotional `pull`, 12-month cap, then applies the plan
- [ ] Deno tests for the grant maths; SQL checks against a scratch run
- [ ] Apply 0025 to prod, deploy the function, verify with a test pair of accounts

## App (OTA)
- [ ] FREE_PER_WEEK 3 -> 1, copy and tests
- [ ] Invite screen from You: code, share to a friend, share to a gym chat, counter, milestones, badge; Apple sign-in first when anonymous
- [ ] Claim: "Have an invite code?" in first run and in Invite; catchline://invite/CODE prefills
- [ ] Share caption carries the code and link
- [ ] After a share: "give a friend a free month" prompt, once
- [ ] Analytics events: invite_shared, referral_claimed, referral_qualified (server), invite_viewed
- [ ] Tests, typecheck on the Mini

## Web
- [ ] docs/i/index.html on the catchline branch: inviter's first name, code, App Store button, open-in-app link

## Ops
- [ ] scripts/referrals: make a coach code, list coach payouts
- [ ] OTA to production after Yash sees it on a phone
