#!/bin/bash
# One screen of bot state, readable on a phone: last runs, today's spend, open bot issues and PRs.
# Usage: bot/status.sh          (on the Mini: ~/dev/catchline-bot/runner/bot/status.sh; from the laptop: ssh mini ...)
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HOME_DIR="$HOME/.catchline-bot"
LOGS="$HOME/Library/Logs/catchline-bot"
REPO="${CATCHLINE_REPO:-yash-gadodia/catchline}"
TODAY=$(date +%F)

echo "catchline bot  $(date '+%a %d %b %H:%M')"
[ -e "$HOME_DIR/STOP" ] && echo "STOPPED (rm $HOME_DIR/STOP to resume)" || echo "running"
if launchctl list 2>/dev/null | grep -q com.catchline.bot.loop; then
  PID=$(launchctl list | awk '/com.catchline.bot.loop/ {print $1}')
  echo "loop agent: loaded (pid ${PID:--})"
else
  echo "loop agent: not loaded (bot/install.sh)"
fi
[ -d "$HOME_DIR/lock" ] && echo "a run holds the lock since $(stat -f '%Sm' -t '%H:%M' "$HOME_DIR/lock")"

echo
touch "$HOME_DIR/usage.log"
echo "today: US\$$(awk -v d="$TODAY" '$1==d {s+=$5} END {printf "%.2f", s+0}' "$HOME_DIR/usage.log"), tester $(awk -v d="$TODAY" '$1==d && $3=="tester"' "$HOME_DIR/usage.log" 2>/dev/null | wc -l | xargs) runs, fixer $(awk -v d="$TODAY" '$1==d && $3=="fixer"' "$HOME_DIR/usage.log" 2>/dev/null | wc -l | xargs) runs"
echo "last runs (date time role stamp usd turns exit):"
tail -5 "$HOME_DIR/usage.log" 2>/dev/null | sed 's/^/  /' || echo "  none"
echo "last loop lines:"
tail -4 "$LOGS/loop.log" 2>/dev/null | cut -c1-110 | sed 's/^/  /'

echo
echo "issues:"
for L in bot:open bot:rejected bot:in-pr bot:verify bot:needs-yash; do
  N=$(gh issue list --repo "$REPO" --label "$L" --state open --json number --jq 'length' 2>/dev/null || echo "?")
  printf "  %-14s %s\n" "$L" "$N"
done
gh issue list --repo "$REPO" --label bot --state open --limit 8 --json number,title,labels --jq '.[] | "  #\(.number) [\(.labels | map(.name) | map(select(startswith("bot:") or startswith("sev:"))) | join(","))] \(.title[0:70])"' 2>/dev/null

echo
echo "bot PRs:"
gh pr list --repo "$REPO" --label bot --state open --json number,title,headRefName,statusCheckRollup --jq '.[] | "  #\(.number) \(.title[0:60])  checks: \((.statusCheckRollup // []) | map(.conclusion // .status) | join(",") | if . == "" then "none" else . end)"' 2>/dev/null || echo "  (gh unavailable)"
[ "$(gh pr list --repo "$REPO" --label bot --state open --json number --jq 'length' 2>/dev/null)" = "0" ] && echo "  none open"

echo
echo "memory (last 3 each):"
tail -3 "$HOME_DIR/memory/tester.md" 2>/dev/null | cut -c1-110 | sed 's/^/  T /'
tail -3 "$HOME_DIR/memory/fixer.md" 2>/dev/null | cut -c1-110 | sed 's/^/  F /'
