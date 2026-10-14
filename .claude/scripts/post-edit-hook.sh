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

out=""
if grep -n '@ts-ignore' "$f" >/dev/null 2>&1; then
  out="$f uses @ts-ignore — the repo bans it. Use one documented // @ts-expect-error only for the known supabase-js quirk."
fi
case "$f" in
  *.test.ts|*.test.tsx)
    if grep -q 'expect(<' "$f" 2>/dev/null; then
      out="$out
$f looks like a hollow test (expect(<JSX/>) is always truthy). render() and assert real content — see .claude/rules/testing.md."
    fi ;;
esac

if [ -n "$out" ]; then
  printf '%s\n' "$out" | sed '/^$/d' | head -25 >&2
  exit 2
fi
exit 0
