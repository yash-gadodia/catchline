-- 0018_reactions.sql
-- IMPROVEMENT_PLAN.md 1.5: per-prompt reactions on the reveal — one tap, emoji,
-- the partner sees it live. The discussion about WHY you guessed wrong is the
-- real payload; the reaction is its cheapest opener.
--
-- Design decisions:
--   * Plain RLS, NO SECURITY DEFINER RPC. A reaction is a self-authored row
--     (author = auth.uid()) — never a cross-partner write — and the reveal
--     gate ("no reacting before the reveal") is directly expressible in the
--     insert/update policies with the same couple_drops-state idiom as the
--     answers_select_partner_revealed policy (0002). A DEFINER function would
--     add attack surface without adding any capability.
--   * Table-level DML grant per the 0006 lesson: default privileges give
--     authenticated no DML, so without the grant the table is invisible to
--     logged-in users. RLS still gates rows.
--   * Realtime: no prior migration manages the supabase_realtime publication
--     (couple_drops/couples were enabled in the hosted dashboard), so this
--     migration adds reactions to it idempotently — the partner's reaction
--     appears live locally AND in prod with no dashboard step. Realtime
--     respects RLS, so pre-reveal rows (which cannot exist) would not leak
--     anyway.

create table if not exists public.reactions (
  id uuid not null primary key default gen_random_uuid(),
  couple_drop_id uuid not null references public.couple_drops(id) on delete cascade,
  prompt_id uuid not null references public.drop_prompts(id),
  author uuid not null references public.profiles(id),
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz default now(),
  unique(couple_drop_id, prompt_id, author)
);

alter table public.reactions enable row level security;

-- 0006 lesson: grants open the door, RLS gates the rows.
grant select, insert, update, delete on public.reactions to authenticated;

-- SELECT: any member of the couple can read the reactions on their drop.
drop policy if exists "reactions_select_member" on public.reactions;
create policy "reactions_select_member"
  on public.reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.couple_drops cd
      join public.couples c on c.id = cd.couple_id
      where cd.id = couple_drop_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- INSERT: only your own reaction, only on your couple's drop, and ONLY once
-- the drop is revealed — reacting before the reveal is impossible (same
-- reveal-gate idiom as answers_select_partner_revealed, 0002).
drop policy if exists "reactions_insert_author_revealed" on public.reactions;
create policy "reactions_insert_author_revealed"
  on public.reactions
  for insert
  to authenticated
  with check (
    author = auth.uid()
    and exists (
      select 1
      from public.couple_drops cd
      join public.couples c on c.id = cd.couple_id
      where cd.id = couple_drop_id
        and cd.state = 'revealed'
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- UPDATE: the author may replace their own reaction (the tap-again upsert),
-- under the same revealed gate.
drop policy if exists "reactions_update_author_revealed" on public.reactions;
create policy "reactions_update_author_revealed"
  on public.reactions
  for update
  to authenticated
  using (
    author = auth.uid()
    and exists (
      select 1
      from public.couple_drops cd
      join public.couples c on c.id = cd.couple_id
      where cd.id = couple_drop_id
        and cd.state = 'revealed'
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  )
  with check (
    author = auth.uid()
    and exists (
      select 1
      from public.couple_drops cd
      join public.couples c on c.id = cd.couple_id
      where cd.id = couple_drop_id
        and cd.state = 'revealed'
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- Realtime: publish reactions so the partner's tap shows up live (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;
end
$$;
