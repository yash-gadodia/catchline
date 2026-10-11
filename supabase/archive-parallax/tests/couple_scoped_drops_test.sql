-- ============================================================================
-- COUPLE-SCOPED DROPS TEST (0030): flywheel v2 — a couple's personal moat.
--
-- Proves, with role impersonation:
--   1. publishing a couple-scoped candidate stamps drops.couple_id; a global
--      candidate stays null.
--   2. a couple's OWN unplayed scoped drop is served ahead of an intent-matched
--      global pick (own-couple > intent-weighted).
--   3. a scoped drop is NEVER served to another couple — the foreign couple
--      gets the global pick instead.
--   4. RLS: the scoped drop (+ its prompts) is readable only by its members;
--      another couple's member reads 0 rows. Global rows stay readable to any
--      authenticated user (incl. a published global drop = serves everyone).
--   5. the LRU cycle respects scoping: an exhausted couple re-cycles its OWN
--      scoped drop, never a foreign one.
--   6. send_pack availability ignores foreign scoped drops (theme unknown),
--      while a real global theme still works.
--
-- Hermetic: own uuids; probe drops at positions 9101+; one rolled-back txn.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(16);

  -- ---- SETUP (as superuser) ---------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values
    ('aa000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'csd-mx1@test.com', '', now(), now(), now()),
    ('aa000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'csd-mx2@test.com', '', now(), now(), now()),
    ('aa000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'csd-my1@test.com', '', now(), now(), now()),
    ('aa000000-0000-0000-0000-000000000004'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'csd-my2@test.com', '', now(), now(), now()),
    ('aa000000-0000-0000-0000-000000000005'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'csd-mz1@test.com', '', now(), now(), now()),
    ('aa000000-0000-0000-0000-000000000006'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated', 'csd-mz2@test.com', '', now(), now(), now())
  on conflict do nothing;

  -- CX members carry the 'know' intent (→ theme 'deeper' would be preferred by
  -- the intent branch). CY/CZ carry none. Default spice_level ('flirty' → 1).
  insert into public.profiles (id, display_name, intents)
  values
    ('aa000000-0000-0000-0000-000000000001'::uuid, 'CsdMX1', array['know']),
    ('aa000000-0000-0000-0000-000000000002'::uuid, 'CsdMX2', array['know']),
    ('aa000000-0000-0000-0000-000000000003'::uuid, 'CsdMY1', '{}'),
    ('aa000000-0000-0000-0000-000000000004'::uuid, 'CsdMY2', '{}'),
    ('aa000000-0000-0000-0000-000000000005'::uuid, 'CsdMZ1', '{}'),
    ('aa000000-0000-0000-0000-000000000006'::uuid, 'CsdMZ2', '{}')
  on conflict (id) do update set display_name = excluded.display_name, intents = excluded.intents;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values
    ('cc000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000001'::uuid, 'aa000000-0000-0000-0000-000000000002'::uuid, 'CSD-CX', 'active', '2024-01-01'),
    ('cc000000-0000-0000-0000-000000000002'::uuid, 'aa000000-0000-0000-0000-000000000003'::uuid, 'aa000000-0000-0000-0000-000000000004'::uuid, 'CSD-CY', 'active', '2024-01-01'),
    ('cc000000-0000-0000-0000-000000000003'::uuid, 'aa000000-0000-0000-0000-000000000005'::uuid, 'aa000000-0000-0000-0000-000000000006'::uuid, 'CSD-CZ', 'active', '2024-01-01');

  -- Candidates: one scoped to CX, one global. Positions are computed from the
  -- catalog max (89) at publish time, so publish BEFORE inserting probe drops.
  insert into public.drop_candidates (id, couple_id, title, theme, spice, prompts, source, status)
  values
    ('a1a1a1a1-0000-0000-0000-000000000001'::uuid, 'cc000000-0000-0000-0000-000000000001'::uuid,
     'From CX''s love map', 'deeper', 0,
     '[{"emoji":"🌊","question":"when plans wobble, what do i need most?","options":["the plan said out loud","a hug first","space, then talk","distraction, honestly","all of it at once"]},
       {"emoji":"🧭","question":"my compass on a hard week points to...","options":["you","the gym","the group chat","work, too much","quiet"]},
       {"emoji":"🫶","question":"the reassurance that lands is...","options":["words","time","touch","acts","memes"]}]'::jsonb,
     'llm', 'pending'),
    ('b2b2b2b2-0000-0000-0000-000000000002'::uuid, null,
     'A global keeper', 'spark', 0,
     '[{"emoji":"🦋","question":"the little thing you do that undoes me...","options":["the sleepy voice","the hand squeeze","laughing early","stealing my hoodie","the look back"]},
       {"emoji":"💌","question":"you say i love you without saying it by...","options":["the last bite","the check-in","warming my side","the tiny thing","fixing it first"]},
       {"emoji":"🌙","question":"the us-moment i replay most...","options":["the kitchen dance","the rained-out plan","the long drive","the first sunday","the airport hug"]}]'::jsonb,
     'llm', 'pending');

  -- ---- 1. Publish stamps couple_id (scoped) / null (global) --------------------
  select public.publish_drop_candidate('a1a1a1a1-0000-0000-0000-000000000001'::uuid);
  select is(
    (select couple_id from public.drops where code = 'GEN A1A1A1'),
    'cc000000-0000-0000-0000-000000000001'::uuid,
    'publish: a couple-scoped candidate stamps drops.couple_id'
  );

  select public.publish_drop_candidate('b2b2b2b2-0000-0000-0000-000000000002'::uuid);
  select is(
    (select couple_id from public.drops where code = 'GEN B2B2B2'),
    null::uuid,
    'publish: a global candidate stays couple_id null (serves everyone)'
  );

  -- Probe drops past the real catalog. SX (scoped to CX) sits at a LOWER
  -- position than the global GD_deeper, and its theme is NOT intent-matched —
  -- so only the own-couple rule can make CX pick it.
  insert into public.drops (id, code, title, theme, position, spice, couple_id)
  values
    ('dd000000-0000-0000-0000-000000000002'::uuid, 'csd-sx', 'CX Moat', 'csd-moat', 9101, 0, 'cc000000-0000-0000-0000-000000000001'::uuid),
    ('dd000000-0000-0000-0000-000000000001'::uuid, 'csd-gd', 'Global Deeper', 'deeper', 9102, 0, null),
    ('dd000000-0000-0000-0000-000000000003'::uuid, 'csd-sz', 'CZ Moat', 'csd-z', 9103, 0, 'cc000000-0000-0000-0000-000000000003'::uuid);
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  values
    ('de000000-0000-0000-0000-000000000001'::uuid, 'dd000000-0000-0000-0000-000000000002'::uuid, 0, '🌊', 'Q1?', array['A','B','C','D','E']),
    ('de000000-0000-0000-0000-000000000002'::uuid, 'dd000000-0000-0000-0000-000000000002'::uuid, 1, '🧭', 'Q2?', array['A','B','C','D','E']),
    ('de000000-0000-0000-0000-000000000003'::uuid, 'dd000000-0000-0000-0000-000000000002'::uuid, 2, '🫶', 'Q3?', array['A','B','C','D','E']),
    ('de000000-0000-0000-0000-000000000004'::uuid, 'dd000000-0000-0000-0000-000000000001'::uuid, 0, '💬', 'Q?', array['A','B']),
    ('de000000-0000-0000-0000-000000000005'::uuid, 'dd000000-0000-0000-0000-000000000003'::uuid, 0, '💬', 'Q?', array['A','B']);

  -- CX and CY have played every drop below the probes (real catalog + the two
  -- just-published GEN drops at 90/91), so only the probes remain unplayed.
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'cc000000-0000-0000-0000-000000000001'::uuid, d.id,
         '2020-01-01'::date - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d where d.position is not null and d.position < 9100;
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'cc000000-0000-0000-0000-000000000002'::uuid, d.id,
         '2020-01-01'::date - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d where d.position is not null and d.position < 9100;

  -- ---- 2. Own-couple scoped drop wins over the intent-matched global ----------
  select is(
    public._next_drop_for('cc000000-0000-0000-0000-000000000001'::uuid),
    'dd000000-0000-0000-0000-000000000002'::uuid,
    'own-couple: CX''s scoped moat beats the intent-matched global deeper drop'
  );

  -- ---- 3. A scoped drop is never served to another couple --------------------
  select is(
    public._next_drop_for('cc000000-0000-0000-0000-000000000002'::uuid),
    'dd000000-0000-0000-0000-000000000001'::uuid,
    'scoping: CY gets the global drop — CX''s scoped moat is invisible to it'
  );
  select isnt(
    public._next_drop_for('cc000000-0000-0000-0000-000000000002'::uuid),
    'dd000000-0000-0000-0000-000000000002'::uuid,
    'scoping: CY is never served CX''s scoped drop'
  );

  -- ---- 4. RLS: scoped rows are member-only; global rows stay public ----------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-0000-0000-000000000001','role','authenticated')::text, true);
  select is(
    (select count(*)::int from public.drops where id = 'dd000000-0000-0000-0000-000000000002'::uuid),
    1,
    'rls: a CX member can read CX''s scoped drop'
  );
  select is(
    (select count(*)::int from public.drop_prompts where drop_id = 'dd000000-0000-0000-0000-000000000002'::uuid),
    3,
    'rls: a CX member can read CX''s scoped drop prompts'
  );

  select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select is(
    (select count(*)::int from public.drops where id = 'dd000000-0000-0000-0000-000000000002'::uuid),
    0,
    'rls: a CY member cannot read CX''s scoped drop (0 rows)'
  );
  select is(
    (select count(*)::int from public.drop_prompts where drop_id = 'dd000000-0000-0000-0000-000000000002'::uuid),
    0,
    'rls: a CY member cannot read CX''s scoped drop prompts (0 rows)'
  );
  select is(
    (select count(*)::int from public.drops where id = 'dd000000-0000-0000-0000-000000000001'::uuid),
    1,
    'rls: a CY member can still read a global drop'
  );
  select is(
    (select count(*)::int from public.drops where code = 'GEN B2B2B2' and couple_id is null),
    1,
    'rls: the published global drop is readable by any couple (serves everyone)'
  );
  reset role;

  -- ---- 5. LRU cycle respects scoping -----------------------------------------
  -- CZ plays every spice-eligible drop it can see EXCEPT its own SZ, which it
  -- played longest ago — so the LRU cycle must come back around to SZ, never to
  -- CX's scoped drop.
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'cc000000-0000-0000-0000-000000000003'::uuid, d.id,
         (now() at time zone 'Asia/Singapore')::date - 1 - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d
  where d.position is not null and d.spice <= 1
    and (d.couple_id is null or d.couple_id = 'cc000000-0000-0000-0000-000000000003'::uuid)
    and d.id <> 'dd000000-0000-0000-0000-000000000003'::uuid;
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('cc000000-0000-0000-0000-000000000003'::uuid, 'dd000000-0000-0000-0000-000000000003'::uuid,
          (now() at time zone 'Asia/Singapore')::date - 9000, 'revealed');

  select is(
    public._next_drop_for('cc000000-0000-0000-0000-000000000003'::uuid),
    'dd000000-0000-0000-0000-000000000003'::uuid,
    'lru: an exhausted couple re-cycles its OWN scoped drop (least recently used)'
  );
  select isnt(
    public._next_drop_for('cc000000-0000-0000-0000-000000000003'::uuid),
    'dd000000-0000-0000-0000-000000000002'::uuid,
    'lru: the cycle never returns a foreign couple''s scoped drop'
  );

  -- ---- 6. send_pack availability ignores foreign scoped drops ----------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','aa000000-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.send_pack('cc000000-0000-0000-0000-000000000002'::uuid, 'csd-moat')$q$,
    'unknown pack theme csd-moat',
    'send_pack: a theme that exists only as a foreign scoped drop is unknown to CY'
  );
  select lives_ok(
    $q$select public.send_pack('cc000000-0000-0000-0000-000000000002'::uuid, 'deeper')$q$,
    'send_pack: CY can still send a real global theme with an unplayed drop'
  );
  reset role;
  select is(
    (select pack_override from public.couples where id = 'cc000000-0000-0000-0000-000000000002'::uuid),
    'deeper',
    'send_pack: the available global send recorded the steer'
  );

  select * from finish();
rollback;
