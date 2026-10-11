-- 0008_unpair.sql
-- unpair(p_couple uuid) -> void
--
-- Dissolves a couple by deleting the couple row. Because couple_drops,
-- activity, and learnings all have ON DELETE CASCADE from couples, this
-- cleanly removes all associated data. profiles are NOT touched.
--
-- Authorization: caller must be a member of p_couple.
-- Non-member callers get a raised exception (not a silent no-op).

create or replace function public.unpair(p_couple uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard: caller must be a member of this couple
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  delete from public.couples where id = p_couple;
end;
$$;

grant execute on function public.unpair(uuid) to authenticated;
