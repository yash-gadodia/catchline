#!/bin/bash
# Telegram message to Yash from the bot loop: bot/notify.sh "<text>"
TOKEN=$(python3 -c "
import sys, os
sys.path.insert(0, os.path.expanduser('~/.openclaw/scripts/lib'))
import openclaw_refs as ocr
print(ocr.bot_token_or_none('clawrence') or '')
" 2>/dev/null)
[ -n "$TOKEN" ] || { echo "notify: no token"; exit 0; }
curl -s --max-time 10 -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" -d chat_id=166637821 --data-urlencode text="$1" >/dev/null && echo "notify: sent"
