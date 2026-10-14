#!/bin/bash
# Before filing: find bot issues (open and closed) about the same screen or symptom.
# Usage: dedupe.sh "<Area>" <keyword>...      e.g. dedupe.sh "Lifts" row tap trends
# Prints matching issues as "<number> <state> [labels] <title>"; exit 1 when there is at least one match.
set -uo pipefail
AREA="${1:?area}"; shift
WORDS="$*"
REPO="${CATCHLINE_REPO:-yash-gadodia/catchline}"
JQ='.[] | "\(.number) \(.state) [\(.labels | map(.name) | join(","))] \(.title)"'
{
  gh issue list --repo "$REPO" --label bot --state all --limit 50 --search "in:title \"$AREA:\"" --json number,state,title,labels --jq "$JQ"
  [ -n "$WORDS" ] && gh issue list --repo "$REPO" --label bot --state all --limit 50 --search "$WORDS" --json number,state,title,labels --jq "$JQ"
} 2>/dev/null | sort -n -u -k1,1 > "${TMPDIR:-/tmp}/dedupe.$$"
cat "${TMPDIR:-/tmp}/dedupe.$$"
N=$(wc -l < "${TMPDIR:-/tmp}/dedupe.$$"); rm -f "${TMPDIR:-/tmp}/dedupe.$$"
[ "$N" -eq 0 ]
