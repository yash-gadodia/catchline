---
description: Screenshot-driven UI fix loop — change, look at the pixels, compare to design, iterate
---

Run the self-fixing UI loop from `.claude/rules/self-improvement.md` on whatever screen/issue the user describes (they may paste a screenshot — treat it as the bug report).

## The loop (repeat until it matches)

1. **Apply the change** (smallest edit that could fix it).
2. **Reload**: Metro Fast Refresh picks up JS changes; run `npx expo export -p ios` to confirm it still bundles if routes/imports changed.
3. **Screenshot the running simulator**: `xcrun simctl io booted screenshot /tmp/polish-check.png` — then **actually LOOK at the image** (Read it). A build succeeding is not evidence the screen looks right.
4. **Compare against the design source**: `~/dev/liftcheck-research/design/` (`Catchline Design System.dc.html`, `Catchline 02`..`09`) — spacing, typography, color, alignment, animation.
5. Mismatch → adjust → back to step 2. Match → done. Show the user the final screenshot.

If no simulator is running, get one up first (see `.claude/skills/preview/SKILL.md`: boot sim, Metro running, launch `com.yashgadodia.parallax`).

## React Native fidelity traps (see `.claude/rules/frontend.md` for the full list)

- `lineHeight` is **pixels**, never a CSS-style multiplier (`lineHeight: fontSize * 1.4`, NOT `1.5`).
- Every `<Text>` needs its **own explicit `color`** — RN does not inherit from parent Views.
- Reuse the atoms in `src/components` (Btn, Wordmark, Peek, Ring, GradientText, TabBar, Sheet…) and tokens from `src/design/tokens` + `typography` — don't reimplement.

After 2 failed attempts at the same fix, stop and rethink (rule in `.claude/rules/workflow.md`). Finish with `npm run typecheck` + `npm test` green and the final screenshot shown to the user.
