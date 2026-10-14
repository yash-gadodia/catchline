# Catchline bug loop (Mac Mini)

Two headless Claude runs on the Mac Mini keep testing the app and fixing what they find. Modelled on Volty's Grok Bug Report table: a stable id per bug, a test seen failing per fix, batch PRs, and re-testing only once the fix is merged.

| | Tester | Fixer |
| --- | --- | --- |
| When | 02:00, 08:00, 14:00, 20:00 | 03:00, 09:00, 15:00, 21:00 |
| Does | Black-box tests the Release build in the "Catchline Bot" simulator (maestro MCP) and the public API as an anonymous client; files issues; re-tests merged fixes | Fixes open issues test-first in one `bot/fix-*` branch, runs the gate, opens a PR into `catchline` |
| Never | Changes code, buys, uses a service key | Merges, pushes `main`/`catchline`, deploys |

## Issue lifecycle (GitHub labels)
`bot:open` → fixer opens a PR → `bot:in-pr` → Yash merges → tester sets `bot:verify` → re-test → `bot:accepted` (closed) or `bot:rejected` (back to the fixer). Side exits: `bot:not-valid` (closed), `bot:needs-yash` (a decision or credential). Severity: `sev:high|med|low`, `ux`.

**Security findings never go public** (the repo is public). The issue says only `Security: finding <slug>`; the details live in `~/.catchline-bot/security/` on the Mini (mode 700).

## Files
- `bot/run.sh <role>`: guards (STOP file, under 8 GB free, one run at a time via `~/.catchline-bot/lock`, kills leftover `simctl diagnose` / XCTRunner / `maestro mcp` processes), fresh detached checkout of `origin/catchline` in `~/dev/catchline-bot/<role>`, then `claude -p` with the role prompt. The alarm kills the run at 180 min; the prompt carries a soft deadline (stop exploring at 150, report by 165) so a report lands first. After the run, whatever the exit code: on non-zero it logs the last tool call to `loop.log`, then it deletes every test account the tester recorded in `~/.catchline-bot/evidence/<stamp>/accounts.txt` via the `delete-account` edge function.
- `bot/build-sim.sh`: Release simulator build of the checkout (no Metro), skipped when that commit is installed. Times `simctl` first: over 5 s it restarts CoreSimulatorService, and if still slow exits 2 (`run.sh` logs "host unhealthy" and skips; 14 Oct a wedged runtime discovery made every simctl call 18 s and killed the maestro driver).
- `bot/prompts/{tester,fixer}.md`: the roles. `bot/settings.json`: deny rules (push to main/catchline, merge, deploys). `bot/mcp.json`: maestro.
- `bot/install.sh`: labels + launchd agents `com.catchline.bot.{tester,fixer}`. The agents run `~/dev/catchline-bot/runner/bot/run.sh`, a checkout that holds the loop itself.

## On the Mini
- Env (public values only): `~/.config/catchline-bot/env.local` (Supabase URL, publishable key, RevenueCat iOS key).
- Logs: `~/Library/Logs/catchline-bot/` (`loop.log` one line per run; `<role>-<stamp>.log` the full stream, last 30 kept).
- Evidence: `~/.catchline-bot/evidence/`. Reference clips: `~/.catchline-bot/clips/`.
- Stop: `touch ~/.catchline-bot/STOP` (remove to resume). Run now: `~/dev/catchline-bot/runner/bot/run.sh tester`.
- Needs Xcode at `/Applications/Xcode.app` with an iOS simulator runtime, OpenJDK 17, Maestro (`~/.maestro/bin`), and `claude` signed in.
