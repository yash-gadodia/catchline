-- Local-only seed for Catchline (runs on `supabase db reset`). Intentionally empty:
-- pgTAP tests create their own rows, and the vault secrets the clip purge job
-- needs are set by scripts/catchline-local-secrets.sh after each reset.
select 1;
