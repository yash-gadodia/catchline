-- 0019_expire_stale_uploads.sql
-- A lift is charged at create_lift and sits in 'uploading' until enqueue_lift
-- or start_device_analysis. When the app dies mid-upload nothing moves it on:
-- the app shows it failed after 15 minutes (STALE_UPLOAD_MS, src/data/library.ts)
-- and says the video was not used, but purge_storage only expired and refunded
-- it after 23h50m (#82). expire_stale_uploads fails and refunds it at the same
-- 15 minutes, every minute on pg_cron. purge_storage then deletes any clip it left.

create or replace function public.expire_stale_uploads(p_max_age interval default interval '15 minutes')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lift uuid;
  v_count integer := 0;
begin
  for v_lift in
    select id from public.lifts
     where status = 'uploading' and created_at < now() - p_max_age
       for update skip locked
  loop
    update public.lifts set status = 'failed', error = 'expired', processed_at = now() where id = v_lift;
    perform public.refund_lift(v_lift);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_uploads(interval) from public, anon, authenticated;
grant execute on function public.expire_stale_uploads(interval) to service_role;

select cron.unschedule('catchline-expire-uploads') where exists (select 1 from cron.job where jobname = 'catchline-expire-uploads');
select cron.schedule('catchline-expire-uploads', '* * * * *', 'select public.expire_stale_uploads()');
