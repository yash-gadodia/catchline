-- ============================================================================
-- PAIRING + HISTORY TEST (0024): invite expiry, regenerate_invite, and the
-- history contract dropDetail depends on (couple_drop_id + stored-wave truth).
-- Hermetic; one rolled-back transaction.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(9);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('e1e1e1e1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'ph-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 4) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('e1e1e1e1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'PH' || n
  from generate_series(1, 4) n
  on conflict (id) do nothing;

  -- C1: pending, invite issued 20 days ago (expired).
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, freezes_remaining, invite_issued_at)
  values ('e4e4e4e4-0000-0000-0000-000000000001'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000001'::uuid, null,
          'PH-EXPIRED-1', 'pending', null, 0, 0, now() - interval '20 days');

  -- C2: active couple with a revealed drop that has a STORED wave (caught up).
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, freezes_remaining)
  values ('e4e4e4e4-0000-0000-0000-000000000002'::uuid,
          'e1e1e1e1-0000-0000-0000-000000000003'::uuid, 'e1e1e1e1-0000-0000-0000-000000000004'::uuid,
          'PH-ACTIVE-2', 'active', '2024-01-01', 1, 0);

  insert into public.drops (id, code, title, theme)
  values ('e2e2e2e2-0000-0000-0000-000000000001'::uuid, 'ph-drop', 'PH Drop', null);
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values ('e3e3e3e3-0000-0000-0000-000000000001'::uuid, 'e2e2e2e2-0000-0000-0000-000000000001'::uuid, 0, '☕', 'Q?', array['A','B']);

  insert into public.couple_drops (id, couple_id, drop_id, date, state, wave_pct, caught_up)
  values ('e5e5e5e5-0000-0000-0000-000000000001'::uuid,
          'e4e4e4e4-0000-0000-0000-000000000002'::uuid,
          'e2e2e2e2-0000-0000-0000-000000000001'::uuid,
          '2026-06-30', 'revealed', 80, true);

  -- Raw answers say 100% (both hunches hit) — the STORED 80 must win.
  insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
  values
    ('e5e5e5e5-0000-0000-0000-000000000001'::uuid, 'e3e3e3e3-0000-0000-0000-000000000001'::uuid, 'e1e1e1e1-0000-0000-0000-000000000003'::uuid, 0, 0),
    ('e5e5e5e5-0000-0000-0000-000000000001'::uuid, 'e3e3e3e3-0000-0000-0000-000000000001'::uuid, 'e1e1e1e1-0000-0000-0000-000000000004'::uuid, 0, 0);

  -- ---- invite expiry --------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.join_couple('PH-EXPIRED-1')$q$,
    'This invite code has expired — ask them to send a fresh one',
    'a 20-day-old invite code is refused'
  );

  -- ---- regenerate_invite ------------------------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select isnt(
    (select public.regenerate_invite('e4e4e4e4-0000-0000-0000-000000000001'::uuid)),
    'PH-EXPIRED-1',
    'the pending inviter mints a fresh code'
  );

  reset role;
  select is(
    (select invite_issued_at > now() - interval '1 minute'
     from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000001'::uuid),
    true,
    'regeneration restarts the 14-day clock'
  );

  -- Fresh code now joins fine. Stash it as superuser (RLS correctly hides the
  -- pending couple from the joiner until they join) in a granted temp table.
  create temp table _ph_code as
  select invite_code as new_code
  from public.couples where id = 'e4e4e4e4-0000-0000-0000-000000000001'::uuid;
  grant select on _ph_code to authenticated;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.join_couple((select new_code from _ph_code))$q$,
    'the regenerated code joins'
  );

  -- Non-member cannot regenerate; active couples cannot either.
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.regenerate_invite('e4e4e4e4-0000-0000-0000-000000000001'::uuid)$q$,
    'Unauthorized: not a pending member of this couple',
    'regenerate is refused for non-members / non-pending couples'
  );

  -- ---- couple_history contract ---------------------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (select h.couple_drop_id from public.couple_history('e4e4e4e4-0000-0000-0000-000000000002'::uuid) h limit 1),
    'e5e5e5e5-0000-0000-0000-000000000001'::uuid,
    'history rows carry couple_drop_id (dropDetail renders the real drop)'
  );

  select is(
    (select h.wavelength from public.couple_history('e4e4e4e4-0000-0000-0000-000000000002'::uuid) h limit 1),
    80,
    'history wavelength is the STORED server score — the 80%% catch-up haircut holds everywhere'
  );

  select is(
    (select h.caught_up from public.couple_history('e4e4e4e4-0000-0000-0000-000000000002'::uuid) h limit 1),
    true,
    'history rows carry the caught_up flag'
  );

  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select throws_ok(
    $q$select * from public.couple_history('e4e4e4e4-0000-0000-0000-000000000002'::uuid)$q$,
    'Unauthorized: not a member of this couple',
    'history stays member-only'
  );

  select * from finish();
rollback;
