#!/usr/bin/env bash
# Local end-to-end run of the Catchline backend (Mini only; needs the local stack up).
#   sign up -> consent -> create_lift -> TUS upload -> enqueue -> worker -> analysis + cue
# Usage: scripts/catchline-e2e.sh <clip.mov>
# Needs: supabase, psql, node >= 23.6, uv; @supabase/supabase-js in $E2E_NODE_PATH for the realtime check.
set -euo pipefail
cd "$(dirname "$0")/.."
CLIP=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")

eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|DB_URL|SERVICE_ROLE_KEY|ANON_KEY|PUBLISHABLE_KEY)=')"
ANON_KEY=${ANON_KEY:-$PUBLISHABLE_KEY}
export API_URL ANON_KEY
q() { psql "$DB_URL" -At -c "$1"; }
json() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

EMAIL="e2e-$(date +%s)@catchline.test"
PASS="e2e-$(openssl rand -hex 8)"
curl -sf "$API_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}" >/dev/null
USER_JWT=$(curl -sf "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | json "['access_token']")
export USER_JWT
echo "1. user $EMAIL signed in"

rest() { curl -sS "$API_URL/rest/v1/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT" -H 'Content-Type: application/json' "${@:2}"; }
rest consents -d '{"kind":"upload_privacy","version":"2026-10","granted":true}' -f
LIFT=$(rest rpc/create_lift -d '{"p_movement":"snatch","p_load_kg":60}')
LIFT_ID=$(echo "$LIFT" | json "['id']"); CLIP_PATH=$(echo "$LIFT" | json "['clip_path']")
export LIFT_ID
echo "2. create_lift -> $LIFT_ID status=$(echo "$LIFT" | json "['status']") clip_path=$CLIP_PATH"

node scripts/catchline-e2e-upload.mjs "$CLIP" "$CLIP_PATH"
echo "3. raw-clips object: $(q "select name || ' ' || (metadata->>'size') || ' bytes' from storage.objects where bucket_id='raw-clips' and name='$CLIP_PATH'")"

LISTEN_LOG=$(mktemp)
NODE_PATH=${E2E_NODE_PATH:-} node scripts/catchline-e2e-listen.cjs >"$LISTEN_LOG" 2>&1 &
LISTEN_PID=$!
sleep 3

echo "4. enqueue_lift -> status=$(rest rpc/enqueue_lift -d "{\"p_lift_id\":\"$LIFT_ID\"}" | json "['status']"), queue length=$(q "select queue_length from pgmq.metrics('lift_jobs')")"

echo "5. worker --once"
(cd worker && SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" uv run python -m catchline_worker --once)

wait "$LISTEN_PID" || true
cat "$LISTEN_LOG"

echo "6. results"
q "select 'lift: ' || status || ' error=' || coalesce(error,'-') || ' clip_deleted_at set=' || (clip_deleted_at is not null) from public.lifts where id='$LIFT_ID'"
q "select 'analysis: id=' || (analysis->>'id') || ' movement=' || (analysis->>'movement') || ' reps=' || jsonb_array_length(analysis->'reps') || ' loadKg=' || coalesce(analysis->>'loadKg','-') || ' failure=' || coalesce(analysis->'failure'->>'reason','none') from public.analyses where lift_id='$LIFT_ID'"
q "select 'analysis cue: ' || coalesce(analysis->'cue'->>'faultId','none') || ' | ' || coalesce(analysis->'cue'->>'text','') || ' | ' || coalesce(analysis->'cue'->>'confidence','') from public.analyses where lift_id='$LIFT_ID'"
q "select 'cue row: ' || fault_id || ' | ' || text || ' | status=' || status || ' sessions=' || sessions from public.cues where last_lift_id='$LIFT_ID'"
q "select 'keyframes in bucket: ' || count(*) from storage.objects where bucket_id='keyframes' and name like '%/$LIFT_ID/%'"
q "select 'raw clip objects left: ' || count(*) from storage.objects where bucket_id='raw-clips' and name='$CLIP_PATH'"
q "select 'deletion audit: ' || source || ' ' || name from public.clip_deletions where lift_id='$LIFT_ID'"
q "select 'queue length now: ' || queue_length from pgmq.metrics('lift_jobs')"
echo "7. user reads own analysis over REST: $(rest "analyses?lift_id=eq.$LIFT_ID&select=lift_id" )"
