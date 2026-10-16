#!/bin/bash
# Catchline bug loop: one headless Claude run as the tester or the fixer, or the loop that alternates them.
# Usage: bot/run.sh tester|fixer            one run (the loop calls these)
#        bot/run.sh loop [--dry-run]        tester, cooldown, fixer, cooldown, forever; --dry-run prints the plan and exits
# See docs/catchline/BOT_LOOP.md.
set -uo pipefail

ROLE="${1:?usage: run.sh tester|fixer|loop [--dry-run]}"
DRY_RUN=0; [ "${2:-}" = "--dry-run" ] && DRY_RUN=1
HOME_DIR="$HOME/.catchline-bot"
BOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS="$HOME/Library/Logs/catchline-bot"
MEMORY="$HOME_DIR/memory"
USAGE="$HOME_DIR/usage.log"
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.maestro/bin:$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
# launchd jobs cannot use the interactive OAuth login (it expires and is not refreshed
# outside a login session). A long-lived token from `claude setup-token` lives in a
# 600 file and is exported for every run.
if [ -f "$HOME/.catchline-bot/claude-token" ]; then
  CLAUDE_CODE_OAUTH_TOKEN="$(cat "$HOME/.catchline-bot/claude-token")"
  export CLAUDE_CODE_OAUTH_TOKEN
fi
export MAESTRO_CLI_NO_ANALYTICS=1
mkdir -p "$HOME_DIR/security" "$MEMORY" "$LOGS"
touch "$MEMORY/tester.md" "$MEMORY/fixer.md" "$USAGE"

# Caps. Override any of these in ~/.catchline-bot/loop.conf (shell syntax).
RUN_USD=15            # --max-budget-usd per claude run
DAILY_USD=40          # stop starting runs once today's spend (from the result events) passes this
TESTER_RUNS_PER_DAY=4
FIXER_RUNS_PER_DAY=4
COOLDOWN_MIN=30       # between runs
UNHEALTHY_BACKOFF_MIN=60   # after build-sim exit 2 (simctl slow)
STOP_POLL_MIN=5
[ -f "$HOME_DIR/loop.conf" ] && . "$HOME_DIR/loop.conf"

say() { echo "$(date '+%F %T') [$ROLE] $*" | tee -a "$LOGS/loop.log"; }
today() { date +%F; }
# usage.log lines: <date> <time> <role> <stamp> <cost_usd> <turns> <exit>
spent_today() { awk -v d="$(today)" '$1==d {s+=$5} END {printf "%.2f", s+0}' "$USAGE"; }
runs_today() { awk -v d="$(today)" -v r="$1" '$1==d && $3==r {n++} END {print n+0}' "$USAGE"; }
over_cap() { awk -v a="$1" -v b="$2" 'BEGIN {exit !(a+0 >= b+0)}'; }

# ---------------------------------------------------------------- loop
if [ "$ROLE" = loop ]; then
  if [ "$DRY_RUN" = 1 ]; then
    echo "catchline bot loop, dry run (nothing started)"
    echo "  runner:        $BOT_DIR"
    echo "  state:         $HOME_DIR  (STOP $([ -e "$HOME_DIR/STOP" ] && echo present || echo absent))"
    echo "  caps:          RUN_USD=$RUN_USD DAILY_USD=$DAILY_USD tester=$TESTER_RUNS_PER_DAY/day fixer=$FIXER_RUNS_PER_DAY/day"
    echo "  timing:        cooldown ${COOLDOWN_MIN}m, unhealthy backoff ${UNHEALTHY_BACKOFF_MIN}m, STOP poll ${STOP_POLL_MIN}m, hard cap 180m per run"
    echo "  today:         US\$$(spent_today) spent, tester $(runs_today tester)/$TESTER_RUNS_PER_DAY, fixer $(runs_today fixer)/$FIXER_RUNS_PER_DAY"
    echo "  memory:        $MEMORY ($(wc -l < "$MEMORY/tester.md" | xargs) tester lines, $(wc -l < "$MEMORY/fixer.md" | xargs) fixer lines)"
    echo "  plan:          tester -> ${COOLDOWN_MIN}m -> fixer -> ${COOLDOWN_MIN}m -> repeat; a role past its daily cap is skipped; STOP pauses the loop"
    echo "  per run:       build-sim (tester only) -> claude -p --max-budget-usd $RUN_USD --max-turns 400 under a 180m alarm -> usage.log -> test-account cleanup"
    for f in "$BOT_DIR/build-sim.sh" "$BOT_DIR/prompts/tester.md" "$BOT_DIR/prompts/fixer.md" "$BOT_DIR/settings.json" "$BOT_DIR/mcp.json" "$HOME/.config/catchline-bot/env.local"; do
      [ -e "$f" ] && echo "  ok             $f" || echo "  MISSING        $f"
    done
    exit 0
  fi
  say "loop start (pid $$)"
  NEXT=tester; CAP_DAY=""
  while :; do
    if [ -e "$HOME_DIR/STOP" ]; then sleep $((STOP_POLL_MIN * 60)); continue; fi
    CAP_VAR="$(echo "$NEXT" | tr a-z A-Z)_RUNS_PER_DAY"
    if over_cap "$(spent_today)" "$DAILY_USD"; then
      [ "$CAP_DAY" = "$(today)" ] || say "daily cap reached (US\$$(spent_today) of $DAILY_USD), sleeping until tomorrow"
      CAP_DAY=$(today); sleep $((COOLDOWN_MIN * 60)); continue
    fi
    if [ "$(runs_today "$NEXT")" -ge "${!CAP_VAR}" ]; then
      OTHER=$([ "$NEXT" = tester ] && echo fixer || echo tester)
      OTHER_CAP="$(echo "$OTHER" | tr a-z A-Z)_RUNS_PER_DAY"
      if [ "$(runs_today "$OTHER")" -ge "${!OTHER_CAP}" ]; then sleep $((COOLDOWN_MIN * 60)); continue; fi
      NEXT=$OTHER; continue
    fi
    "$BOT_DIR/run.sh" "$NEXT"; CODE=$?
    if [ "$CODE" -eq 2 ]; then say "host unhealthy, backing off ${UNHEALTHY_BACKOFF_MIN}m"; sleep $((UNHEALTHY_BACKOFF_MIN * 60))
    else sleep $((COOLDOWN_MIN * 60)); fi
    NEXT=$([ "$NEXT" = tester ] && echo fixer || echo tester)
  done
fi

# ---------------------------------------------------------------- one run
case "$ROLE" in tester|fixer) ;; *) echo "usage: run.sh tester|fixer|loop [--dry-run]"; exit 64;; esac
REPO="$HOME/dev/catchline-bot/$ROLE"
STAMP=$(date +%Y%m%d-%H%M)
LOG="$LOGS/$ROLE-$STAMP.log"

[ -e "$HOME_DIR/STOP" ] && { say "STOP file present, skipping"; exit 0; }

# Reclaim what is safe to rebuild before deciding there is no room (14-10: the Mini hit 6 GB twice in a day).
FREE_GB=$(df -g / | awk 'NR==2 {print $4}')
if [ "$FREE_GB" -lt 15 ]; then
  rm -rf "$HOME_DIR/DerivedData/Build/Intermediates.noindex" "$HOME/Library/Caches/CocoaPods" "$HOME/Library/Caches/Homebrew/downloads"
  xcrun simctl delete unavailable >/dev/null 2>&1
  colima ssh -- sudo fstrim -a >/dev/null 2>&1
  FREE_GB=$(df -g / | awk 'NR==2 {print $4}')
  say "reclaimed space, ${FREE_GB}GB free"
fi
if [ "$FREE_GB" -lt 8 ]; then say "only ${FREE_GB}GB free, skipping (a full disk crashes the Mini silently)"; exit 0; fi

# One bot run at a time on the Mini (16 GB RAM, simulator + builds).
LOCK="$HOME_DIR/lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +240 2>/dev/null)" ]; then say "stale lock, clearing"; rm -rf "$LOCK"; mkdir "$LOCK"
  else say "another run holds the lock, skipping"; exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

# Stragglers from earlier runs (simctl diagnose collectors, XCUITest runners, a maestro MCP server) stack up and slow the host.
pkill -f "simctl diagnose" 2>/dev/null; pkill -f "maestro-driver-ios-config.xctestrun" 2>/dev/null; pkill -f XCTRunner 2>/dev/null; pkill -f "maestro.cli.AppKt mcp" 2>/dev/null

# Fresh checkout of origin/catchline for every run.
if [ ! -d "$REPO/.git" ] && [ ! -f "$REPO/.git" ]; then
  git -C "$HOME/dev/parallax" fetch -q origin catchline
  git -C "$HOME/dev/parallax" worktree add --detach "$REPO" origin/catchline >/dev/null
fi
cd "$REPO" || exit 1
git fetch -q origin
git checkout -q --detach origin/catchline && git reset -q --hard && git clean -qfd -e node_modules -e ios -e .env.local
cp "$HOME/.config/catchline-bot/env.local" .env.local
SHA=$(git rev-parse --short HEAD)
say "start at $SHA, log $LOG"

if [ "$ROLE" = tester ]; then
  "$BOT_DIR/build-sim.sh" >>"$LOG" 2>&1
  BUILD=$?
  [ "$BUILD" -eq 2 ] && { say "host unhealthy (simctl slow even after a CoreSimulator restart), skipping; see $LOG"; exit 2; }
  [ "$BUILD" -ne 0 ] && { say "simulator build failed at $SHA, see $LOG"; exit 1; }
fi

# The alarm below is the hard cap (180 min, no warning). The prompt gets a soft deadline so a report always lands first.
EVIDENCE="$HOME_DIR/evidence/$STAMP"
ACCOUNTS="$EVIDENCE/accounts.txt"
mkdir -p "$EVIDENCE"
PROMPT="$(cat "$BOT_DIR/prompts/$ROLE.md")

Run context: commit $SHA of origin/catchline. Started $(date '+%A %d %b %Y %H:%M') SGT. Hard cap: the process is killed at $(date -v+180M '+%H:%M') SGT with no warning and nothing is flushed. Stop exploring at $(date -v+150M '+%H:%M') SGT; the end-of-run report must be written by $(date -v+165M '+%H:%M') SGT. Evidence folder for this run: $EVIDENCE/. Test accounts file: $ACCOUNTS. Private security ledger: $HOME_DIR/security/. Reference clips: $HOME_DIR/clips/. Memory files: $MEMORY/tester.md and $MEMORY/fixer.md. Bot tools: $BOT_DIR/memory.sh, $BOT_DIR/dedupe.sh, $BOT_DIR/evidence.sh, $BOT_DIR/build-sim.sh. Memory so far (last 40 lines of each file):
--- tester.md ---
$(tail -40 "$MEMORY/tester.md")
--- fixer.md ---
$(tail -40 "$MEMORY/fixer.md")"

# macOS has no timeout(1); perl's alarm caps the run at 3 hours. The dollar cap is the second ceiling.
perl -e 'alarm shift; exec @ARGV' 10800 \
  claude -p "$PROMPT" \
    --settings "$BOT_DIR/settings.json" \
    --mcp-config "$BOT_DIR/mcp.json" \
    --permission-mode bypassPermissions \
    --max-turns 400 \
    --max-budget-usd "$RUN_USD" \
    --output-format stream-json --verbose >>"$LOG" 2>&1
CODE=$?
say "done exit=$CODE"

# Usage ledger from the result event (absent when the alarm killed the run: count the run, cost unknown as 0).
read -r COST TURNS <<<"$(grep '"type":"result"' "$LOG" | tail -1 | python3 -c '
import json, sys
l = sys.stdin.read().strip()
o = json.loads(l) if l else {}
print(round(o.get("total_cost_usd", 0), 2), o.get("num_turns", 0))' 2>/dev/null || echo "0 0")"
echo "$(date '+%F %T') $ROLE $STAMP ${COST:-0} ${TURNS:-0} $CODE" >> "$USAGE"
say "cost US\$${COST:-0}, ${TURNS:-0} turns, US\$$(spent_today) today"

if [ "$CODE" -ne 0 ]; then
  python3 - "$LOG" <<'PY' 2>/dev/null | tee -a "$LOGS/loop.log"
import json, sys
n = 0; last = ""
for l in open(sys.argv[1]):
    if not l.startswith('{"type":"assistant"'): continue
    n += 1
    for b in json.loads(l)["message"]["content"]:
        if b.get("type") == "tool_use":
            last = b["name"] + " " + (b["input"].get("description") or json.dumps(b["input"])[:80])
print(f"ended after {n} assistant turns; last tool call: {last}")
PY
  echo "$(date '+%F %H:%M') | run | exit $CODE at $SHA (killed or errored; see $LOG)" >> "$MEMORY/$ROLE.md"
fi

# Cleanup runs here, not in the model, so a killed run still deletes its test accounts.
# accounts.txt lines: <user id> <access token>; the delete-account edge function deletes the caller.
if [ -s "$ACCOUNTS" ]; then
  SUPABASE_URL=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' "$HOME/.config/catchline-bot/env.local" | cut -d= -f2- | tr -d '"')
  ANON_KEY=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' "$HOME/.config/catchline-bot/env.local" | cut -d= -f2- | tr -d '"')
  while read -r ID TOKEN _; do
    [ -z "$TOKEN" ] && continue
    RES=$(curl -s -m 30 -X POST "$SUPABASE_URL/functions/v1/delete-account" -H "Authorization: Bearer $TOKEN" -H "apikey: $ANON_KEY" -w ' http=%{http_code}')
    say "cleanup $ID: $RES"
  done < "$ACCOUNTS"
else
  say "cleanup: no test accounts recorded"
fi

ls -t "$LOGS"/"$ROLE"-*.log 2>/dev/null | tail -n +31 | xargs rm -f
exit $CODE
