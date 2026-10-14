# Catchline bug loop (Mac Mini)

One launchd agent on the Mac Mini runs `bot/run.sh loop`: tester, cooldown, fixer, cooldown, forever, under daily caps. Modelled on Volty's Grok Bug Report table (a stable id per bug, a test seen failing per fix, re-testing only once the fix is merged) with what that loop lacks: memory between runs, dedupe, cost caps, one PR per issue. Comparison: `~/dev/liftcheck-research/33-bot-vs-volty.md`.

| | Tester | Fixer |
| --- | --- | --- |
| When | Alternating with the fixer, 30 min cooldown, at most 4 runs and US$40 a day between them (`~/.catchline-bot/loop.conf` overrides) | Same |
| Does | Black-box tests the Release build in the "Catchline Bot" simulator (maestro MCP) and the public API as an anonymous client; picks the areas covered longest ago (`memory.sh areas`); dedupes before filing; attaches screenshots; re-tests merged fixes | Fixes up to 3 issues test-first, one `bot/<issue>-<slug>` branch and one PR per issue into `catchline`; runs `npm run check`, typecheck and the touched jest suites only (CI runs the rest); never retries an issue that failed twice |
| Never | Changes code, buys, uses a service key | Merges, pushes `main`/`catchline`, deploys |

## Issue lifecycle (GitHub labels)
`bot:open` → fixer opens a PR → `bot:in-pr` → Yash merges → tester sets `bot:verify` → re-test → `bot:accepted` (closed) or `bot:rejected` (back to the fixer). Side exits: `bot:not-valid` (closed), `bot:needs-yash` (a decision or credential). Severity: `sev:high|med|low`, `ux`.

**Security findings never go public** (the repo is public). The issue says only `Security: finding <slug>`; the details live in `~/.catchline-bot/security/` on the Mini (mode 700).

## Files
- `bot/run.sh loop [--dry-run]`: the forever loop. Polls `STOP` every 5 min, skips a role past its daily run cap, stops starting runs past `DAILY_USD`, backs off 60 min when the host is unhealthy (build-sim exit 2). `--dry-run` prints the plan and exits.
- `bot/run.sh <role>`: guards (STOP file, under 8 GB free, one run at a time via `~/.catchline-bot/lock`, kills leftover `simctl diagnose` / XCTRunner / `maestro mcp` processes), fresh detached checkout of `origin/catchline` in `~/dev/catchline-bot/<role>`, then `claude -p` with the role prompt. The alarm kills the run at 180 min; the prompt carries a soft deadline (stop exploring at 150, report by 165) so a report lands first. After the run, whatever the exit code: on non-zero it logs the last tool call to `loop.log`, then it deletes every test account the tester recorded in `~/.catchline-bot/evidence/<stamp>/accounts.txt` via the `delete-account` edge function.
- Every run gets `--max-budget-usd 15` and writes one line to `~/.catchline-bot/usage.log` (`date time role stamp usd turns exit`, cost from the stream-json `result` event).
- `bot/memory.sh`: the bot's memory, `~/.catchline-bot/memory/{tester,fixer}.md`, append-only lines `<date> | <area or #issue> | <what happened>`. `areas` lists coverage oldest first, `tried <n>` lists the fixer's attempts on an issue. The last 40 lines of each file ride in every prompt.
- `bot/dedupe.sh "<Area>" <words>`: open and closed bot issues matching the area in the title or the words anywhere; the tester runs it before every filing.
- `bot/evidence.sh attach <issue> <pngs>`: downscales, pushes to the orphan `bot-evidence` branch, comments the images inline. Refuses `security` issues.
- `bot/status.sh`: one screen for the phone: STOP state, loop agent, today's spend, last runs, issue counts per label, open bot PRs with CI state, last memory lines. From the laptop: `ssh mini '~/dev/catchline-bot/runner/bot/status.sh'`.
- `bot/build-sim.sh`: Release simulator build of the checkout (no Metro), skipped when that commit is installed. Times `simctl` first: over 5 s it restarts CoreSimulatorService, and if still slow exits 2 (`run.sh` logs "host unhealthy" and skips; 14 Oct a wedged runtime discovery made every simctl call 18 s and killed the maestro driver).
- `bot/prompts/{tester,fixer}.md`: the roles. `bot/settings.json`: deny rules (push to main/catchline, merge, deploys). `bot/mcp.json`: maestro.
- `bot/install.sh`: labels + the launchd agent `com.catchline.bot.loop` (KeepAlive, runs `~/dev/catchline-bot/runner/bot/run.sh loop`, a checkout that holds the loop itself). Removes the old calendar agents.

## On the Mini
- Env (public values only): `~/.config/catchline-bot/env.local` (Supabase URL, publishable key, RevenueCat iOS key).
- Logs: `~/Library/Logs/catchline-bot/` (`loop.log` one line per run; `<role>-<stamp>.log` the full stream, last 30 kept).
- Evidence: `~/.catchline-bot/evidence/`. Reference clips: `~/.catchline-bot/clips/`.
- Pause: `touch ~/.catchline-bot/STOP`. Resume: `rm ~/.catchline-bot/STOP` (the loop agent notices within 5 min). One run by hand: `~/dev/catchline-bot/runner/bot/run.sh tester`. Caps: `~/.catchline-bot/loop.conf` (`RUN_USD`, `DAILY_USD`, `TESTER_RUNS_PER_DAY`, `FIXER_RUNS_PER_DAY`, `COOLDOWN_MIN`).
- Needs Xcode at `/Applications/Xcode.app` with an iOS simulator runtime, OpenJDK 17, Maestro (`~/.maestro/bin`), and `claude` signed in.
