#!/bin/bash
# The bot's memory between runs: two append-only files under ~/.catchline-bot/memory/.
# Usage: memory.sh note tester|fixer "<area or #issue>" "<what happened>"
#        memory.sh recent tester|fixer [n]        last n lines (default 40)
#        memory.sh areas                          tester coverage per area, oldest first (pick from the top)
#        memory.sh tried <issue>                  fixer lines about one issue (two failures = do not retry)
# Line format: <YYYY-MM-DD HH:MM> | <area or #issue> | <what happened>
set -euo pipefail
MEMORY="$HOME/.catchline-bot/memory"
mkdir -p "$MEMORY"
AREAS="onboarding filming analysis lifts trends you paywall share coach-link account api offline"
case "${1:-}" in
  note)
    ROLE="${2:?role}"; KEY="${3:?area or #issue}"; WHAT="${4:?what happened}"
    echo "$(date '+%F %H:%M') | $KEY | $WHAT" >> "$MEMORY/$ROLE.md" ;;
  recent)
    ROLE="${2:?role}"; tail -n "${3:-40}" "$MEMORY/$ROLE.md" 2>/dev/null || true ;;
  areas)
    for a in $AREAS; do
      LAST=$(grep -F "| $a |" "$MEMORY/tester.md" 2>/dev/null | tail -1 | cut -d'|' -f1 | xargs)
      echo "${LAST:-never} $a"
    done | sort ;;
  tried)
    N="${2:?issue number}"; grep -F "| #${N#\#} |" "$MEMORY/fixer.md" 2>/dev/null || true ;;
  *) sed -n '2,7p' "$0"; exit 64 ;;
esac
