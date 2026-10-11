# E2E test findings — 2026-07-02

Full end-to-end pass on the local stack (fresh `supabase db reset`, iPhone 17 Pro Max sim, driven with real taps): sign-in → play today's drop → submit → simulate the partner through the **real** RPCs (`join_couple` + `submit_answers` as a second auth user) → reveal gate → relaunch. Plus all four verification gates.

## Gates (all green before any fixes)
- `npm test` — 72 suites / 340 tests ✓ (non-pristine: act() warnings, see F7)
- `npm run typecheck` — 0 errors ✓
- `npx expo export -p ios` — bundles ✓
- `supabase test db` — 11 files / 112 pgTAP tests ✓

## What works end-to-end ✅
- Welcome → signup → signed-in session restore across relaunches.
- Drop flow UI: 3 prompts, answer + hunch phases, progress bar, batch submit.
- `submit_answers` RPC records all 3 picks+hunches atomically; `couple_drops.state` → `one_done`.
- **The reveal gate (core security property)**: partner joined via `join_couple` (invite code) and submitted via `submit_answers` — server flipped state to `revealed` only after both sides were in. Unpaired user correctly sees the held "looking for your partner…" screen.
- Pairing propagates to the UI: partner name in banner + packs card, activity dot fires.

## Findings (severity-ordered)

### F1 🔴 Native crash: reanimated 4.3.1 UI-thread race (SIGSEGV)
App segfaulted ~11 min into the session on the waiting screen. Crash report: `EXC_BAD_ACCESS` in `reanimated::cloneShadowTreeWithNewPropsRecursive` (UI thread) racing a `setNativeProps_DEPRECATED` Fabric commit (JS thread, `react-native-svg` is the caller); `0xdead…` poison registers = use-after-free of props. Known upstream bugs [#9293](https://github.com/software-mansion/react-native-reanimated/issues/9293)/[#9402](https://github.com/software-mansion/react-native-reanimated/issues/9402); fixes (PRs #9308, #9323 + follow-ups) landed in reanimated **4.4.0–4.5.0**.
**Fix in progress:** upgraded `react-native-reanimated` 4.3.1→4.5.0 + `react-native-worklets` 0.8.3→0.10.1. Typecheck/jest/export green on the new versions; native rebuild + soak verification pending.

### F2 🔴 `sim_partner_submit` is broken — and dangerous if it ever runs
- **Broken (verified by executing as `authenticated`):** for an unpaired couple it inserts a *random UUID* into `profiles`, violating `profiles_id_fkey → auth.users(id)` → the RPC **always throws**. Because `submitMyAnswers` (`src/features/drops/dropActions.ts:98`) calls it unconditionally after `submit_answers`, the catch fires an error toast and `completeDrop` (streak increment) + the `revealed` notification **never run** — even though the answers did submit.
- **Dangerous:** for a *paired* couple it succeeds — inserting deterministic fake answers for the real partner with `on conflict … do update`, i.e. it would **overwrite the partner's real answers** and force-flip the reveal. Backlog already tracks "gate it before prod" (Yash), but the unconditional client call is a code bug on top.

### F3 🔴 Played/revealed state is client-only — lost on every app restart
`app/(tabs)/today.tsx:40` derives `done` from `usePlayStore` (Zustand, **not persisted**, no server hydration). After a kill/relaunch, a user who already played sees "Play today's three" + a wrong "your turn" banner, and the revealed drop is unreachable from Today — even though the server state is `revealed`. Needs Today to hydrate from `couple_drops` + own `answers` on mount.

### F4 🟡 Day boundary is UTC, not user-local
`ensure_today_drop` keys `couple_drops.date` on server `current_date` (UTC). Played at 04:40 SGT on Jul 2 → row dated **Jul 1**. For SG users the "daily" drop rolls over at 8am local, and streak/day logic inherits the same skew.

### F5 🟡 Daily content is hardcoded demo data
`src/content/drop.ts`: `day: 'Sunday'` (card always says SUNDAY), same 3 prompts every day ("DROP 27 · soft launch"), `ARCHIVE` is fake history. Content pipeline is a known product gap — flagged so the label at least stops lying before beta.

### F6 🟡 Tap during answer→hunch transition can register on the wrong phase
Driving Q2 with two taps produced `hunch=0` for Q2 and a `pick` for Q3 that was never intentionally made — a selection landing during the phase-advance re-render binds to the *new* phase's option at the same position. Observed with synthetic clicks; a fast real double-tap likely reproduces. Needs a brief disable/debounce during the transition.

### F7 🟢 Jest output not pristine
act() warnings in `signup.test.tsx` (overlapping act), `onboarding.test.tsx` (setLoading/setStep outside act), `wrapped.test.tsx` (Animated update). Tests pass; warnings are findings per testing rules.

### F8 🟢 Dev LogBox warnings on every launch
"Open debugger to view warnings" toast appears at boot — uninspected; worth a look next dev session.
