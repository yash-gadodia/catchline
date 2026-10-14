---
name: ship
description: Verify, commit, push `catchline`, and watch CI. Use when the user says "ship it", "push it", or wants their changes saved to GitHub.
---

# Ship

Land the current changes on `catchline`. Never push red code, never push or commit to `main` (that is Parallax).

1. **Gate green** (show the output, don't infer): `npm run qa` (typecheck, check-all, jest, `expo export -p ios`). Add `supabase test db` on the Mini if SQL/migrations changed, and `uv run pytest` in `cv/` or `worker/` if those changed. If anything fails, **stop and fix it** — tell the user plainly what's broken.
2. **Commit** only your own paths (`git commit -- <paths>`), Conventional Commits, imperative subject ≤72 chars, with the co-author trailer from `.claude/rules/git.md`.
3. **Push `catchline`**:
   - On `catchline`: `git pull --rebase origin catchline`, then `git push origin catchline`.
   - In a worktree (`.claude/worktrees/<name>`, branch `worktree-<name>`): `git rebase origin/catchline`, then from the main checkout `git merge --ff-only worktree-<name>` on `catchline`, push, and `git worktree remove .claude/worktrees/<name>`.
   - Never `--force`, never `--no-verify`, never `main`.
4. **Watch the CI run**: `gh run list --branch catchline --limit 1 --json databaseId,headSha` (check `headSha` is your commit), then `gh run watch <id> --exit-status`. Red → fix forward with a new commit and watch again. "Job was not started ... billing issue" is the GitHub account lock, not your code: say so.
5. **Report** in one line: short hash + what shipped + gate and CI result (e.g. "shipped `a722728` — capture iCloud import, qa green, CI green run 123").
