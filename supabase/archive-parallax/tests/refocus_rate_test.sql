-- ============================================================================
-- REFOCUS RATE-LIMIT TEST
-- claim_refocus_slot() allows up to p_limit calls per window for a user, then
-- blocks; and rejects calls with no authenticated user. Hermetic, rolled back.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(4);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
          'authenticated', 'authenticated', 'rl-user@test.com', '', now(), now(), now())
  on conflict do nothing;
  insert into public.profiles (id, display_name)
  values ('c1c1c1c1-0000-0000-0000-000000000001'::uuid, 'RLUser')
  on conflict (id) do update set display_name = excluded.display_name;

  -- ---- as the user, limit 2 per window ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','c1c1c1c1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select is(public.claim_refocus_slot(2, 3600), true,  'call 1/2 allowed');
  select is(public.claim_refocus_slot(2, 3600), true,  'call 2/2 allowed');
  select is(public.claim_refocus_slot(2, 3600), false, 'call 3 over the limit -> blocked');
  reset role;

  -- ---- no authenticated user (null uid) -> rejected ----
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('role','authenticated')::text, true);
  select is(public.claim_refocus_slot(2, 3600), false, 'null auth.uid() -> rejected');
  reset role;

  select * from finish();
rollback;
