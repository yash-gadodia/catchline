-- ============================================================================
-- FIX: select_partner_profile could never see the partner's profile.
--
-- The original policy's couples subquery referenced an UNQUALIFIED `id` to mean
-- the outer profiles row. But `public.couples` also has an `id` column, so name
-- resolution bound `id` to couples.id (inner scope), making the check
-- effectively `c.member_b = c.id` / `c.member_a = c.id` — always false. A member
-- could therefore never read their partner's display_name (app fell back to a
-- hardcoded "Dani"). Qualify the reference as profiles.id.
-- ============================================================================

drop policy if exists "select_partner_profile" on public.profiles;

create policy "select_partner_profile"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.couples c
      where c.status = 'active'
        and (
          (c.member_a = auth.uid() and c.member_b = profiles.id)
          or (c.member_b = auth.uid() and c.member_a = profiles.id)
        )
    )
  );
