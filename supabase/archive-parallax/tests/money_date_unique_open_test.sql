-- ============================================================================
-- ONE OPEN MONEY DATE PER COUPLE (0033)
--
-- The double-start race: two rapid start_money_date calls must resolve to the
-- SAME open session — enforced by the partial unique index
-- money_date_sessions_one_open plus the on-conflict resume in the function.
--   1. the index exists, unique and partial on state='open'.
--   2. two rapid starts by the same member yield the same session id.
--   3. the partner's rapid start also lands on that same session.
--   4. a second open row for the couple is impossible at the database level.
--   5. sequential sessions still work: complete the open one, a fresh start
--      opens a new session.
--
-- Hermetic: own uuids (ee33/ec33 namespace); one rolled-back transaction.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(6);

  -- ---- SETUP ---------------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('ee330000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'mduo-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 2) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('ee330000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Mduo' || n
  from generate_series(1, 2) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('ec330000-0000-0000-0000-000000000001'::uuid,
          'ee330000-0000-0000-0000-000000000001'::uuid,
          'ee330000-0000-0000-0000-000000000002'::uuid,
          'MDUO-C1', 'active', '2024-01-01');

  -- ---- 1. the index: unique + partial on open --------------------------------
  select is(
    (select count(*)::int
     from pg_indexes
     where schemaname = 'public'
       and tablename = 'money_date_sessions'
       and indexname = 'money_date_sessions_one_open'
       and indexdef like '%UNIQUE%'
       and indexdef like '%state = ''open''%'),
    1,
    'index: money_date_sessions_one_open is a partial unique index on open sessions'
  );

  -- ---- 2. two rapid starts (same member) yield the same session --------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee330000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  create temporary table mduo_ids (label text primary key, id uuid);
  insert into mduo_ids select 'first', public.start_money_date('ec330000-0000-0000-0000-000000000001'::uuid);
  select isnt(
    (select id from mduo_ids where label = 'first'),
    null,
    'start: the first start opens a session'
  );
  select is(
    public.start_money_date('ec330000-0000-0000-0000-000000000001'::uuid),
    (select id from mduo_ids where label = 'first'),
    'start: an immediate second start returns the SAME session id'
  );

  -- ---- 3. the partner's rapid start lands on the same session ----------------
  select set_config('request.jwt.claims', json_build_object('sub','ee330000-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select is(
    public.start_money_date('ec330000-0000-0000-0000-000000000001'::uuid),
    (select id from mduo_ids where label = 'first'),
    'start: the partner starting at the same time gets the same session id'
  );
  reset role;

  -- ---- 4. a second open row is impossible at the database level --------------
  select throws_ok(
    $q$insert into public.money_date_sessions (couple_id, started_by)
       values ('ec330000-0000-0000-0000-000000000001'::uuid,
               'ee330000-0000-0000-0000-000000000002'::uuid)$q$,
    '23505',
    null,
    'index: a duplicate open session violates the unique index'
  );

  -- ---- 5. sequential sessions still flow ------------------------------------
  update public.money_date_sessions
  set state = 'completed', completed_at = now()
  where id = (select id from mduo_ids where label = 'first');

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee330000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select isnt(
    public.start_money_date('ec330000-0000-0000-0000-000000000001'::uuid),
    (select id from mduo_ids where label = 'first'),
    'start: after completion a fresh start opens a NEW session'
  );
  reset role;

  select * from finish();
rollback;
