#!/usr/bin/env bash
# Put the local stack's API URL + service key into Vault so purge_storage (0003)
# can call the Storage API. Run after every `supabase db reset` (reset wipes Vault).
# Local only: the key comes from `supabase status`, never from a file in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."

eval "$(supabase status -o env 2>/dev/null | grep -E '^(DB_URL|SERVICE_ROLE_KEY)=')"
project_id=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)
# purge_storage runs inside the db container, so it reaches Kong by container name.
api_url="http://supabase_kong_${project_id}:8000"

psql "$DB_URL" -q -v ON_ERROR_STOP=1 -v url="$api_url" -v key="$SERVICE_ROLE_KEY" <<'SQL'
delete from vault.secrets where name in ('catchline_api_url', 'catchline_service_key');
select vault.create_secret(:'url', 'catchline_api_url');
select vault.create_secret(:'key', 'catchline_service_key');
SQL
echo "vault: catchline_api_url=$api_url, catchline_service_key set"
