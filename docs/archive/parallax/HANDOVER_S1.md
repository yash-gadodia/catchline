# V2 build handover — S1 in flight

> For the build session on the Mac Mini (or any fresh session continuing V2). Read `docs/V2_PLAN.md` first — it is the approved, review-locked plan (CEO+design+eng, 2026-07-07). This file is only the baton: what's done, what's next, and the rules of the road.

## State at handover

- **Plan**: approved by Yash at the final gate. Taste calls locked: quiet provenance row · growth-counter hero on Us · F3 stays S3 behind its quality gate · encryption deferred to Phase 2.
- **S1 DB foundation**: migrations 0038–0041 (learnings privacy, refocus solo-persist + start_refocus race fix, repair_checkins state machine, mood_checks) + generate-drops attribution fix + 4 pgTAP suites. **Check `git log` — only trust what's pushed with green `supabase test db`.**
- **Environment on this machine (Mini)**: repo at `~/dev/parallax`, deps installed, `supabase start -x vector,logflare` running (vector breaks on the colima socket — always exclude it), Claude Code authed.

## Build order (from V2_PLAN §6 + §11.18)

1. **F1 surfaces** (behind flags, per §10 design specs — they are binding): mood-check inline card on Today (couple-local-date dedup, 4 pills, expand-in-place offer, never modal) · solo Refocus persist wiring (`save_solo_refocus`) · async partner notification (new reason in notify-partner, "when you're ready" copy).
2. **F2 surfaces**: repair check-in card (drop-card visual weight) + mutual reveal (scaled-down reveal choreography + milestone-warm celebration) + 48h reflection transform + wiring `submit_repair_verdict` / check-in creation on reveal.
3. **Funnel instrumentation** (§7 metrics table): mood_check, refocus_started/persisted, repair_verdict, repair_revealed events + mood-dismissal canary.
4. **F4/F5** (S2): repair-theme rotation server-side (§10 distribution) · growth counter hero on Us · conditional Wrapped card.
5. **F3** (S3): only after the quality gate (offline eval ~20 drops + load test) passes — see §4-F3.

## Non-negotiables

- Flags OFF until pgTAP green; **F1 flag-on additionally blocked by Yash's S0 safety sign-off** (V2_PLAN §4 safety gate).
- Definition of done per task: `npm run typecheck` (0) · `npm test` (green) · `npx expo export -p ios` (bundles) · `supabase test db` (if SQL touched) — show output, never claim from inference.
- Work directly on `main`, small conventional commits, no PRs (standing instruction). Design specs in §10 are binding — don't guess, reuse the atoms.
- Dani owns copy: mood pill words + check-in copy are placeholders until her real-couple validation; build with placeholders, mark with a `// copy: Dani pass pending` note in the content file only.

## Coordination

- The MacBook session (this file's author) handed over after pushing the S1 foundation. To avoid conflicts: **one machine builds at a time** — pull before starting, push small and often. If both sessions must run, split by layer (DB vs app) never the same files.
