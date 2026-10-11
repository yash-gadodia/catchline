-- ============================================================================
-- CONTENT FLYWHEEL TEST (0023): intent weighting, pack override, the
-- became_prompt_id flywheel, send_pack, repair_streak.
--
-- Hermetic: own uuids; one rolled-back transaction. Rotation assertions use
-- purpose-built catalog drops at positions 9000+ with a dedicated spice-3…
-- (spice stays 0 — we isolate by giving the couple a fully-played catalog
-- except our probe drops, so global catalog contents can't break assertions).
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(12);

  -- ---- SETUP -----------------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d1d1d1d1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'fly-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 6) n
  on conflict do nothing;

  insert into public.profiles (id, display_name, intents)
  values
    ('d1d1d1d1-0000-0000-0000-000000000001'::uuid, 'FlyA', array['know']),
    ('d1d1d1d1-0000-0000-0000-000000000002'::uuid, 'FlyB', array['fun']),
    ('d1d1d1d1-0000-0000-0000-000000000003'::uuid, 'FlyC', '{}'),
    ('d1d1d1d1-0000-0000-0000-000000000004'::uuid, 'FlyD', '{}'),
    ('d1d1d1d1-0000-0000-0000-000000000005'::uuid, 'FlyE', '{}'),
    ('d1d1d1d1-0000-0000-0000-000000000006'::uuid, 'FlyF', '{}')
  on conflict (id) do update set display_name = excluded.display_name, intents = excluded.intents;

  -- Probe catalog drops appended past the real catalog (positions 9001-9003):
  -- daily (early), deeper (later), fun (last). With every earlier catalog drop
  -- marked played for the couple, pure catalog-order would pick 9001 (daily);
  -- intent weighting for know/fun must pick 9002 (deeper) or 9003 (fun) first.
  insert into public.drops (id, code, title, theme, position, spice)
  values
    ('d2d2d2d2-0000-0000-0000-000000000001'::uuid, 'fly-daily',  'Fly Daily',  'daily',  9001, 0),
    ('d2d2d2d2-0000-0000-0000-000000000002'::uuid, 'fly-deeper', 'Fly Deeper', 'deeper', 9002, 0),
    ('d2d2d2d2-0000-0000-0000-000000000003'::uuid, 'fly-fun',    'Fly Fun',    'fun',    9003, 0);
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  select ('d3d3d3d3-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         ('d2d2d2d2-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         0, '☕', 'Q?', array['A','B']
  from generate_series(1, 3) n;

  -- C1 (01+02, intents know+fun): every catalog drop except the probes played.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining)
  values ('d4d4d4d4-0000-0000-0000-000000000001'::uuid,
          'd1d1d1d1-0000-0000-0000-000000000001'::uuid, 'd1d1d1d1-0000-0000-0000-000000000002'::uuid,
          'FLY-C1', 'active', '2024-01-01', 0, null, 0);
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'd4d4d4d4-0000-0000-0000-000000000001'::uuid, d.id,
         '2020-01-01'::date - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d
  where d.position is not null and d.position < 9001;

  -- ---- 1.3: intent weighting ---------------------------------------------------
  select is(
    public._next_drop_for('d4d4d4d4-0000-0000-0000-000000000001'::uuid),
    'd2d2d2d2-0000-0000-0000-000000000002'::uuid,
    'intents (know) outrank catalog order: deeper@9002 beats daily@9001'
  );

  -- ---- 5.3: pack override outranks intents --------------------------------------
  update public.couples set pack_override = 'fun'
  where id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid;

  select is(
    public._next_drop_for('d4d4d4d4-0000-0000-0000-000000000001'::uuid),
    'd2d2d2d2-0000-0000-0000-000000000003'::uuid,
    'a sent pack steers the next drop ahead of intent weighting'
  );

  select is(
    (select pack_override from public.couples where id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid),
    null,
    'the pack override is consumed on use'
  );

  -- ---- send_pack RPC --------------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.send_pack('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'deeper')$q$,
    'a member can send a pack'
  );

  select throws_ok(
    $q$select public.send_pack('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'not-a-theme')$q$,
    'unknown pack theme not-a-theme',
    'send_pack rejects themes that are not in the catalog'
  );

  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.send_pack('d4d4d4d4-0000-0000-0000-000000000001'::uuid, 'deeper')$q$,
    'Unauthorized: not a member of this couple',
    'send_pack rejects non-members'
  );

  reset role;
  select is(
    (select pack_override from public.couples where id = 'd4d4d4d4-0000-0000-0000-000000000001'::uuid),
    'deeper',
    'send_pack recorded the steer'
  );

  -- ---- 1.4: the flywheel -------------------------------------------------------------
  insert into public.learnings (id, couple_id, about, emoji, need, detail, source, origin, mastery)
  values ('d5d5d5d5-0000-0000-0000-000000000001'::uuid,
          'd4d4d4d4-0000-0000-0000-000000000001'::uuid,
          'd1d1d1d1-0000-0000-0000-000000000002', '🌊', 'reassurance', 'needs the plan said out loud', 'refocus', null, 1);

  insert into public.drop_candidates (id, couple_id, title, theme, spice, prompts, source, status, source_learning_ids)
  values ('d6d6d6d6-0000-0000-0000-000000000001'::uuid,
          'd4d4d4d4-0000-0000-0000-000000000001'::uuid,
          'From your love map', 'deeper', 0,
          '[{"emoji":"🌊","question":"when plans wobble, what do i need most?","options":["the plan said out loud","a hug first","space, then talk","distraction, honestly","all of it at once"]},
            {"emoji":"🧭","question":"my compass on a hard week points to...","options":["you","the gym","the group chat","work, too much","quiet"]},
            {"emoji":"🫶","question":"the reassurance that lands is...","options":["words","time","touch","acts","memes"]}]'::jsonb,
          'llm', 'pending',
          array['d5d5d5d5-0000-0000-0000-000000000001'::uuid]);

  select isnt(
    public.publish_drop_candidate('d6d6d6d6-0000-0000-0000-000000000001'::uuid),
    null,
    'publishing a candidate returns the new drop id'
  );

  select is(
    (select l.became_prompt_id is not null from public.learnings l
     where l.id = 'd5d5d5d5-0000-0000-0000-000000000001'::uuid),
    true,
    'the seed learning is stamped became_prompt_id — the flywheel is closed'
  );

  -- ---- repair_streak ------------------------------------------------------------------
  -- C2 (03+04): lapsed a 12-streak 2 days ago, never repaired.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, last_played_on, freezes_remaining, lapsed_streak, lapsed_on)
  values ('d4d4d4d4-0000-0000-0000-000000000002'::uuid,
          'd1d1d1d1-0000-0000-0000-000000000003'::uuid, 'd1d1d1d1-0000-0000-0000-000000000004'::uuid,
          'FLY-C2', 'active', '2024-01-01', 0,
          (now() at time zone 'Asia/Singapore')::date - 3, 0, 12,
          (now() at time zone 'Asia/Singapore')::date - 2);

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.repair_streak('d4d4d4d4-0000-0000-0000-000000000002'::uuid)$q$,
    'a member repairs a recently-lapsed streak'
  );

  reset role;
  select is(
    (select streak = 12
        and lapsed_streak is null
        and last_repair_on = (now() at time zone 'Asia/Singapore')::date
     from public.couples where id = 'd4d4d4d4-0000-0000-0000-000000000002'::uuid),
    true,
    'repair restores the lapsed chain, clears the lapse, stamps the 30-day ledger'
  );

  -- Second repair inside 30 days is refused.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','d1d1d1d1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.repair_streak('d4d4d4d4-0000-0000-0000-000000000002'::uuid)$q$,
    'nothing repairable — no streak lapsed in the last 7 days',
    'a repaired couple has nothing left to repair (and the 30-day ledger stands behind it)'
  );

  select * from finish();
rollback;
