-- ============================================================================
-- AUTO-PUBLISH CANDIDATES TEST (0034): v2 auto-approve for the generative
-- engine. Once a source (global or per-couple) has quality history (>= 5
-- human-reviewed candidates, acceptance rate >= 0.8), pending candidates from
-- that source skip the human review queue and auto-publish.
--
-- Sources are deliberately isolated per section (couple A/B/C/D; the global
-- source only serves the under-5 case) so rate math never cross-contaminates.
--
-- Proves:
--   1. Under-5-history source does NOT auto-publish (inert until accrual)
--   2. 5 reviewed at 0.8 acceptance DOES auto-publish (+ flag, reviewed_at, status)
--   3. 5 reviewed at 0.6 does NOT publish
--   4. Candidates older than 30 days are skipped (stale guard)
--   5. Per-invocation cap (5) holds
--   6. anon/authenticated cannot execute (42501)
--
-- Hermetic: own rows, unique ids, rolled back.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(16);

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'apc_' || u.n || '@test.com', '', now(), now()
  from (values
    ('a4000001-0000-0000-0000-000000000001'::uuid, 'a1'),
    ('a4000001-0000-0000-0000-000000000002'::uuid, 'a2'),
    ('a4000001-0000-0000-0000-000000000003'::uuid, 'b1'),
    ('a4000001-0000-0000-0000-000000000004'::uuid, 'b2'),
    ('a4000001-0000-0000-0000-000000000005'::uuid, 'c1'),
    ('a4000001-0000-0000-0000-000000000006'::uuid, 'c2'),
    ('a4000001-0000-0000-0000-000000000007'::uuid, 'd1'),
    ('a4000001-0000-0000-0000-000000000008'::uuid, 'd2')
  ) as u(id, n)
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select id, 'APC ' || n from (values
    ('a4000001-0000-0000-0000-000000000001'::uuid, 'a1'),
    ('a4000001-0000-0000-0000-000000000002'::uuid, 'a2'),
    ('a4000001-0000-0000-0000-000000000003'::uuid, 'b1'),
    ('a4000001-0000-0000-0000-000000000004'::uuid, 'b2'),
    ('a4000001-0000-0000-0000-000000000005'::uuid, 'c1'),
    ('a4000001-0000-0000-0000-000000000006'::uuid, 'c2'),
    ('a4000001-0000-0000-0000-000000000007'::uuid, 'd1'),
    ('a4000001-0000-0000-0000-000000000008'::uuid, 'd2')
  ) as u(id, n)
  on conflict (id) do nothing;

  insert into public.couples (id, member_a, member_b, invite_code, status)
  values
    ('a4000002-0000-0000-0000-00000000000a'::uuid, 'a4000001-0000-0000-0000-000000000001'::uuid, 'a4000001-0000-0000-0000-000000000002'::uuid, 'APC-CPLA', 'active'),
    ('a4000002-0000-0000-0000-00000000000b'::uuid, 'a4000001-0000-0000-0000-000000000003'::uuid, 'a4000001-0000-0000-0000-000000000004'::uuid, 'APC-CPLB', 'active'),
    ('a4000002-0000-0000-0000-00000000000c'::uuid, 'a4000001-0000-0000-0000-000000000005'::uuid, 'a4000001-0000-0000-0000-000000000006'::uuid, 'APC-CPLC', 'active'),
    ('a4000002-0000-0000-0000-00000000000d'::uuid, 'a4000001-0000-0000-0000-000000000007'::uuid, 'a4000001-0000-0000-0000-000000000008'::uuid, 'APC-CPLD', 'active');

  create temp table apc_prompts as
    select '[{"emoji":"🦋","question":"q1","options":["a","b","c","d","e"]},
             {"emoji":"💌","question":"q2","options":["a","b","c","d","e"]},
             {"emoji":"🌙","question":"q3","options":["a","b","c","d","e"]}]'::jsonb as p;

  -- Seed helper pattern: history rows are human reviews (auto_published=false).

  -- ---- 1. Global source: only 4 reviewed → inert ----------------------------
  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status, reviewed_at)
  select null, 'apc global reviewed ' || i, 'spark', 0, (select p from apc_prompts),
         case when i <= 3 then 'approved' else 'rejected' end, now() - interval '5 days'
  from generate_series(1, 4) i;

  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status)
  values (null, 'apc global pending', 'spark', 0, (select p from apc_prompts), 'pending');

  select public.auto_publish_candidates();

  select is(
    (select status from public.drop_candidates where title = 'apc global pending'),
    'pending',
    'under-5: source with < 5 reviewed does NOT auto-publish'
  );
  select is(
    (select count(*)::int from public.drop_candidates
     where title like 'apc global%' and auto_published = true),
    0,
    'under-5: no auto_published flag set when history insufficient'
  );

  -- ---- 2. Couple A: 4/5 approved (0.8) → publishes --------------------------
  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status, reviewed_at)
  select 'a4000002-0000-0000-0000-00000000000a'::uuid, 'apc cpl_a reviewed ' || i, 'spark', 0,
         (select p from apc_prompts),
         case when i <= 4 then 'approved' else 'rejected' end, now() - interval '5 days'
  from generate_series(1, 5) i;

  select is(
    (select count(*)::int from public.drop_candidates
     where couple_id = 'a4000002-0000-0000-0000-00000000000a'::uuid and status = 'approved'),
    4,
    'setup: couple A has 4/5 approved (exactly 0.8)'
  );

  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status)
  values ('a4000002-0000-0000-0000-00000000000a'::uuid, 'apc cpl_a pending', 'spark', 0,
          (select p from apc_prompts), 'pending');

  select public.auto_publish_candidates();

  select is(
    (select status from public.drop_candidates where title = 'apc cpl_a pending'),
    'approved',
    '0.8-rate: pending candidate from qualifying source auto-publishes'
  );
  select is(
    (select auto_published from public.drop_candidates where title = 'apc cpl_a pending'),
    true,
    '0.8-rate: auto_published = true on the published candidate'
  );
  select ok(
    (select reviewed_at is not null from public.drop_candidates where title = 'apc cpl_a pending'),
    '0.8-rate: reviewed_at set by publish_drop_candidate'
  );
  select ok(
    (select published_drop_id is not null from public.drop_candidates where title = 'apc cpl_a pending'),
    '0.8-rate: published_drop_id links the created drop'
  );

  -- ---- 3. Couple B: 3/5 approved (0.6) → does NOT publish -------------------
  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status, reviewed_at)
  select 'a4000002-0000-0000-0000-00000000000b'::uuid, 'apc cpl_b reviewed ' || i, 'daily', 0,
         (select p from apc_prompts),
         case when i <= 3 then 'approved' else 'rejected' end, now() - interval '5 days'
  from generate_series(1, 5) i;

  select is(
    (select count(*)::int from public.drop_candidates
     where couple_id = 'a4000002-0000-0000-0000-00000000000b'::uuid and status = 'approved'),
    3,
    'setup: couple B has 3/5 approved (0.6)'
  );

  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status)
  values ('a4000002-0000-0000-0000-00000000000b'::uuid, 'apc cpl_b pending', 'daily', 0,
          (select p from apc_prompts), 'pending');

  select public.auto_publish_candidates();

  select is(
    (select status from public.drop_candidates where title = 'apc cpl_b pending'),
    'pending',
    'below-0.8: acceptance rate < 0.8 does NOT auto-publish'
  );
  select is(
    (select count(*)::int from public.drop_candidates
     where couple_id = 'a4000002-0000-0000-0000-00000000000b'::uuid and auto_published = true),
    0,
    'below-0.8: no auto_published flag when rate insufficient'
  );

  -- ---- 4. Couple C: qualifying source, stale candidate skipped --------------
  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status, reviewed_at)
  select 'a4000002-0000-0000-0000-00000000000c'::uuid, 'apc cpl_c reviewed ' || i, 'fun', 0,
         (select p from apc_prompts), 'approved', now() - interval '5 days'
  from generate_series(1, 5) i;

  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status, created_at)
  values
    ('a4000002-0000-0000-0000-00000000000c'::uuid, 'apc cpl_c fresh', 'fun', 0,
     (select p from apc_prompts), 'pending', now() - interval '10 days'),
    ('a4000002-0000-0000-0000-00000000000c'::uuid, 'apc cpl_c stale', 'fun', 0,
     (select p from apc_prompts), 'pending', now() - interval '35 days');

  select public.auto_publish_candidates();

  select is(
    (select status from public.drop_candidates where title = 'apc cpl_c fresh'),
    'approved',
    'stale-guard: fresh pending candidate auto-publishes'
  );
  select is(
    (select status from public.drop_candidates where title = 'apc cpl_c stale'),
    'pending',
    'stale-guard: candidate > 30 days old is skipped'
  );

  -- ---- 5. Couple D: 10 qualifying pendings, cap holds at 5 ------------------
  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status, reviewed_at)
  select 'a4000002-0000-0000-0000-00000000000d'::uuid, 'apc cpl_d reviewed ' || i, 'memory', 0,
         (select p from apc_prompts), 'approved', now() - interval '5 days'
  from generate_series(1, 5) i;

  insert into public.drop_candidates (couple_id, title, theme, spice, prompts, status, created_at)
  select 'a4000002-0000-0000-0000-00000000000d'::uuid, 'apc cpl_d pending ' || i, 'memory', 0,
         (select p from apc_prompts), 'pending', now() - interval '5 days'
  from generate_series(1, 10) i;

  select public.auto_publish_candidates();

  select is(
    (select count(*)::int from public.drop_candidates
     where title like 'apc cpl_d pending %' and status = 'approved'),
    5,
    'cap: only 5 candidates auto-published in one invocation'
  );
  select is(
    (select count(*)::int from public.drop_candidates
     where title like 'apc cpl_d pending %' and status = 'pending'),
    5,
    'cap: remaining candidates stay pending'
  );

  -- ---- 6. Permission guard --------------------------------------------------
  set local role authenticated;
  select throws_ok(
    $$select public.auto_publish_candidates()$$,
    '42501', null,
    'perms: authenticated cannot execute auto_publish_candidates'
  );
  reset role;

  set local role anon;
  select throws_ok(
    $$select public.auto_publish_candidates()$$,
    '42501', null,
    'perms: anon cannot execute auto_publish_candidates'
  );
  reset role;

  select * from finish();
rollback;
