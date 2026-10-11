-- ============================================================================
-- SG + LDR PACKS TEST (0031): the two themed content packs are real, global,
-- correctly shaped, idempotent, and discoverable through send_pack.
--
-- Proves:
--   1. catalog: 7 'sg' drops (SG 01..07) + 7 'ldr' drops (LDR 01..07), every
--      one global (couple_id null) and in rotation (position not null).
--   2. shape: exactly 3 prompts per drop, every prompt exactly 3 non-empty
--      options and a non-empty emoji + question.
--   3. idempotency: re-running the migration's inserts (same fixed UUIDs,
--      on conflict do nothing) is a no-op — counts unchanged.
--   4. send_pack: a FRESH couple (nothing played, default spice) can send both
--      'sg' and 'ldr' — the theme is known AND has an available drop, and the
--      steer lands in couples.pack_override.
--
-- Hermetic: own uuids for users/couple; assertions on the pack's own fixed
-- UUID/code namespace (never whole-catalog counts); one rolled-back txn.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(17);

  -- ---- 1. Catalog: both packs, all global --------------------------------------
  select is(
    (select count(*)::int from public.drops
     where theme = 'sg' and code like 'SG %' and couple_id is null and position is not null),
    7,
    'sg pack: 7 global drops (SG 01..07) in rotation'
  );
  select is(
    (select count(*)::int from public.drops
     where theme = 'ldr' and code like 'LDR %' and couple_id is null and position is not null),
    7,
    'ldr pack: 7 global drops (LDR 01..07) in rotation'
  );
  select is(
    (select count(*)::int from public.drops
     where theme in ('sg', 'ldr') and couple_id is not null),
    0,
    'no sg/ldr drop is couple-scoped — the packs are global'
  );

  -- ---- 2. Shape: 3 prompts per drop, 3 non-empty options per prompt ------------
  select is(
    (select count(*)::int from public.drop_prompts dp
     join public.drops d on d.id = dp.drop_id
     where d.theme = 'sg' and d.code like 'SG %'),
    21,
    'sg pack: 21 prompts (7 drops x 3)'
  );
  select is(
    (select count(*)::int from public.drop_prompts dp
     join public.drops d on d.id = dp.drop_id
     where d.theme = 'ldr' and d.code like 'LDR %'),
    21,
    'ldr pack: 21 prompts (7 drops x 3)'
  );
  select is(
    (select count(*)::int from public.drops d
     where d.theme in ('sg', 'ldr')
       and (select count(*) from public.drop_prompts dp where dp.drop_id = d.id) <> 3),
    0,
    'every sg/ldr drop has exactly 3 prompts'
  );
  select is(
    (select count(*)::int from public.drop_prompts dp
     join public.drops d on d.id = dp.drop_id
     where d.theme in ('sg', 'ldr')
       and coalesce(array_length(dp.options, 1), 0) = 3),
    42,
    'every sg/ldr prompt has exactly 3 options (42/42)'
  );
  select is(
    (select count(*)::int from public.drop_prompts dp
     join public.drops d on d.id = dp.drop_id
     where d.theme in ('sg', 'ldr')
       and exists (select 1 from unnest(dp.options) as o(v) where coalesce(trim(o.v), '') = '')),
    0,
    'no sg/ldr prompt has an empty option'
  );
  select is(
    (select count(*)::int from public.drop_prompts dp
     join public.drops d on d.id = dp.drop_id
     where d.theme in ('sg', 'ldr')
       and (coalesce(trim(dp.emoji), '') = '' or coalesce(trim(dp.question), '') = '')),
    0,
    'every sg/ldr prompt has a non-empty emoji and question'
  );

  -- ---- 3. Idempotency: the migration's fixed-UUID inserts are conflict-guarded --
  -- (Full-file evidence lives in the apply protocol — the second psql run of
  -- 0031 reports INSERT 0 0. Here: the same representative rows, same UUIDs.)
  select lives_ok(
    $q$insert into public.drops (id, code, title, theme, position, spice, couple_id)
       values ('44444444-4444-4444-4444-000000000001', 'SG 01', 'the hawker heart', 'sg', 501, 0, null)
       on conflict (id) do nothing$q$,
    'idempotency: re-inserting an SG drop with its fixed UUID does not error'
  );
  select lives_ok(
    $q$insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
       values ('55555555-5555-5555-5555-000000000100', '44444444-4444-4444-4444-000000000001', 0, '🍗', 'my death-row hawker order, no experiments...', array['a', 'b', 'c'])
       on conflict (id) do nothing$q$,
    'idempotency: re-inserting a prompt with its fixed UUID does not error'
  );
  select is(
    (select count(*)::int from public.drops
     where theme = 'sg' and code like 'SG %' and couple_id is null),
    7,
    'idempotency: sg drop count unchanged after the re-insert'
  );
  select is(
    (select count(*)::int from public.drop_prompts
     where drop_id = '44444444-4444-4444-4444-000000000001'),
    3,
    'idempotency: SG 01 still has exactly 3 prompts after the re-insert'
  );

  -- ---- 4. send_pack recognizes both themes for a FRESH couple -------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('ab310000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'sgldr-m1@test.com', '', now(), now(), now()),
    ('ab310000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'sgldr-m2@test.com', '', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('ab310000-0000-0000-0000-000000000001'::uuid, 'SgLdrM1'),
    ('ab310000-0000-0000-0000-000000000002'::uuid, 'SgLdrM2')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('cb310000-0000-0000-0000-000000000001'::uuid, 'ab310000-0000-0000-0000-000000000001'::uuid, 'ab310000-0000-0000-0000-000000000002'::uuid, 'SGLDR1', 'active', '2025-01-01');

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ab310000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.send_pack('cb310000-0000-0000-0000-000000000001'::uuid, 'sg')$q$,
    'send_pack: a fresh couple can send the sg pack (theme known + drop available)'
  );
  reset role;
  select is(
    (select pack_override from public.couples where id = 'cb310000-0000-0000-0000-000000000001'::uuid),
    'sg',
    'send_pack: the sg steer landed in pack_override'
  );

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ab310000-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select lives_ok(
    $q$select public.send_pack('cb310000-0000-0000-0000-000000000001'::uuid, 'ldr')$q$,
    'send_pack: the same fresh couple can send the ldr pack'
  );
  reset role;
  select is(
    (select pack_override from public.couples where id = 'cb310000-0000-0000-0000-000000000001'::uuid),
    'ldr',
    'send_pack: the ldr steer landed in pack_override'
  );

  select * from finish();
rollback;
