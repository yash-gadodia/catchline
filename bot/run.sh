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
  "$BOT_DIR/build-sim.sh" >>"$LOG" 2>&1 || { say "simulator build failed at $SHA, see $LOG"; exit 1; }
fi

PROMPT="$(cat "$BOT_DIR/prompts/$ROLE.md")

Run context: commit $SHA of origin/catchline, $(date '+%A %d %b %Y %H:%M') SGT. Private security ledger: $HOME_DIR/security/. Reference clips: $HOME_DIR/clips/. Simulator build script: $BOT_DIR/build-sim.sh."

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

ls -t "$LOGS"/"$ROLE"-*.log 2>/dev/null | tail -n +31 | xargs rm -f
exit $CODE
