#!/bin/bash
# The fixer's only way to ship: an over-the-air update of the checked-out commit to 10% of phones on this commit's
# runtime, logged for the daily promotion (promote.sh) and announced on Telegram.
#   bot/publish.sh "<what changed, one line>" "<PR numbers, e.g. #240 #241>"
# It refuses unless HEAD is exactly origin/catchline (a merged state), and scripts/ota.sh refuses unless every check
# passes. ~/.catchline-bot/HOLD stops publishing and promotion.
set -euo pipefail
export PATH=/opt/homebrew/bin:$PATH
MSG="${1:?usage: publish.sh \"<message>\" \"<PRs>\"}"; PRS="${2:-}"
HOME_DIR="$HOME/.catchline-bot"; LEDGER="$HOME_DIR/rollouts.log"
[ -e "$HOME_DIR/HOLD" ] && { echo "publish: HOLD file present, not publishing"; exit 3; }
git fetch -q origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/catchline)" ] || { echo "publish: HEAD is not origin/catchline"; exit 4; }
git diff --quiet HEAD || { echo "publish: tree is not clean"; exit 4; }
OUT=$(MINI=localhost scripts/ota.sh publish "$MSG" --rollout 10 --go 2>&1) || { echo "$OUT" | tail -30; echo "publish: ota.sh refused"; exit 5; }
GROUP=$(echo "$OUT" | sed -n 's/^Update group ID *//p' | head -1)
RUNTIME=$(echo "$OUT" | sed -n 's/^Runtime version *//p' | head -1)
[ -n "$GROUP" ] || { echo "$OUT" | tail -20; echo "publish: no update group in the output"; exit 5; }
echo "$(date +%s) $GROUP $RUNTIME 10 $(git rev-parse --short HEAD) $PRS" >> "$LEDGER"
"$(dirname "$0")/notify.sh" "Catchline bot shipped to 10% of phones on $RUNTIME: $MSG $PRS
Goes to everyone in 24 h. To stop it: touch ~/.catchline-bot/HOLD on the Mini, or tell Claude to roll back $GROUP."
echo "publish: $GROUP on $RUNTIME at 10%"
