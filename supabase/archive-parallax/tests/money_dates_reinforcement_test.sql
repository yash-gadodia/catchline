-- ============================================================================
-- MONEY DATES + REINFORCEMENT DROPS TEST (0029)
--
-- Part A — drops.kind + the reinforcement cadence in _next_drop_for:
--   1. kind defaults to 'classic'; bogus kinds are rejected.
--   2. the 12 seeded reinforcement drops are global, spice 0, 3x5 prompts.
--   3. on a 5th-round slot (played % 5 = 4) an unplayed reinforcement drop is
--      served — and the cadence branch respects the couple fence (a foreign
--      scoped reinforcement drop at a LOWER position is skipped) and the
--      spice gate (a spicy reinforcement drop is skipped).
--   4. off-slot, classics serve as before (0030 behavior intact).
--   5. with everything eligible played, LRU recycles only the couple's own
--      played eligible drops (never the foreign/spicy probes).
--   6. when classics run out, an unplayed reinforcement drop still beats an
--      LRU repeat even off-cadence (repeat rate stays 0).
--
-- Part B — money_date_sessions + RPCs (start / get-state / advance / complete):
--   membership guards, resume-within-24h, stale-session abandonment, note and
--   agreed-action validation, completion stamping, RLS member-only reads.
--
-- Hermetic: own uuids; probe drops at positions 9500+; count-mod-5 tuning via
-- dynamically inserted filler plays (robust to any catalog size); one
-- rolled-back transaction.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(28);

  -- ---- SETUP -----------------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('ee290000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'mdr-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 9) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('ee290000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Mdr' || n
  from generate_series(1, 9) n
  on conflict (id) do update set display_name = excluded.display_name;

  -- C1 (u1+u2): the cadence couple. C2 (u5, pending): owns the foreign scoped
  -- probe. C3 (u6+u7): the fallback couple. CM (u8+u9): the money-date couple.
  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values
    ('ec290000-0000-0000-0000-000000000001'::uuid, 'ee290000-0000-0000-0000-000000000001'::uuid, 'ee290000-0000-0000-0000-000000000002'::uuid, 'MDR-C1', 'active', '2024-01-01'),
    ('ec290000-0000-0000-0000-000000000003'::uuid, 'ee290000-0000-0000-0000-000000000006'::uuid, 'ee290000-0000-0000-0000-000000000007'::uuid, 'MDR-C3', 'active', '2024-01-01'),
    ('ec290000-0000-0000-0000-000000000004'::uuid, 'ee290000-0000-0000-0000-000000000008'::uuid, 'ee290000-0000-0000-0000-000000000009'::uuid, 'MDR-CM', 'active', '2024-01-01');
  insert into public.couples (id, member_a, member_b, invite_code, status)
  values ('ec290000-0000-0000-0000-000000000002'::uuid, 'ee290000-0000-0000-0000-000000000005'::uuid, null, 'MDR-C2', 'pending');

  -- ============================================================================
  -- Part A — kind + cadence
  -- ============================================================================

  -- ---- 1. kind column + constraint ---------------------------------------------
  insert into public.drops (id, code, title, theme, position, spice)
  values ('ed290000-0000-0000-0000-000000000009'::uuid, 'mdr-plain', 'Plain', 'daily', null, 0);
  select is(
    (select kind from public.drops where id = 'ed290000-0000-0000-0000-000000000009'::uuid),
    'classic',
    'kind: a plain insert defaults to classic'
  );

  select throws_ok(
    $q$insert into public.drops (code, title, theme, kind) values ('mdr-bogus', 'Bogus', 'daily', 'astrology')$q$,
    '23514',
    null,
    'kind: the check constraint rejects an unknown kind'
  );

  -- ---- 2. The seeded starter set -------------------------------------------------
  select is(
    (select count(*)::int from public.drops
     where id between '66666666-6666-6666-6666-000000000001'::uuid
                  and '66666666-6666-6666-6666-000000000012'::uuid
       and couple_id is null and spice = 0 and position is not null
       and kind in ('gratitude', 'are', 'self_expansion')),
    12,
    'seeds: 12 global, spice-0, in-rotation reinforcement drops'
  );
  select is(
    (select count(*)::int from public.drops d
     where d.id between '66666666-6666-6666-6666-000000000001'::uuid
                    and '66666666-6666-6666-6666-000000000012'::uuid
       and (select count(*) from public.drop_prompts dp where dp.drop_id = d.id) = 3
       and not exists (
         select 1 from public.drop_prompts dp
         where dp.drop_id = d.id and coalesce(array_length(dp.options, 1), 0) <> 5
       )),
    12,
    'seeds: every reinforcement drop has exactly 3 prompts of 5 options'
  );

  -- ---- Probes -------------------------------------------------------------------
  -- FOREIGN sits at the LOWEST probe position: if the cadence branch ever lost
  -- its couple fence, C1 would be served C2's drop. SPICY guards the spice
  -- gate the same way (C1's members are default flirty = allowed 1).
  insert into public.drops (id, code, title, theme, position, spice, couple_id, kind)
  values
    ('ed290000-0000-0000-0000-000000000004'::uuid, 'mdr-foreign', 'Foreign Glow', 'deeper', 9500, 0, 'ec290000-0000-0000-0000-000000000002'::uuid, 'gratitude'),
    ('ed290000-0000-0000-0000-000000000001'::uuid, 'mdr-classic', 'Probe Classic', 'daily', 9501, 0, null, 'classic'),
    ('ed290000-0000-0000-0000-000000000002'::uuid, 'mdr-reinf',   'Probe Glow',    'deeper', 9502, 0, null, 'gratitude'),
    ('ed290000-0000-0000-0000-000000000003'::uuid, 'mdr-spicy',   'Spicy Tune',    'deeper', 9503, 2, null, 'are');
  insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
  select ('ed290000-0000-0000-0000-00000000001' || n)::uuid,
         ('ed290000-0000-0000-0000-00000000000' || n)::uuid,
         0, '💬', 'Q?', array['A', 'B']
  from generate_series(1, 4) n;

  -- C1 plays every rotation drop below the probes (incl. the 0029 seeds).
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'ec290000-0000-0000-0000-000000000001'::uuid, d.id,
         '2020-01-01'::date - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d
  where d.position is not null and d.position < 9500;

  -- Tune C1's played count onto the cadence slot (count % 5 = 4) with played
  -- filler drops — robust to whatever size the catalog has grown to.
  do $$
  declare
    c int;
    k int;
    i int;
    d uuid;
  begin
    select count(*) into c from public.couple_drops
    where couple_id = 'ec290000-0000-0000-0000-000000000001'::uuid;
    k := ((4 - (c % 5)) + 5) % 5;
    for i in 1..k loop
      insert into public.drops (code, title, theme, position, spice)
      values ('mdr-f1-' || i, 'Filler', 'daily', 9600 + i, 0)
      returning id into d;
      insert into public.couple_drops (couple_id, drop_id, date, state)
      values ('ec290000-0000-0000-0000-000000000001'::uuid, d, '2018-01-01'::date - i, 'revealed');
    end loop;
  end
  $$;
  select is(
    (select count(*)::int % 5 from public.couple_drops
     where couple_id = 'ec290000-0000-0000-0000-000000000001'::uuid),
    4,
    'setup: C1''s played count sits on the 5th-round cadence slot'
  );

  -- ---- 3. Cadence serves the reinforcement drop (fenced) --------------------------
  select is(
    public._next_drop_for('ec290000-0000-0000-0000-000000000001'::uuid),
    'ed290000-0000-0000-0000-000000000002'::uuid,
    'cadence: the 5th round serves the unplayed reinforcement drop — skipping the foreign scoped one (couple fence), the spicy one (spice gate) and the lower-position classic'
  );

  -- ---- 4. Off-slot, classics serve exactly as before ------------------------------
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('ec290000-0000-0000-0000-000000000001'::uuid, 'ed290000-0000-0000-0000-000000000002'::uuid, '2021-01-01', 'revealed');
  select is(
    public._next_drop_for('ec290000-0000-0000-0000-000000000001'::uuid),
    'ed290000-0000-0000-0000-000000000001'::uuid,
    'off-slot: the next round serves the classic probe (0030 order intact)'
  );

  -- ---- 5. Exhausted: LRU recycles own played eligible drops only ------------------
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('ec290000-0000-0000-0000-000000000001'::uuid, 'ed290000-0000-0000-0000-000000000001'::uuid, '2021-01-02', 'revealed');
  select ok(
    public._next_drop_for('ec290000-0000-0000-0000-000000000001'::uuid) in (
      select drop_id from public.couple_drops
      where couple_id = 'ec290000-0000-0000-0000-000000000001'::uuid
    ),
    'exhausted: LRU recycles from C1''s own played drops (never the foreign or spicy probes)'
  );

  -- ---- 6. Classics gone: an unplayed reinforcement drop beats a repeat ------------
  -- C3 plays EVERYTHING except the three fenced/unfenced reinforcement probes,
  -- then tunes its count OFF the cadence slot (count % 5 = 1).
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'ec290000-0000-0000-0000-000000000003'::uuid, d.id,
         '2020-01-01'::date - row_number() over (order by d.position)::int, 'revealed'
  from public.drops d
  where d.position is not null
    and d.id not in ('ed290000-0000-0000-0000-000000000002'::uuid,
                     'ed290000-0000-0000-0000-000000000003'::uuid,
                     'ed290000-0000-0000-0000-000000000004'::uuid);
  do $$
  declare
    c int;
    k int;
    i int;
    d uuid;
  begin
    select count(*) into c from public.couple_drops
    where couple_id = 'ec290000-0000-0000-0000-000000000003'::uuid;
    k := ((1 - (c % 5)) + 5) % 5;
    for i in 1..k loop
      insert into public.drops (code, title, theme, position, spice)
      values ('mdr-f3-' || i, 'Filler', 'daily', 9700 + i, 0)
      returning id into d;
      insert into public.couple_drops (couple_id, drop_id, date, state)
      values ('ec290000-0000-0000-0000-000000000003'::uuid, d, '2018-01-01'::date - i, 'revealed');
    end loop;
  end
  $$;
  select is(
    public._next_drop_for('ec290000-0000-0000-0000-000000000003'::uuid),
    'ed290000-0000-0000-0000-000000000002'::uuid,
    'fallback: with classics exhausted, the unplayed reinforcement drop serves even off-cadence — never a repeat while anything is unplayed'
  );

  -- ============================================================================
  -- Part B — money_date_sessions + RPCs
  -- ============================================================================

  -- ---- 7. start: membership guard --------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select throws_ok(
    $q$select public.start_money_date('ec290000-0000-0000-0000-000000000004'::uuid)$q$,
    'Unauthorized: not a member of this couple',
    'start: a non-member is rejected'
  );
  reset role;

  -- ---- 8. start + resume --------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000008','role','authenticated')::text, true);
  create temporary table mdr_ids (label text primary key, id uuid);
  insert into mdr_ids select 'first', public.start_money_date('ec290000-0000-0000-0000-000000000004'::uuid);
  reset role;

  select is(
    (select (s.state, s.step, s.started_by) = ('open', 0, 'ee290000-0000-0000-0000-000000000008'::uuid)
     from public.money_date_sessions s where s.id = (select id from mdr_ids where label = 'first')),
    true,
    'start: opens at step 0, stamped with who started'
  );

  -- The OTHER member "starting" resumes the same open session (one phone).
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000009','role','authenticated')::text, true);
  select is(
    public.start_money_date('ec290000-0000-0000-0000-000000000004'::uuid),
    (select id from mdr_ids where label = 'first'),
    'start: a fresh open session resumes instead of duplicating'
  );

  -- ---- 9. advance ----------------------------------------------------------------
  select is(
    public.advance_money_date((select id from mdr_ids where label = 'first'), '  we both grew up cash-under-the-mattress  '),
    1,
    'advance: returns the new step'
  );
  reset role;
  select is(
    (select responses from public.money_date_sessions where id = (select id from mdr_ids where label = 'first')),
    '[{"step": 0, "note": "we both grew up cash-under-the-mattress"}]'::jsonb,
    'advance: the card note is trimmed and recorded against its step'
  );

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000008','role','authenticated')::text, true);
  select is(
    public.advance_money_date((select id from mdr_ids where label = 'first'), null),
    2,
    'advance: a no-note card still advances'
  );
  select throws_ok(
    format($q$select public.advance_money_date('%s'::uuid, %L)$q$,
           (select id from mdr_ids where label = 'first'), repeat('x', 2001)),
    'money_date_note_too_long',
    'advance: a >2000-char note is rejected'
  );
  reset role;

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select throws_ok(
    format($q$select public.advance_money_date('%s'::uuid, 'sneaky')$q$,
           (select id from mdr_ids where label = 'first')),
    'Unauthorized: not a member of this couple',
    'advance: a non-member is rejected'
  );
  reset role;

  -- ---- 10. complete ---------------------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000009','role','authenticated')::text, true);
  select throws_ok(
    format($q$select public.complete_money_date('%s'::uuid, '   ')$q$,
           (select id from mdr_ids where label = 'first')),
    'money_date_action_required',
    'complete: the agreed action is required'
  );
  select throws_ok(
    format($q$select public.complete_money_date('%s'::uuid, %L)$q$,
           (select id from mdr_ids where label = 'first'), repeat('y', 281)),
    'money_date_action_too_long',
    'complete: a >280-char action is rejected'
  );
  select lives_ok(
    format($q$select public.complete_money_date('%s'::uuid, 'coffee from home on weekdays, one week')$q$,
           (select id from mdr_ids where label = 'first')),
    'complete: a member completes with a tiny agreed action'
  );
  reset role;

  select is(
    (select (s.state, s.agreed_action, s.completed_at is not null)
       = ('completed', 'coffee from home on weekdays, one week', true)
     from public.money_date_sessions s where s.id = (select id from mdr_ids where label = 'first')),
    true,
    'complete: stamps state, the agreed action and completed_at'
  );

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000008','role','authenticated')::text, true);
  select throws_ok(
    format($q$select public.advance_money_date('%s'::uuid, 'late note')$q$,
           (select id from mdr_ids where label = 'first')),
    'money_date_not_open',
    'advance: a completed session cannot be advanced'
  );

  -- ---- 11. get_money_date_state -----------------------------------------------------
  select is(
    (select (v->>'open' is null or v->'open' = 'null'::jsonb)
        and (v->>'sessions_completed')::int = 1
        and v->>'last_agreed_action' = 'coffee from home on weekdays, one week'
        and (v->>'last_completed_at') is not null
     from public.get_money_date_state('ec290000-0000-0000-0000-000000000004'::uuid) as v),
    true,
    'state: no open session, one completed, with the last agreed action + date'
  );

  -- ---- 12. stale open sessions abandon instead of resuming ---------------------------
  insert into mdr_ids select 'stale', public.start_money_date('ec290000-0000-0000-0000-000000000004'::uuid);
  reset role;
  update public.money_date_sessions
  set created_at = now() - interval '25 hours'
  where id = (select id from mdr_ids where label = 'stale');

  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000008','role','authenticated')::text, true);
  select isnt(
    public.start_money_date('ec290000-0000-0000-0000-000000000004'::uuid),
    (select id from mdr_ids where label = 'stale'),
    'start: a day-old open session is not resumed — a fresh one opens'
  );
  reset role;
  select is(
    (select state from public.money_date_sessions where id = (select id from mdr_ids where label = 'stale')),
    'abandoned',
    'start: the stale open session is marked abandoned'
  );

  -- ---- 13. RLS: member-only reads ----------------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000008','role','authenticated')::text, true);
  select is(
    (select count(*)::int from public.money_date_sessions
     where couple_id = 'ec290000-0000-0000-0000-000000000004'::uuid),
    3,
    'RLS: a member reads all of the couple''s sessions (completed + abandoned + open)'
  );
  select set_config('request.jwt.claims', json_build_object('sub','ee290000-0000-0000-0000-000000000005','role','authenticated')::text, true);
  select is(
    (select count(*)::int from public.money_date_sessions
     where couple_id = 'ec290000-0000-0000-0000-000000000004'::uuid),
    0,
    'RLS: a non-member reads 0 rows'
  );
  select throws_ok(
    $q$select public.get_money_date_state('ec290000-0000-0000-0000-000000000004'::uuid)$q$,
    'Unauthorized: not a member of this couple',
    'state: a non-member is rejected'
  );
  reset role;

  select * from finish();
rollback;
