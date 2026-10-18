#!/usr/bin/env bash
# Publish or roll back a production OTA, with the checks the hand recipe kept missing.
#   scripts/ota.sh publish "<message>" [--rollout <1-100>] [--go]
#   scripts/ota.sh rollback <update-group-id> [--go]
#   scripts/ota.sh live                       the update production phones get right now
# Without --go it runs every check and prints the eas command instead of running it.
# Publish checks: a clean tracked tree, the native-surface guard, npm run qa. It passes the
# eas.json production `env` block on the command line, because `eas update` reads only the EAS
# environment and silently drops it (EXPO_PUBLIC_ON_DEVICE_POSE=1 lives there, 18-10-2026).
# Rollback republishes an earlier group to production; find one with
#   npx eas-cli update:list --branch production --json
# A JS-only rollback is always safe; a bad migration or worker change is fixed forward.
set -euo pipefail
cd "$(dirname "$0")/.."

EAS=(npx --yes eas-cli@latest)
PROJECT_ID=$(node -p "require('./app.json').expo.extra.eas.projectId")
RUNTIME=$(node -p "require('./app.json').expo.version")
GO=0
ROLLOUT=""
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --go) GO=1 ;;
    --rollout) ROLLOUT="$2"; shift ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done
CMD="${ARGS[0]:-}"

live() {
  curl -sS "https://u.expo.dev/$PROJECT_ID" \
    -H "expo-runtime-version: $RUNTIME" -H 'expo-channel-name: production' -H 'expo-platform: ios' \
    -H 'expo-protocol-version: 1' -H 'accept: multipart/mixed' -H 'cache-control: no-cache' |
    grep -o '"id":"[0-9a-f-]*"' | head -1 | cut -d'"' -f4
}

run() {
  echo "+ $*"
  if [ "$GO" = 1 ]; then "$@"; else echo "dry run: add --go to run it"; fi
}

case "$CMD" in
  publish)
    MESSAGE="${ARGS[1]:?usage: scripts/ota.sh publish \"<message>\" [--rollout N] [--go]}"
    git diff --quiet HEAD || { echo "ota: tracked changes are not committed; the bundle must equal a commit."; exit 1; }
    npx tsx scripts/check-native-surface.ts
    npm run qa
    ENV_ARGS=()
    while IFS= read -r kv; do [ -n "$kv" ] && ENV_ARGS+=("$kv"); done < <(
      node -e "const e=require('./eas.json').build.production.env||{};for(const k in e)console.log(k+'='+e[k])"
    )
    EXTRA=()
    [ -n "$ROLLOUT" ] && EXTRA+=(--rollout-percentage "$ROLLOUT")
    echo "ota: runtime $RUNTIME, commit $(git rev-parse --short HEAD), was live: $(live)"
    run env "${ENV_ARGS[@]+"${ENV_ARGS[@]}"}" "${EAS[@]}" update --channel production --environment production \
      --message "$MESSAGE ($(git rev-parse --short HEAD))" "${EXTRA[@]+"${EXTRA[@]}"}" --non-interactive
    if [ "$GO" = 1 ]; then echo "ota: live now: $(live) (a rollout below 100% may still serve the old one)"; fi
    ;;
  rollback)
    GROUP="${ARGS[1]:?usage: scripts/ota.sh rollback <update-group-id> [--go]}"
    echo "ota: was live: $(live)"
    run "${EAS[@]}" update:republish --group "$GROUP" --destination-channel production \
      --message "rollback to $GROUP" --non-interactive
    if [ "$GO" = 1 ]; then echo "ota: live now: $(live)"; fi
    ;;
  live)
    live
    ;;
  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
