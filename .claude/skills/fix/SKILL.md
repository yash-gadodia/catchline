---
name: fix
description: Reproduce, root-cause, and fix a bug or UI/UX issue the user describes (often with a screenshot), then verify the fix. Use when they say something is broken, wrong, or "fix this".
---

# Fix

The user described something wrong — often in plain words or a screenshot. Fix the cause, not the symptom, and prove it's fixed.

1. **Understand it.** If they pasted a screenshot, look at it. If the report is vague, ask 1–2 quick questions only if you genuinely can't locate the issue — otherwise find it yourself.
2. **Locate.** Find the screen/component and the exact code. For a crash or error, get the real message. For a visual issue, compare against the design source (`~/dev/liftcheck-research/design/`).
3. **Reproduce first.** Capture the real failing data shape (the `analyses` row, the Realtime payload, the worker log line, the clip), not a description of it, and turn it into a fixture next to a test. Run the test and **see it fail for the same reason** the bug happens; a test failing for a different reason pins nothing. A lift-analysis bug's clip becomes a `cv/tests` fixture with a `uv run pytest` case on the Mini (our own test footage only, never a user's upload; if the clip is too big or too private for a public repo, commit the smallest derived input that still fails, e.g. the cached pose for the bad frames). Pure visual bugs reproduce as a screenshot instead.
4. **Root cause.** Form a hypothesis about *why* before editing. Don't silence errors with try/catch or weaken a test. After **2 failed attempts**, stop and rethink — the hypothesis is likely wrong.
5. **Fix** with the smallest change that addresses the cause and watch the failing test go green. Match surrounding code; reuse the `src/components` atoms; respect `.claude/rules/frontend.md`.
6. **Verify the actual issue is gone:**
   - Visual fix → reload + `xcrun simctl io booted screenshot` and look at it.
   - Logic/crash → the reproducing test passes; show the output.
   - Live: for the analysis pipeline, run the real worker on the Mini and read the `analyses` row back with `psql`, not the app's success state.
   - Always: `npm run typecheck` + the relevant `npx jest`.
7. **Capture the learning** if it was non-obvious (a gotcha, a root cause that wasn't obvious) → one line in `TASKS.md` notes or a memory, per `.claude/rules/self-improvement.md`.
8. Tell the user what was wrong and that it's fixed, with the evidence (a screenshot or the passing check). Offer to `/ship` it.
