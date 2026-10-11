# Revamp: Clarity & Polish Pass (Paired-benchmarked)

Status doc for the "make Parallax as clear/polished as Paired" effort. Read this to know **what changed, how to test it, and what's left.**

## Why this happened

New users (Yash's friends) were "super confused" onboarding, and the app felt "off" vs. Paired. A firsthand code audit found the cause was **not** missing features or bad design — every screen was built and the design is thoughtful. The problem: **the app shipped example/demo data as if it were real.** A brand-new couple saw a stranger named "Dani," a 23-day streak, a 76% wavelength, fabricated "past drops," and a dead invite code — from second one.

**Decision (confirmed):** keep our differentiated core (drop → hunch → reveal → wavelength, Refocus, Love Map); borrow Paired's **clarity** (real names, honest stats, legible states). No net-new features this pass.

## What shipped (live on `main`)

Commits: `b6aea44` (identity) and `e8cc7fb` (honesty).

| Was (confusing) | Now |
|---|---|
| Partner hardcoded as **"Dani"**, self as **"Y"** across ~20 screens | Real partner + self names via a new `useIdentity()` hook |
| Day-one **23-day streak / 76%** wavelength | Honest **0 / empty** until earned |
| Fake **wavelength chart, "June recap", ▲9%** on the Us tab | Chart from real history only; a clean **first-run state** when empty |
| Fabricated **"past drops" + learnings** for new couples | Real **empty states** (Love Map's empty state was dead code — now reachable) |
| Dead invite code **"YASH-4827"** handed to users | Real code only; **retry** affordance on failure |
| **"DROP 27"** (implies 26 unseen drops) | **"TODAY"** |
| Refocus **trapped** you during the ~4s analyze wait | **Cancel** back to compose, with clean state reset |

Notifications already compose real names server-side (`notify-partner` edge fn): "*Alex* joined you on Parallax" / "*Alex* played today's drop" — fires once push creds are live.

### Key implementation notes
- New hook: `src/features/profile/useIdentity.ts` → `{ me, partner }` with real names + derived initials. `partner.name` is the real name, `"your partner"` while pending, or the demo persona `"Dani"` **only** when unauthenticated (where the solo/sim partner genuinely is Dani).
- `src/features/profile/useProfile.ts` refactored: fetch effect keyed on **stable primitives** (couple id + members), not the couple object ref — fixes a latent infinite-render loop; `streak`/`togetherSince` computed synchronously (honest 0/null for real couples).
- Sample data (`useLearnings`, `useCoupleHistory`) now falls back to sample **only when unauthenticated**; a real empty couple gets `[]` so genuine empty states render.

### Verified
`npm run typecheck` clean · **340 tests pass** (`npm test`) · `npx expo export -p ios` bundles. Added a `useIdentity` proof test; updated tests to the new honest contract.

## How to test on your MacBook

```bash
git pull                          # get b6aea44 + e8cc7fb
npm install --legacy-peer-deps
supabase start && supabase db reset   # local backend + seed
./scripts/seed-test-user.sh           # test@parallax.app / parallax123
npm run ios                           # boots the iOS simulator (needs Xcode)
```

Or, no-Xcode path (your normal pipeline): `eas build -p ios --profile preview` → run on a sim or push to TestFlight.

### What to look for (the day-one flow)
1. **Sign up fresh** (not the seeded demo user) and pair — you should see **your own + your partner's real names** everywhere, never "Dani."
2. **Streak = 0, no wavelength history** — the Us tab shows a "your story starts here" first-run state, **not** a fake chart or "June recap."
3. **Love Map** shows the real empty state ("Nothing learned yet"), not fabricated learnings.
4. **Invite code** is your real code; if creation fails you get a retry, never "YASH-4827."
5. **Home** title reads **"TODAY"**, not "DROP 27."
6. **Refocus** → start the flow → during the "analyzing" wait you can **Cancel** back out.

> The **unauthenticated demo** (tap through without signing in) still shows "Dani"/sample data on purpose — that's the demo persona. The fixes are for **real, signed-in** couples.

## What's left — Phase 4: visual & motion polish

Spacing, type scale, haptics, and animation to match `design_handoff_parallax/` + Paired's feel (see `docs/STRATEGY.md §12` for the iOS-UX bar). **This needs on-device pixel verification** — do NOT install Xcode on the Mac Mini (only ~18 GB free; it runs production OpenClaw agents). Test on your MacBook or via EAS.

**To continue:** run a build, then send screenshots of any screen that still feels "off" (like the Paired video). The polish pass will run against those real pixels.

## Full plan reference
The approved plan lives at `~/.claude/plans/purrfect-whistling-wigderson.md` (Phases 1–4). Phases 1–3 (clarity) are done; Phase 4 (visual polish) is pending an on-device pass.
