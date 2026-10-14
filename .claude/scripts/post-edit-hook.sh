#!/usr/bin/env bash
# PostToolUse: arm this session's Stop-hook gate when it edits TypeScript, then
# run the file-scoped guards on the edited file (output capped at 25 lines).
set -u

payload=$(cat)
f=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
sid=$(printf '%s' "$payload" | jq -r '.session_id // "default"' 2>/dev/null | tr -cd 'A-Za-z0-9._-')
[ -n "$sid" ] || sid="default"

case "$f" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

mkdir -p "$CLAUDE_PROJECT_DIR/.claude/.cache"
: > "$CLAUDE_PROJECT_DIR/.claude/.cache/typecheck-needed.$sid"

[ -f "$f" ] || exit 0

out=$(cd "$CLAUDE_PROJECT_DIR" && npx tsx scripts/check-all.ts "$f" 2>&1)
if [ $? -ne 0 ]; then
  total=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
  printf '%s\n' "$out" | head -25 >&2
  [ "$total" -gt 25 ] && echo "[post-edit-hook] …$((total - 25)) more line(s) truncated (of $total); run npm run check." >&2
  exit 2
fi
exit 0
