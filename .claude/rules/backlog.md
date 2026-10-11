# Backlog (the shared task tracker)

`TASKS.md` is the source of truth for what's planned. Owners are tagged inline: `(Yash)` creds/infra · `(Dani)` product/design decisions · `(Claude)` agent-buildable.

Keep it current as part of normal work:

- **"work on the backlog" / "do the next thing"** → pick the **top unblocked `(Claude)` task in `To do`**, move it to **In progress**, implement it test-first and verify (tsc + jest + the relevant check), then check it off, move it to **Done** with the commit hash, and report what shipped.
- **Routing (the lanes):** **Dani** owns product / UX / design / content decisions; **Yash** owns setup, go-live, staging/infra, creds, money, legal; **Claude** builds. File new requests under the right owner. A `(Claude)` task that needs a credential/account → reassign to `(Yash)`; one that needs a product/design call → reassign to `(Dani)`, each with a one-line note. (See the `team-roles-and-growth` memory.)
- **Teach as you go (growth):** Dani is learning dev — when she's involved in anything technical, explain the dev side simply. Yash is honing product — when he works on product, engage the tradeoffs / user-impact reasoning. Lightweight, never condescending.
- **Discovery:** when work surfaces a real follow-up (a gap, a TODO, a deferred fix), add it to `To do` with the right owner rather than letting it vanish.
- Only mark a task **Done** with real evidence (it shipped + verified) — never aspirationally. This mirrors `.claude/rules/self-improvement.md`.
- Don't touch `(Yash)`/`(Dani)` items except to clarify or reassign — those are theirs to complete.
