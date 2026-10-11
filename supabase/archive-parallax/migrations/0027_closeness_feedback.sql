-- 0027_closeness_feedback.sql
-- Post-reveal micro-feedback (Paired's pattern): "did tonight bring you two
-- closer?" — one boolean per member per revealed drop. Feeds the north-star
-- metric (does the loop actually build closeness) without adding any surface
-- the couple has to perform for.
--
-- Design decisions:
--   * PRIVACY (laws #2/#8): the answer is the author's OWN signal. The SELECT
--     policy is author-only — the partner must never read "not really"; an
--     honest 😐 that leaks becomes relationship ammunition / guilt-debt.
--   * Writes go through a SECURITY DEFINER RPC (record_closeness) that
--     verifies couple membership + that the drop is revealed, then upserts —
--     no INSERT/UPDATE policy exists, so the table is read-only to clients.
--   * Grants per the 0006 lesson: default privileges give authenticated no
--     DML, so the table needs an explicit `grant select` to be visible at
--     all; RLS scopes rows. Execute on the RPC to authenticated only.

create table if not exists public.closeness_feedback (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  couple_drop_id uuid not null references public.couple_drops(id) on delete cascade,
  author uuid not null references public.profiles(id) on delete cascade,
  closer boolean not null,
  created_at timestamptz default now(),
  unique(couple_drop_id, author)
);

alter table public.closeness_feedback enable row level security;

-- 0006 lesson: the grant opens the door, RLS gates the rows. SELECT only —
-- writes are the RPC's job.
grant select on public.closeness_feedback to authenticated;

-- SELECT: the author reads their own signal. NOT the couple — never the partner.
drop policy if exists "closeness_select_author" on public.closeness_feedback;
create policy "closeness_select_author"
  on public.closeness_feedback
  for select
  to authenticated
  using (author = auth.uid());

create or replace function public.record_closeness(p_couple_drop uuid, p_closer boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid;
  v_state text;
begin
  select cd.couple_id, cd.state into v_couple, v_state
  from public.couple_drops cd
  join public.couples c on c.id = cd.couple_id
  where cd.id = p_couple_drop
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_couple is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_state <> 'revealed' then
    raise exception 'closeness feedback opens at the reveal';
  end if;

  insert into public.closeness_feedback (couple_id, couple_drop_id, author, closer)
  values (v_couple, p_couple_drop, auth.uid(), p_closer)
  on conflict (couple_drop_id, author)
  do update set closer = excluded.closer;
end;
$$;

revoke all on function public.record_closeness(uuid, boolean) from public;
grant execute on function public.record_closeness(uuid, boolean) to authenticated;
