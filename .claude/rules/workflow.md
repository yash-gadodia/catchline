# Development workflow (automatic)

Follow this for every coding task — scale the rigor to the task size. The user does not need to type slash commands; invoke the matching skill yourself.

## Scale by size

- **Trivial** (typo, one-line fix, rename): just do it, then verify.
- **Small** (single function/file): implement test-first, run tests, self-review the diff.
- **Medium** (multiple files, new behavior): `/clarify` if ambiguous → `/plan` → implement test-first (`/test`) → `/review` → `/verify`.
- **Large** (3+ independent tasks, structural change): plan with the architect → subagent-driven implementation → review each piece → verify → `/finish`.

## The loop

1. **Clarify** — if requirements are ambiguous, ask 2-3 focused questions before coding. Don't guess on decisions that change what you build.
2. **Plan** — for medium+ work, write bite-sized steps with exact file paths. Challenge the plan once (devil's advocate) before starting.
3. **Implement** — test-first (RED → GREEN → REFACTOR). Smallest change that works.
4. **Review** — spec compliance first, then code quality. Review in a fresh perspective.
5. **Verify** — never claim "done/fixed/passing" without fresh evidence: run it, show the output.

## Non-negotiables

- After 2 failed attempts at the same approach, stop and rethink — don't brute-force.
- Stay on the task in the current message; don't silently expand scope.
- Pre-existing failures are not yours to fix mid-task — surface them, then proceed.
- Delegate verbose operations (test runs, log analysis) to subagents to preserve context.
- Subagents run only the tests they touched (`npx jest <path>`, `npx tsx scripts/check-all.ts <files>`); the main session runs the full gate (`npm run qa`) once, before landing. Several whole-repo gates at once swap the machine to a standstill.
