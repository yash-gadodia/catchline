-- 0009_account.sql
-- delete_my_account() -> void
--
-- Deletes the caller's profile and authored answers, and dissolves their couple
-- (sets status='dissolved', nulls out their membership slot) without removing
-- the partner's account or the partner's own data.
--
-- NOTE: Full auth.users row removal requires a service_role admin step (e.g. via
-- an Edge Function with the service key). That is a Yash/edge-fn follow-up and
-- is intentionally NOT attempted here — client RPCs cannot call admin auth APIs.
--
-- Authorization: caller must be authenticated (auth.uid() is non-null).

-- Widen couples.status check to allow 'dissolved'
alter table public.couples
  drop constraint if exists couples_status_check;

alter table public.couples
  add constraint couples_status_check
    check (status in ('pending', 'active', 'dissolved'));

-- Allow member_a to be NULL so a deleted account can vacate the slot
-- (previously NOT NULL; the couple row is preserved for the partner's history)
alter table public.couples
  alter column member_a drop not null;

-- Replace member_a FK so it SET NULLs on profile delete (defensive belt-and-suspenders)
alter table public.couples
  drop constraint if exists couples_member_a_fkey;

alter table public.couples
  add constraint couples_member_a_fkey
    foreign key (member_a) references public.profiles(id) on delete set null;

-- Replace member_b FK similarly (was already nullable + on delete restrict)
alter table public.couples
  drop constraint if exists couples_member_b_fkey;

alter table public.couples
  add constraint couples_member_b_fkey
    foreign key (member_b) references public.profiles(id) on delete set null;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_couple_id uuid;
  v_is_member_a boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Find the caller's couple (any status)
  select id,
         (member_a = v_uid)
  into   v_couple_id, v_is_member_a
  from   public.couples
  where  (member_a = v_uid or member_b = v_uid)
  limit  1;

  -- Dissolve the couple: mark as dissolved and null out the caller's slot.
  -- The couple row is retained so the partner keeps their history
  -- (drops, learnings, activity all FK to couples.id).
  if v_couple_id is not null then
    if v_is_member_a then
      update public.couples
      set    status   = 'dissolved',
             member_a = null
      where  id = v_couple_id;
    else
      update public.couples
      set    status   = 'dissolved',
             member_b = null
      where  id = v_couple_id;
    end if;
  end if;

  -- Delete the caller's answers (they are the author)
  delete from public.answers
  where  author = v_uid;

  -- Delete the caller's profile row (FK to auth.users on delete cascade,
  -- and now couples FKs are set null so this won't be blocked)
  delete from public.profiles
  where  id = v_uid;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
