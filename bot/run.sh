#!/bin/bash
# Catchline bug loop: one headless Claude run as the tester or the fixer.
# Usage: bot/run.sh tester|fixer      (launchd runs it; see docs/catchline/BOT_LOOP.md)
set -uo pipefail

ROLE="${1:?usage: run.sh tester|fixer}"
HOME_DIR="$HOME/.catchline-bot"
REPO="$HOME/dev/catchline-bot/$ROLE"
BOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS="$HOME/Library/Logs/catchline-bot"
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.maestro/bin:$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export MAESTRO_CLI_NO_ANALYTICS=1
mkdir -p "$HOME_DIR/security" "$LOGS"
STAMP=$(date +%Y%m%d-%H%M)
LOG="$LOGS/$ROLE-$STAMP.log"
say() { echo "$(date '+%F %T') [$ROLE] $*" | tee -a "$LOGS/loop.log"; }

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

Run context: commit $SHA of origin/catchline. Started $(date '+%A %d %b %Y %H:%M') SGT. Hard cap: the process is killed at $(date -v+180M '+%H:%M') SGT with no warning and nothing is flushed. Stop exploring at $(date -v+150M '+%H:%M') SGT; the end-of-run report must be written by $(date -v+165M '+%H:%M') SGT. Evidence folder for this run: $EVIDENCE/. Test accounts file: $ACCOUNTS. Private security ledger: $HOME_DIR/security/. Reference clips: $HOME_DIR/clips/. Simulator build script: $BOT_DIR/build-sim.sh."

# macOS has no timeout(1); perl's alarm caps the run at 3 hours.
perl -e 'alarm shift; exec @ARGV' 10800 \
  claude -p "$PROMPT" \
    --settings "$BOT_DIR/settings.json" \
    --mcp-config "$BOT_DIR/mcp.json" \
    --permission-mode bypassPermissions \
    --max-turns 400 \
    --output-format stream-json --verbose >>"$LOG" 2>&1
CODE=$?
say "done exit=$CODE"

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
