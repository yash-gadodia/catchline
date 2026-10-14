#!/bin/bash
# One-time setup of the Catchline bug loop on the Mac Mini. Safe to re-run.
# Needs: ~/.config/catchline-bot/env.local (public Supabase URL + publishable key + RevenueCat iOS key).
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"
BOT="$HOME/.catchline-bot"
mkdir -p "$BOT/security" "$BOT/evidence" "$BOT/clips" "$BOT/memory" "$HOME/Library/Logs/catchline-bot" "$HOME/dev/catchline-bot"
chmod 700 "$BOT/security"
touch "$BOT/memory/tester.md" "$BOT/memory/fixer.md"
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

# The old calendar agents (tester 02/08/14/20, fixer 03/09/15/21) are replaced by one loop agent that
# launchd keeps alive; run.sh loop alternates the roles with a cooldown and daily caps, and polls STOP.
for role in tester fixer; do
  launchctl bootout "gui/$(id -u)/com.catchline.bot.$role" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.catchline.bot.$role.plist"
done
P="$HOME/Library/LaunchAgents/com.catchline.bot.loop.plist"
cat > "$P" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.catchline.bot.loop</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>-lc</string><string>exec "\$HOME/dev/catchline-bot/runner/bot/run.sh" loop</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>300</integer>
<key>StandardOutPath</key><string>$HOME/Library/Logs/catchline-bot/launchd-loop.log</string>
<key>StandardErrorPath</key><string>$HOME/Library/Logs/catchline-bot/launchd-loop.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/com.catchline.bot.loop" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$P"
echo "installed: labels, launchd loop agent com.catchline.bot.loop (polls STOP every 5 min)."
echo "pause: touch $BOT/STOP    resume: rm $BOT/STOP    status: $REPO_DIR/bot/status.sh"
