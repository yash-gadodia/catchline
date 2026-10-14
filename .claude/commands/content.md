---
description: Parallax only (archived) — add or edit daily-drop content. Does not apply to Catchline.
---

> **Parallax only.** Catchline has no drops catalog; these tables and migrations exist only on `archive/parallax`. Do not use this command on `catchline`.

Help the user add or change daily-drop content. They will describe prompts/themes in plain English — you handle all SQL, migrations, and verification. Never ask them to write SQL or run psql.

## The content architecture (current — do not guess)

- **Real drops live in the DB catalog**, not in TypeScript. Migration `supabase/migrations/0015_content_catalog.sql` seeded the 90-drop rotating catalog (`drops` + `drop_prompts` tables, spice-aware per-couple rotation via `ensure_today_drop`). Migration `0019_generated_drops.sql` added `drop_candidates` — the intake table for LLM/hand-authored candidates that get published into the rotation.
- **`src/content/drop.ts` is demo-only** (the static content shown to unpaired/logged-out users). Only touch it if the demo experience itself should change.

## The shape (non-negotiable)

Every drop = **3 prompts x 5 options each**, plus:
- `drops`: fixed UUID (so re-running is a no-op), `code` (next free `DROP N`), lowercase `title`, `theme` (one of `deeper` / `fun` / `spark` / `daily` / `memory` / `spicy`), `position` (next free — check `max(position)`), `spice` (0=sweet, 1=warm/flirty, 2=spicy — the max spice of any prompt in the drop).
- Prompts follow the option/copy voice of the existing catalog — read a few drops in `0015_content_catalog.sql` first and match the tone (Gen-Z, lowercase, warm, specific).

## Steps

1. Clarify (max 2-3 questions) only if the theme/spice/quantity is genuinely ambiguous.
2. **Check the next free migration number**: `ls supabase/migrations/` — use the next `00NN_` (do NOT reuse or guess; another session may have added one — pull first).
3. Write a new idempotent migration (`insert ... on conflict do nothing`, fixed UUIDs) adding the drops + prompts, following `0015`'s structure. New catalog rows need no new grants (select policies from 0002/0006 cover them).
4. If the migration touches functions/policies or anything beyond plain catalog inserts, add/extend a **hermetic pgTAP test** (`supabase/tests/`, own rows via `gen_random_uuid()`, never global counts) per `.claude/rules/testing.md`.
5. Verify: `supabase migration up` locally (or `supabase db reset` for a clean check), then `supabase test db` green. Show the output.
6. Confirm back in **plain English**: which drops were added (titles + themes + spice), where they land in the rotation, and that tests pass. No SQL in the summary.
