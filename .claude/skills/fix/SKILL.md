---
name: fix
description: Reproduce, root-cause, and fix a bug or UI/UX issue the user describes (often with a screenshot), then verify the fix. Use when they say something is broken, wrong, or "fix this".
---

# Fix

The user described something wrong — often in plain words or a screenshot. Fix the cause, not the symptom, and prove it's fixed.

1. **Understand it.** If they pasted a screenshot, look at it. If the report is vague, ask 1–2 quick questions only if you genuinely can't locate the issue — otherwise find it yourself.
2. **Reproduce / locate.** Find the screen/component and the exact code. For a crash or error, get the real message. For a visual issue, compare against the design source (`design_handoff_parallax/design_files/couples-*.jsx`).
3. **Root cause.** Form a hypothesis about *why* before editing. Don't silence errors with try/catch or weaken a test. After **2 failed attempts**, stop and rethink — the hypothesis is likely wrong.
4. **Fix** with the smallest change that addresses the cause. Match surrounding code; reuse the `src/components` atoms; respect `.claude/rules/frontend.md`.
5. **Verify the actual issue is gone:**
   - Visual fix → reload + `xcrun simctl io booted screenshot` and look at it.
   - Logic/crash → re-run the failing case / add a test; show the passing output.
   - Always: `npx tsc --noEmit` + relevant `npx jest`.
6. **Capture the learning** if it was non-obvious (a gotcha, a root cause that wasn't obvious) → one line in `TASKS.md` notes or a memory, per `.claude/rules/self-improvement.md`.
7. Tell the user what was wrong and that it's fixed, with the evidence (a screenshot or the passing check). Offer to `/ship` it.
