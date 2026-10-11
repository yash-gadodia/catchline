-- repair_rotation_test.sql (0045)
-- Proves the F4 deterministic hybrid in _next_drop_for:
--   1. normal rounds never serve a repair prompt off-cadence
--   2. every 4th round (played % 4 = 3) serves an unplayed repair prompt
--   3. the 2 rounds after any refocus reveal boost a repair prompt
--   4. no unplayed repair content -> the branch falls through gracefully
--
-- Hermetic: own UUIDs; global repair drops use positions 99001+ and the
-- transaction rolls back. _next_drop_for runs as superuser (it is revoked
-- from clients and only reachable via ensure_today_drop in prod).
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(6);

  -- ---- SETUP -----------------------------------------------------------------
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
         '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
         'rot-' || n || '@test.com', '', now(), now(), now()
  from generate_series(1, 2) n
  on conflict do nothing;

  insert into public.profiles (id, display_name)
  select ('d7d7d7d7-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'Rot' || n
  from generate_series(1, 2) n
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.couples (id, member_a, member_b, invite_code, status, together_since)
  values ('d0d0d0d0-0000-0000-0000-000000000001'::uuid,
          'd7d7d7d7-0000-0000-0000-000000000001'::uuid, 'd7d7d7d7-0000-0000-0000-000000000002'::uuid,
          'ROT-C1', 'active', '2024-01-01');

  -- Two global repair-themed prompts (what Dani's F4 content pass will add).
  insert into public.drops (id, code, title, theme, position, spice, kind)
  values
    ('4e4a144e-0000-0000-0000-000000000001'::uuid, 'DROP R1', 'when i''m overwhelmed', 'repair', 99001, 0, 'classic'),
    ('4e4a144e-0000-0000-0000-000000000002'::uuid, 'DROP R2', 'how i apologize',      'repair', 99002, 0, 'classic');

  -- ---- 1. round 1 (played=0): never repair off-cadence -----------------------
  select isnt(
    (select theme from public.drops where id = public._next_drop_for('d0d0d0d0-0000-0000-0000-000000000001'::uuid)),
    'repair',
    'a normal round never serves a repair prompt'
  );

  -- play 3 non-repair drops -> the next round is the couple's 4th
  insert into public.couple_drops (couple_id, drop_id, date, state)
  select 'd0d0d0d0-0000-0000-0000-000000000001'::uuid, d.id,
         current_date - (row_number() over (order by d.position))::int, 'revealed'
  from (
    select id, position from public.drops
    where couple_id is null and theme is distinct from 'repair' and position is not null
    order by position limit 3
  ) d;

  -- ---- 2. the 4th round serves the first repair prompt -----------------------
  select is(
    public._next_drop_for('d0d0d0d0-0000-0000-0000-000000000001'::uuid),
    '4e4a144e-0000-0000-0000-000000000001'::uuid,
    'every 4th round serves an unplayed repair prompt'
  );

  -- play it -> played=4; no refocus reveal yet
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('d0d0d0d0-0000-0000-0000-000000000001'::uuid,
          '4e4a144e-0000-0000-0000-000000000001'::uuid, current_date - 10, 'revealed');

  -- ---- 3. round 5 without a reveal: back to normal rotation ------------------
  select isnt(
    (select theme from public.drops where id = public._next_drop_for('d0d0d0d0-0000-0000-0000-000000000001'::uuid)),
    'repair',
    'off-cadence with no reveal: no repair prompt'
  );

  -- ---- 4. a refocus reveal boosts a repair prompt for the next 2 rounds ------
  insert into public.refocus_sessions
    (couple_id, initiator, topic, initiator_side, partner_side, state, ai_result, revealed_at)
  values
    ('d0d0d0d0-0000-0000-0000-000000000001'::uuid,
     'd7d7d7d7-0000-0000-0000-000000000001'::uuid,
     'the thing', 'side a', 'side b', 'revealed', '{"type":"mediation"}'::jsonb, now());

  select is(
    public._next_drop_for('d0d0d0d0-0000-0000-0000-000000000001'::uuid),
    '4e4a144e-0000-0000-0000-000000000002'::uuid,
    'the round after a refocus reveal boosts the next repair prompt'
  );

  -- play it (created_at now = after the reveal)
  insert into public.couple_drops (couple_id, drop_id, date, state)
  values ('d0d0d0d0-0000-0000-0000-000000000001'::uuid,
          '4e4a144e-0000-0000-0000-000000000002'::uuid, current_date - 9, 'revealed');

  -- ---- 5. boost window still open but repair content exhausted: falls through
  select isnt(
    (select theme from public.drops where id = public._next_drop_for('d0d0d0d0-0000-0000-0000-000000000001'::uuid)),
    'repair',
    'no unplayed repair content -> the branch falls through gracefully'
  );

  -- ---- 6. the served fallback is a real, eligible drop -----------------------
  select isnt(
    public._next_drop_for('d0d0d0d0-0000-0000-0000-000000000001'::uuid),
    null::uuid,
    'rotation always returns an eligible drop'
  );

  select * from finish();
rollback;
