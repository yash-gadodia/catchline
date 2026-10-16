---
name: design-review
description: Screenshot-review a Catchline screen on the iOS simulator against the catchline-ui rules, then report or fix. Use after building or changing any screen, sheet or overlay, before calling UI work done, or when asked to "review the design", "check it looks right", "visual QA", "does this match the design", "polish this screen". Covers launching your own Metro, driving the sim with idb, capturing with simctl, the checklist by domain, severity, and what to fix versus report.
---

# Design review (simulator)

A screen is reviewed from pixels, never from source alone: green guards prove the tokens were used, not that the screen reads well. Read `.claude/skills/catchline-ui/SKILL.md` first; it is the rulebook this review applies. Review is read-only unless the task is to fix; when fixing, stay inside the screen you were asked about (other agents are editing other screens).

## 1. Get your build on screen

Several worktrees share the simulators and the bundle id, so point the dev client at your own Metro and address the sim by udid, never `booted`.

1. `cp ~/dev/parallax/.env.local .env.local` (gitignored), then `npx expo start --port <yours> --dev-client` in the background; wait for `curl -s 127.0.0.1:<port>/status` to say `packager-status:running`.
2. The debug dev client is on the "iPhone 17 Pro" sim. It registers only the `catchline` scheme (an `exp+parallax://` link fails with -10814), so: read the current value with `xcrun simctl spawn <udid> defaults read com.yashgadodia.parallax RCT_jsLocation`, write yours (`... defaults write com.yashgadodia.parallax RCT_jsLocation "localhost:<port>"`), relaunch the app (tap its icon with idb if `simctl launch` hangs), and restore the old value when you are done.
3. Deep-link to the state: `xcrun simctl openurl <udid> catchline://<route>`. Every fixture state is listed on `catchline://dev`; the token and atom catalogue is `catchline://dev/design`.
4. Drive it with idb (`~/.local/bin/idb`, the Python 3.12 install): `idb ui describe-all --udid <udid>` for the AX tree with frames in points, `idb ui tap x y --udid <udid>`, `idb ui swipe 200 760 200 160 --duration 0.4 --udid <udid>` to scroll.
5. Capture: `xcrun simctl io <udid> screenshot <scratchpad>/<screen>-<state>.png`, then Read the image. A blue "Refreshing..." banner or a LogBox pill means retake. Clean status bar for anything shared: `xcrun simctl status_bar <udid> override --time 9:41 --batteryLevel 100`.

Capture every state the screen has: populated, empty, loading, error, long content (two-line cue, long movement name), and Reduce Motion for anything animated (Settings > Accessibility > Motion, or check the code path that reads `useReducedMotion`).

## 2. Checklist

Walk the domains in this order, so a foundation problem is not hidden by polish.

1. **Legibility and access.** Every Text visible (no black-on-black, no clipped line from a multiplier lineHeight); contrast holds (bone or text2 on black, onFlare on flare); targets 44pt; icon-only controls labelled; nothing clipped at large Dynamic Type.
2. **Hierarchy.** Squint: one display element, one measured number, one primary action. The eye lands on the lifter or the cue first, the action last. Mono only on measured values.
3. **Colour.** Flare appears only on the bar path and the one primary action (count the flare pixels: two flare buttons is a finding). No status colours, no greys that are not `text2`/`text3`/`hairline`.
4. **Layout and spacing.** Content inside the 24pt gutter and the safe area; groups separated by at least twice their inner gap; alignment edges shared; the primary button at the bottom, full width, clearing the tab bar.
5. **Shape.** Controls 56pt (48 compact) at radius 4 with continuous corners; images square-cornered; the sheet is the only 12pt surface; no pills, no shadows, no cards around a pull quote.
6. **Type.** Styles from `type.*` and `display()`; sentence case; no orphaned single word on a two-line heading; numbers do not jitter when they change.
7. **Motion.** Purposeful (draws, pops, lands), within `motion.*` durations, interruptible, with a static end state under Reduce Motion; no animation on routine taps.
8. **Art.** Strobe opacities, bar path stroke and halo, key-frame dots, evidence crops and charts as catchline-ui section 6 describes.
9. **Copy.** Plain, measured, second person, verb-first buttons, "AI estimate" on the cue, never a score, never "prevent injury" or "diagnose".
10. **Consistency.** Compare against the same atom in `catchline://dev/design` and the matching frame in `~/dev/liftcheck-research/design/Catchline 0N *.dc.html`. A one-off that duplicates an atom is a finding.

## 3. Report

One table, ordered by severity, one row per root cause (list every location in the row):

| # | Severity | Domain | Location | Seen | Fix |
|---|---|---|---|---|---|

- `HIGH`: unreadable or hidden content, a misleading colour or number, a blocked task.
- `MEDIUM`: broken hierarchy, a second flare, off-token spacing or type that a user notices, a one-off duplicating an atom.
- `LOW`: isolated polish.

Cite `path:line` and the screenshot file. Add two or three candidates you considered and rejected, with why. End with the screenshots you took and a verdict: `Block` (any HIGH), `Needs changes`, or `Approve`.

## 4. Fixing

Fix in the order of the table, with tokens and atoms (never new literals), re-run `npx tsx scripts/check-all.ts <files>`, re-screenshot the same state, and put before and after side by side. A fix that lowers a file's guard count is followed by `npx tsx scripts/design-baseline.ts --write` so the baseline ratchets down. Restore `RCT_jsLocation` and stop your Metro when finished.
