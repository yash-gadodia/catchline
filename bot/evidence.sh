#!/bin/bash
# Attach screenshots to a bot issue so they show inline on GitHub (and on a phone).
# Usage: evidence.sh attach <issue> <png or mp4>...
# Downscaled copies go to the orphan branch `bot-evidence` under issues/<n>/, pushed, then one comment
# with the images. Refuses issues labelled `security` (the repo is public; those details stay on the Mini).
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
[ "${1:-}" = attach ] || { sed -n '2,5p' "$0"; exit 64; }
ISSUE="${2:?issue number}"; shift 2
[ $# -gt 0 ] || { echo "evidence.sh: nothing to attach"; exit 64; }
REPO="${CATCHLINE_REPO:-yash-gadodia/catchline}"
SRC="${CATCHLINE_SRC:-$HOME/dev/parallax}"
WT="$HOME/dev/catchline-bot/evidence"
BRANCH=bot-evidence

if gh issue view "$ISSUE" --repo "$REPO" --json labels --jq '.labels[].name' | grep -qx security; then
  echo "evidence.sh: #$ISSUE is a security finding, nothing leaves the Mini"; exit 1
fi

if [ ! -e "$WT/.git" ]; then
  git -C "$SRC" fetch -q origin "$BRANCH" 2>/dev/null || true
  if git -C "$SRC" show-ref -q --verify "refs/remotes/origin/$BRANCH"; then
    git -C "$SRC" worktree add -q "$WT" "$BRANCH" 2>/dev/null || git -C "$SRC" worktree add -q -b "$BRANCH" "$WT" "origin/$BRANCH"
  else
    git -C "$SRC" worktree add -q --detach "$WT"
    git -C "$WT" checkout -q --orphan "$BRANCH"
    git -C "$WT" rm -rfq . >/dev/null 2>&1 || true
    printf '# Catchline bot evidence\n\nScreenshots the tester attaches to issues. Nothing here is source.\n' > "$WT/README.md"
    git -C "$WT" add README.md && git -C "$WT" commit -qm "chore(bot): evidence branch"
  fi
fi
cd "$WT"
git fetch -q origin "$BRANCH" 2>/dev/null && git reset -q --hard "origin/$BRANCH" 2>/dev/null || true
mkdir -p "issues/$ISSUE"
BODY="Evidence from the tester (run $(date '+%F %H:%M') SGT):"$'\n\n'
for f in "$@"; do
  [ -f "$f" ] || { echo "evidence.sh: missing $f"; continue; }
  NAME=$(basename "$f")
  case "$NAME" in
    *.png|*.PNG) sips -Z 900 "$f" --out "issues/$ISSUE/$NAME" >/dev/null ;;
    *) cp "$f" "issues/$ISSUE/$NAME" ;;
  esac
  URL="https://raw.githubusercontent.com/$REPO/$BRANCH/issues/$ISSUE/$NAME"
  case "$NAME" in *.png|*.PNG) BODY+="![$NAME]($URL)"$'\n' ;; *) BODY+="[$NAME]($URL)"$'\n' ;; esac
done
git add "issues/$ISSUE"
git commit -qm "evidence: #$ISSUE $(date '+%F %H:%M')" || { echo "evidence.sh: nothing new to commit"; exit 0; }
git push -q origin "$BRANCH"
gh issue comment "$ISSUE" --repo "$REPO" --body "$BODY" >/dev/null
echo "evidence.sh: attached $# file(s) to #$ISSUE"
