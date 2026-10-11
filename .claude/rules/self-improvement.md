# Self-improvement & self-fixing loops

How the agent gets better over time and fixes its own UI/bugs/UX instead of handing broken work back. Applies to every task. Pairs with `workflow.md` (the clarify→plan→implement→verify loop).

## Capture every non-obvious learning (so it's never relearned)

When a fix was **not obvious** — a real root cause, a gotcha, a tooling quirk, or anything that took 2+ attempts — record it before moving on:

1. Add a one-line entry to the notes in **`TASKS.md`** (decisions and gotchas alike).
2. Save a durable **memory** for cross-session facts (user preferences, project constraints, "X looks wrong but is correct").
3. If it's a rule the agent should always follow, add it to the right **`.claude/rules/*.md`**.

The test: "Would a future session waste time rediscovering this?" If yes, write it down now. Knowledge compounds; rabbit holes shouldn't repeat.

## Self-fixing UI loop (screenshot-driven)

For any visible change, close the loop yourself — don't claim it looks right:

1. Apply the change → reload (Metro Fast Refresh) or `npx expo export -p ios` to confirm it bundles.
2. Screenshot the running sim: `xcrun simctl io booted screenshot /tmp/check.png` and **look at it**.
3. Compare against the design source (`design_handoff_parallax/design_files/couples-*.jsx`) — spacing, type, color, animation.
4. Mismatch → fix → re-screenshot. Match → done.

A build succeeding ≠ the screen looking right. Always view the pixels.

## Self-fixing bug loop (test-driven)

1. **Reproduce** first (failing test or a concrete repro), then form a **hypothesis** about the root cause.
2. Fix the cause, not the symptom. Never silence an error with try/catch or by weakening a test.
3. Re-run the failing case fresh and **show the output** (the passing assertion line), not an inference.

## The 2-attempt guardrail (kills zombie loops)

After **2 failed attempts at the same approach**, STOP. The hypothesis is probably wrong. Step back, investigate (read the actual error, add a diagnostic, check assumptions), and try a *different* approach — don't brute-force the same one a third time. (This session: a "flaky" suite was one leaked timer; a slow logo bounce was a per-leg-vs-full-cycle bug — both found by stepping back, not retrying.)

## Definition of done (non-negotiable, every task)

`npx tsc --noEmit` (0) · `npx jest` (green) · `npx expo export -p ios` (bundles) · `supabase test db` (if SQL changed) — and for UI, a screenshot of the running app. Show the output. Never claim done/fixed/passing from inference.
