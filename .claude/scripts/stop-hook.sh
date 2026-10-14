#!/usr/bin/env bash
# Stop: typecheck once per turn, only when this session edited .ts/.tsx (the
# post-edit hook drops the marker). Blocks with exit 2 up to max_attempts, then
# clears the marker and warns so an unfixable failure never blocks forever.
set -u

cache="$CLAUDE_PROJECT_DIR/.claude/.cache"
max_attempts=3

payload=$(cat 2>/dev/null || true)
sid=$(printf '%s' "$payload" | jq -r '.session_id // "default"' 2>/dev/null | tr -cd 'A-Za-z0-9._-')
[ -n "$sid" ] || sid="default"

marker="$cache/typecheck-needed.$sid"
attempts_file="$cache/typecheck-attempts.$sid"

[ -f "$marker" ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

out=$(npx tsc --noEmit --incremental --tsBuildInfoFile .tsbuildinfo 2>&1)
if [ $? -eq 0 ]; then
  rm -f "$marker" "$attempts_file"
  exit 0
fi

attempts=$(cat "$attempts_file" 2>/dev/null || echo 0)
case "$attempts" in '' | *[!0-9]*) attempts=0 ;; esac
attempts=$((attempts + 1))

if [ "$attempts" -ge "$max_attempts" ]; then
  rm -f "$marker" "$attempts_file"
  {
    echo "$out" | tail -25
    echo
    echo "── Typecheck still failing after $max_attempts attempts — leaving it for a human. Marker cleared; it re-arms on the next .ts/.tsx edit. Run npm run typecheck to debug. ──"
  } >&2
  exit 0
fi

echo "$attempts" > "$attempts_file"
{
  echo "$out" | tail -25
  echo
  echo "── Typecheck failed. Fix the above before finishing (attempt $attempts/$max_attempts). ──"
} >&2
exit 2
