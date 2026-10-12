#!/bin/bash
# One-time setup of the Catchline bug loop on the Mac Mini. Safe to re-run.
# Needs: ~/.config/catchline-bot/env.local (public Supabase URL + publishable key + RevenueCat iOS key).
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"
BOT="$HOME/.catchline-bot"
mkdir -p "$BOT/security" "$BOT/evidence" "$BOT/clips" "$HOME/Library/Logs/catchline-bot" "$HOME/dev/catchline-bot"
chmod 700 "$BOT/security"
test -f "$HOME/.config/catchline-bot/env.local" || { echo "missing ~/.config/catchline-bot/env.local"; exit 1; }

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"
while IFS='|' read -r name color desc; do
  gh label create "$name" --color "$color" --description "$desc" --force >/dev/null
done <<'LABELS'
bot|5319e7|Filed or handled by the Catchline bug loop
bot:open|d93f0b|Bot: confirmed, waiting for a fix
bot:in-pr|fbca04|Bot: fix is in an open PR
bot:verify|1d76db|Bot: fix merged, tester to re-test
bot:accepted|0e8a16|Bot: tester confirmed the fix
bot:rejected|b60205|Bot: tester says the fix did not hold
bot:not-valid|cfd3d7|Bot: not a bug
bot:needs-yash|f9d0c4|Bot: blocked on a decision or credential
sev:high|b60205|Blocks a core flow, loses data, or a confidently wrong cue
sev:med|d93f0b|Real bug with a workaround
sev:low|fef2c0|Minor bug
ux|c5def5|Works, but confusing or rough
security|000000|Details in the private ledger, never in public
LABELS

# tester at 02:00 08:00 14:00 20:00, fixer an hour later (the lock serialises overlaps).
plist() {
  local role=$1; shift
  local p="$HOME/Library/LaunchAgents/com.catchline.bot.$role.plist"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    echo "<key>Label</key><string>com.catchline.bot.$role</string>"
    echo "<key>ProgramArguments</key><array><string>/bin/bash</string><string>-lc</string><string>exec \"\$HOME/dev/catchline-bot/runner/bot/run.sh\" $role</string></array>"
    echo '<key>StartCalendarInterval</key><array>'
    for h in "$@"; do echo "<dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>0</integer></dict>"; done
    echo '</array>'
    echo "<key>StandardOutPath</key><string>$HOME/Library/Logs/catchline-bot/launchd-$role.log</string>"
    echo "<key>StandardErrorPath</key><string>$HOME/Library/Logs/catchline-bot/launchd-$role.log</string>"
    echo '</dict></plist>'
  } > "$p"
  launchctl bootout "gui/$(id -u)/com.catchline.bot.$role" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$p"
}
plist tester 2 8 14 20
plist fixer 3 9 15 21
echo "installed: labels, launchd tester + fixer. Stop the loop: touch $BOT/STOP"
