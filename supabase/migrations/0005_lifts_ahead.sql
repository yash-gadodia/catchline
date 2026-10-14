-- 0005_lifts_ahead.sql
-- Queue position for the processing screen. The worker is a single serial
-- machine, so a lift waits behind every queued or processing lift created
-- before it, across all lifters. Owner-only: the caller must own the lift.

create or replace function public.lifts_ahead(p_lift_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.lifts;
begin
  select * into l from public.lifts where id = p_lift_id and user_id = auth.uid();
  if not found then
    raise exception 'lift_not_found';
  end if;
  if l.status not in ('queued', 'processing') then
    return 0;
  end if;
  return (select count(*)::integer
            from public.lifts x
           where x.status in ('queued', 'processing')
             and x.created_at < l.created_at);
end;
$$;

revoke all on function public.lifts_ahead(uuid) from public, anon, authenticated;
grant execute on function public.lifts_ahead(uuid) to authenticated;
