# Generative engine (IMPROVEMENT_PLAN 1.4)

Personalized candidate drops from a couple's own graph → human-review queue → published into the global rotation. Pieces: migration `0019_generated_drops.sql` (`drop_candidates` + `publish_drop_candidate`), edge function `supabase/functions/generate-drops`, tests `supabase/tests/generated_drops_test.sql`.

## Generate (ops/cron only — never the client)

The endpoint rejects any bearer that is not the service-role key (`verify_jwt` is off; the function's own gate is stricter). Body: `couple_id` (optional — omit for global candidates authored from the catalog themes) and `count` (default 3, max 10).

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/generate-drops" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"couple_id": "<uuid>", "count": 3}'
# → {"inserted": 3, "rejected": 0}
```

With `couple_id` it reads the couple's graph (Love Map learnings, last 30 revealed drops with hunch hit/miss per question, intents, together_since) and instructs Claude (same model/env as refocus: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) to author new drops in the house voice, with real 0015 seed drops as style anchors and an avoid-list (the couple's recent questions + a catalog sample) so it never near-duplicates. Output is forced through tool use, validated server-side (exactly 3 prompts × 5 non-empty distinct options), and inserted as `status='pending'`. The DB check constraint re-enforces the shape as a last line.

## Review + publish (SQL, service_role / studio)

```sql
-- what's waiting
select id, couple_id, title, theme, spice, prompts
from drop_candidates where status = 'pending' order by created_at;

-- reject the misses
update drop_candidates set status = 'rejected', reviewed_at = now() where id = '<uuid>';

-- publish a keeper (this IS the approval — flips status, creates the drop + 3 prompts)
select publish_drop_candidate('<uuid>');
```

`publish_drop_candidate` creates a global drop (`code 'GEN <shortid>'`, `position = catalog max + 1`, spice clamped 0–2) plus its 3 `drop_prompts`; `ensure_today_drop` (0015) then serves it naturally in every couple's rotation, spice-filtered as usual. Idempotent: re-publishing returns the existing drop id (tracked via `published_drop_id`).

## v1 scope + v2 notes

- **v1: published candidates are GLOBAL.** Even a couple-scoped candidate becomes a drop in everyone's rotation — review accordingly (nothing couple-identifying in the questions). `couple_id` on the candidate records provenance only.
- **v2 — couple-scoped serving:** teach `ensure_today_drop` to prefer drops linked to the couple (e.g. a `drops.couple_id` or a join table), closing the `learnings.became_prompt_id` flywheel per-couple.
- **v2 — auto-approve:** once a source has quality history (acceptance rate from review decisions), skip the queue for high-confidence candidates.
- **v2 — scheduled cron:** nightly `pg_cron`/scheduler POST per active couple (and a weekly global batch), rate-capped; today generation is manual.
