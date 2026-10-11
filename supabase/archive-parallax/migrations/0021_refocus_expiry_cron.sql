-- 0021_refocus_expiry_cron.sql
-- Schedule expire_stale_refocus() hourly (0020 created the function; sessions
-- stuck in waiting_partner >72h flip to 'expired' so the couple can start
-- fresh). Committed in-migration for prod parity per the 0014 pattern.
-- Guarded: local stacks without pg_cron just skip.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job where jobname = 'expire-stale-refocus';
    perform cron.schedule(
      'expire-stale-refocus',
      '30 * * * *',
      'select public.expire_stale_refocus()'
    );
  end if;
exception when others then
  raise notice 'pg_cron not available; skipping schedule: %', sqlerrm;
end $$;
