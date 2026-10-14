#!/usr/bin/env bash
# Health-check (and optionally auto-fix) the local dev environment.
# Catches the things that have actually broken local dev: Docker on the Mini down,
# Supabase not running, and a stale .env (wrong Supabase URL or anon key).
#
# Usage:
#   ./scripts/doctor.sh        # report only
#   ./scripts/doctor.sh --fix  # fix what it can (start services, sync .env, seed user)
set -uo pipefail
cd "$(dirname "$0")/.."

FIX=0; [ "${1:-}" = "--fix" ] && FIX=1
ok(){ echo "✅ $1"; }; warn(){ echo "⚠️  $1"; }; bad(){ echo "❌ $1"; }
fixes=0

# 1. Docker on the Mac Mini (never on the laptop)
MINI='export PATH=/opt/homebrew/bin:$PATH;'
if ssh -o ConnectTimeout=5 mini "$MINI docker ps" >/dev/null 2>&1; then ok "Docker (colima) running on the Mini"; else
  bad "Docker not reachable on the Mini (ssh mini docker ps)"
  if [ $FIX -eq 1 ]; then echo "   → colima start on the Mini…"
    ssh mini "$MINI colima start" >/dev/null 2>&1 && { ok "colima up on the Mini"; fixes=$((fixes+1)); } || { bad "colima didn't start — ssh mini and check"; exit 1; }
  else echo "   → fix: ssh mini 'colima start' (or run with --fix)"; fi
fi

# 2. Supabase reachable on loopback
URL="http://127.0.0.1:54321"
if [ "$(curl -s -m4 -o /dev/null -w '%{http_code}' "$URL/rest/v1/" 2>/dev/null)" = "200" ]; then
  ok "Supabase reachable at $URL"
else
  bad "Supabase not reachable at $URL"
  if [ $FIX -eq 1 ]; then echo "   → supabase start…"; supabase start >/dev/null 2>&1 && { ok "Supabase started"; fixes=$((fixes+1)); } || bad "supabase start failed (another project on the ports? stop it)"; else echo "   → fix: supabase start"; fi
fi

# 3. .env in sync with the running Supabase (URL on loopback + correct anon key)
LIVE_ANON=$(supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY=//p' | tr -d '"')
ENV_URL=$(sed -n 's/^EXPO_PUBLIC_SUPABASE_URL=//p' .env 2>/dev/null)
ENV_ANON=$(sed -n 's/^EXPO_PUBLIC_SUPABASE_ANON_KEY=//p' .env 2>/dev/null)
need_env_fix=0
[ "$ENV_URL" = "$URL" ] && ok ".env URL is loopback (simulator-reachable)" || { warn ".env URL is '$ENV_URL' (sim needs $URL; LAN IP for a physical phone)"; need_env_fix=1; }
if [ -n "$LIVE_ANON" ] && [ "$ENV_ANON" = "$LIVE_ANON" ]; then ok ".env anon key matches running Supabase"; else warn ".env anon key is stale (doesn't match supabase status)"; need_env_fix=1; fi
if [ $need_env_fix -eq 1 ]; then
  if [ $FIX -eq 1 ] && [ -n "$LIVE_ANON" ]; then
    sed -i '' "s|^EXPO_PUBLIC_SUPABASE_URL=.*|EXPO_PUBLIC_SUPABASE_URL=$URL|" .env
    sed -i '' "s|^EXPO_PUBLIC_SUPABASE_ANON_KEY=.*|EXPO_PUBLIC_SUPABASE_ANON_KEY=$LIVE_ANON|" .env
    ok "Synced .env (restart Metro with --clear to pick it up)"; fixes=$((fixes+1))
  else echo "   → fix: set URL=$URL and the anon key from 'supabase status' (or run with --fix)"; fi
fi

# 4. Test user
if [ $FIX -eq 1 ]; then ./scripts/seed-test-user.sh >/dev/null 2>&1 && ok "Test user ready (test@parallax.app / parallax123)"; fi

# 5. Metro
curl -s -m2 "http://127.0.0.1:8081/status" 2>/dev/null | grep -q "packager-status:running" && ok "Metro running on 8081" || warn "Metro not running (npm start). If .env changed, start with: npx expo start --clear"

echo ""
[ $FIX -eq 1 ] && echo "Doctor applied $fixes fix(es)." || echo "Run with --fix to auto-repair."
