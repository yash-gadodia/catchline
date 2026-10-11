# Git

> 🚧 Skeleton — confirm against real history once commits exist, then run `/update`.

- **Commit format**: Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`. Subject in imperative mood, ≤ 72 chars.
- **Granularity**: small, focused commits. One logical change per commit.
- **When to commit**: only when the user asks. Don't auto-commit after edits.
- **Branching**: Catchline work happens on `catchline` (or a worktree branched from it); `main` is Parallax and is never touched. Do NOT open PRs unless asked.
- **Never**: `--no-verify`, force-push to `main`, or commit secrets (`.env`, `*.pem`, `*.key`, credentials — a hook blocks writes to these).
- **Co-author trailer** (when committing on the user's behalf):
  `Co-Authored-By: Claude <noreply@anthropic.com>`
