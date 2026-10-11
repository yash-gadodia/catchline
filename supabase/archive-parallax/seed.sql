-- LOCAL-ONLY seed (runs on `supabase db reset`; never applied to prod).
-- 0014 revokes sim_partner_submit for prod parity; re-grant it locally so the
-- solo dev loop (seeded test user + simulated partner) still works.
grant execute on function public.sim_partner_submit(uuid) to authenticated;
