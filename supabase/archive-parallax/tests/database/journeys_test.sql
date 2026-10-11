-- ============================================================================
-- MILESTONE JOURNEYS TEST (0028): catalog seed, RLS scoping, enroll /
-- get-state / check-in / advance RPCs, and the server-side advance gate.
--
-- Hermetic: own uuids; one rolled-back transaction. Catalog assertions target
-- the fixed-uuid BTO seed (global, shipped by 0028 itself), never counts of
-- the whole catalog.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(21);

  -- ---- SETUP -----------------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('e1e1e1e1-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'jrny-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 4) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  values
    ('e1e1e1e1-0000-0000-0000-000000000001'::uuid, 'JrnyA'),
    ('e1e1e1e1-0000-0000-0000-000000000002'::uuid, 'JrnyB'),
    ('e1e1e1e1-0000-0000-0000-000000000003'::uuid, 'JrnyC'),
    ('e1e1e1e1-0000-0000-0000-000000000004'::uuid, 'JrnyD')
  on conflict (id) do update set display_name = excluded.display_name;

  -- C1: A+B (the enrolling couple). C2: C+D (the outsiders).
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since, streak, freezes_remaining)
  values
    ('e2e2e2e2-0000-0000-0000-000000000001'::uuid,
     'e1e1e1e1-0000-0000-0000-000000000001'::uuid, 'e1e1e1e1-0000-0000-0000-000000000002'::uuid,
     'JRN-C1', 'active', '2024-01-01', 0, 0),
    ('e2e2e2e2-0000-0000-0000-000000000002'::uuid,
     'e1e1e1e1-0000-0000-0000-000000000003'::uuid, 'e1e1e1e1-0000-0000-0000-000000000004'::uuid,
     'JRN-C2', 'active', '2024-01-01', 0, 0);

  -- ---- catalog seed -----------------------------------------------------------
  select is(
    (select title from public.journeys where slug = 'bto'),
    'the bto journey',
    'the BTO journey is seeded'
  );

  select is(
    (select count(*)::int from public.journey_stages
     where journey_id = '44444444-4444-4444-4444-000000000001'::uuid),
    7,
    'the BTO journey has 7 stages'
  );

  select is(
    (select array_agg(s.position order by s.position)
     from public.journey_stages s
     where s.journey_id = '44444444-4444-4444-4444-000000000001'::uuid),
    array[1,2,3,4,5,6,7],
    'stage positions are dense 1..7'
  );

  select is(
    (select bool_and(jsonb_array_length(s.talk_prompts) >= 3 and s.checkin_prompt <> '')
     from public.journey_stages s
     where s.journey_id = '44444444-4444-4444-4444-000000000001'::uuid),
    true,
    'every stage carries talk prompts and a check-in question'
  );

  -- ---- catalog readable to authenticated -------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);

  select is(
    (select count(*)::int from public.journey_stages
     where journey_id = '44444444-4444-4444-4444-000000000001'::uuid),
    7,
    'any authenticated user reads the stage catalog'
  );

  -- ---- enroll_journey ----------------------------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select lives_ok(
    $q$select public.enroll_journey('e2e2e2e2-0000-0000-0000-000000000001'::uuid,
                                    '44444444-4444-4444-4444-000000000001'::uuid)$q$,
    'a member can enroll their couple'
  );

  select is(
    public.enroll_journey('e2e2e2e2-0000-0000-0000-000000000001'::uuid,
                          '44444444-4444-4444-4444-000000000001'::uuid),
    (select cj.id from public.couple_journeys cj
     where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid),
    'enrolling twice is idempotent — the same enrollment id comes back'
  );

  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.enroll_journey('e2e2e2e2-0000-0000-0000-000000000001'::uuid,
                                    '44444444-4444-4444-4444-000000000001'::uuid)$q$,
    'Unauthorized: not a member of this couple',
    'a non-member cannot enroll someone else''s couple'
  );

  -- ---- RLS: enrollment rows are member-only ------------------------------------
  select is(
    (select count(*)::int from public.couple_journeys
     where couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid),
    0,
    'RLS: an outsider reads 0 of another couple''s enrollment rows'
  );

  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000002','role','authenticated')::text, true);
  select is(
    (select count(*)::int from public.couple_journeys
     where couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid),
    1,
    'RLS: the partner reads the couple''s enrollment row'
  );

  -- ---- get_journey_state ---------------------------------------------------------
  select is(
    (select (public.get_journey_state('e2e2e2e2-0000-0000-0000-000000000001'::uuid))->>'current_stage'),
    '1',
    'a fresh enrollment sits at stage 1'
  );

  select is(
    (select (public.get_journey_state('e2e2e2e2-0000-0000-0000-000000000001'::uuid))->>'stage_count'),
    '7',
    'state reports the journey''s stage count'
  );

  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000003','role','authenticated')::text, true);
  select is(
    (select (public.get_journey_state('e2e2e2e2-0000-0000-0000-000000000002'::uuid))::jsonb),
    '{"exists": false}'::jsonb,
    'the unenrolled state payload is exactly {exists:false}'
  );

  -- ---- the advance gate ------------------------------------------------------------
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000001','role','authenticated')::text, true);

  select throws_ok(
    $q$select public.advance_journey_stage(
         (select cj.id from public.couple_journeys cj
          where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid))$q$,
    'check in on this stage before moving on',
    'advancing without a check-in is refused — the gate is server-side'
  );

  select lives_ok(
    $q$select public.record_journey_checkin(
         (select cj.id from public.couple_journeys cj
          where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid),
         'ballot went in today. terrified, excited.')$q$,
    'a member records a stage check-in'
  );

  select is(
    (select (public.get_journey_state('e2e2e2e2-0000-0000-0000-000000000001'::uuid))->>'i_checked_in'),
    'true',
    'the state reflects my check-in on the current stage'
  );

  -- 0032 regression: the note is capped like the money-date RPCs (2000 chars).
  select throws_ok(
    $q$select public.record_journey_checkin(
         (select cj.id from public.couple_journeys cj
          where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid),
         repeat('x', 2001))$q$,
    'journey_note_too_long',
    'a check-in note beyond 2000 chars is refused (0032)'
  );

  select is(
    (select (public.advance_journey_stage(
       (select cj.id from public.couple_journeys cj
        where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid)))::jsonb),
    '{"current_stage": 2, "completed": false}'::jsonb,
    'with a check-in recorded, the stage advances to 2'
  );

  reset role;
  select is(
    (select s.completed_at is not null and exists (
       select 1 from public.couple_journey_stages s2
       where s2.couple_journey_id = s.couple_journey_id
         and s2.stage_position = 2 and s2.completed_at is null)
     from public.couple_journey_stages s
     where s.couple_journey_id = (select cj.id from public.couple_journeys cj
                                  where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid)
       and s.stage_position = 1),
    true,
    'progression timestamps: stage 1 stamped complete, stage 2 entered'
  );

  -- ---- completion -------------------------------------------------------------------
  -- Walk the remaining stages (2..7) with check-ins; the final advance
  -- completes the journey.
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','e1e1e1e1-0000-0000-0000-000000000002','role','authenticated')::text, true);

  do $walk$
  declare
    v_cj uuid;
    v_out json;
  begin
    select cj.id into v_cj from public.couple_journeys cj
    where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid;
    for i in 2..7 loop
      perform public.record_journey_checkin(v_cj, null);
      v_out := public.advance_journey_stage(v_cj);
    end loop;
  end;
  $walk$;

  select is(
    (select (public.get_journey_state('e2e2e2e2-0000-0000-0000-000000000001'::uuid))->>'completed_at' is not null),
    true,
    'advancing off the final stage completes the journey'
  );

  select throws_ok(
    $q$select public.record_journey_checkin(
         (select cj.id from public.couple_journeys cj
          where cj.couple_id = 'e2e2e2e2-0000-0000-0000-000000000001'::uuid),
         'one more?')$q$,
    'this journey is already complete',
    'a completed journey takes no further check-ins'
  );

  select * from finish();
rollback;
