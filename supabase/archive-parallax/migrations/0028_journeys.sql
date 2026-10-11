-- 0028_journeys.sql
-- Milestone Journeys (STRATEGY §5/§6 1.2): the retention spine for couples
-- living a shared life milestone. A journey is a catalog of ordered stages;
-- each stage carries its own "decisions to align on" prompts, a check-in
-- question, and an optional link into the drop catalog's themes (stage-aware
-- drops later). Couples enroll, check in per stage, and advance — server-gated:
-- a stage advances only when a check-in for it is recorded.
--
-- Design decisions:
--   * Catalog (journeys, journey_stages) is global and readable by any
--     authenticated user — like the drops catalog (0002/0006). Anon holds no
--     policy; the demo reads sample data, never the catalog.
--   * Enrollment rows (couple_journeys, couple_journey_stages,
--     journey_checkins) are member-only via RLS; all writes go through
--     SECURITY DEFINER RPCs (the 0014/0027 pattern) — no INSERT/UPDATE
--     policies exist, so the tables are read-only to clients.
--   * The advance gate requires a check-in from EITHER member, not both —
--     laws #8 (no guilt-debt) and the asymmetric-motivation rule: a quieter
--     partner must never dead-end the couple's journey.
--   * Grants per the 0006 lesson: default privileges give authenticated no
--     DML — every table gets an explicit `grant select`; RLS gates rows.
--   * First shipped journey: "the bto journey" — ballot → unit pick → build
--     wait → money → keys → reno → move-in. Seeded here with fixed UUIDs so
--     re-running is a no-op.
--
-- Idempotent: if-not-exists / create-or-replace / drop-policy-if-exists /
-- on-conflict-do-nothing.

-- ----------------------------------------------------------------------------
-- 1. Catalog tables.
-- ----------------------------------------------------------------------------
create table if not exists public.journeys (
  id uuid not null primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  emoji text,
  tagline text,
  description text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.journey_stages (
  id uuid not null primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  position int not null,
  emoji text,
  title text not null,
  kick text,
  description text,
  -- [{"emoji": "…", "text": "…"}, …] — the stage's "decisions to align on".
  talk_prompts jsonb not null default '[]'::jsonb,
  checkin_prompt text not null,
  -- Optional bridge into the drop catalog's themes (stage-aware drops later).
  theme text,
  created_at timestamptz default now(),
  unique (journey_id, position)
);

-- ----------------------------------------------------------------------------
-- 2. Enrollment + progression tables.
-- ----------------------------------------------------------------------------
create table if not exists public.couple_journeys (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  current_stage int not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz default now(),
  unique (couple_id, journey_id)
);

-- Stage progression timestamps: one row per stage the couple has entered.
create table if not exists public.couple_journey_stages (
  id uuid not null primary key default gen_random_uuid(),
  couple_journey_id uuid not null references public.couple_journeys(id) on delete cascade,
  stage_position int not null,
  entered_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (couple_journey_id, stage_position)
);

-- One check-in per member per stage; visible to both (it's a shared marker,
-- not private feedback — contrast 0027's author-only closeness signal).
create table if not exists public.journey_checkins (
  id uuid not null primary key default gen_random_uuid(),
  couple_journey_id uuid not null references public.couple_journeys(id) on delete cascade,
  stage_position int not null,
  author uuid not null references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz default now(),
  unique (couple_journey_id, stage_position, author)
);

-- ----------------------------------------------------------------------------
-- 3. Grants + RLS.
-- ----------------------------------------------------------------------------
grant select on public.journeys to authenticated;
grant select on public.journey_stages to authenticated;
grant select on public.couple_journeys to authenticated;
grant select on public.couple_journey_stages to authenticated;
grant select on public.journey_checkins to authenticated;

alter table public.journeys enable row level security;
alter table public.journey_stages enable row level security;
alter table public.couple_journeys enable row level security;
alter table public.couple_journey_stages enable row level security;
alter table public.journey_checkins enable row level security;

drop policy if exists "journeys_select_authenticated" on public.journeys;
create policy "journeys_select_authenticated"
  on public.journeys
  for select
  to authenticated
  using (true);

drop policy if exists "journey_stages_select_authenticated" on public.journey_stages;
create policy "journey_stages_select_authenticated"
  on public.journey_stages
  for select
  to authenticated
  using (true);

drop policy if exists "couple_journeys_select_members" on public.couple_journeys;
create policy "couple_journeys_select_members"
  on public.couple_journeys
  for select
  to authenticated
  using (
    exists (
      select 1 from public.couples c
      where c.id = couple_journeys.couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

drop policy if exists "couple_journey_stages_select_members" on public.couple_journey_stages;
create policy "couple_journey_stages_select_members"
  on public.couple_journey_stages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.couple_journeys cj
      join public.couples c on c.id = cj.couple_id
      where cj.id = couple_journey_stages.couple_journey_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

drop policy if exists "journey_checkins_select_members" on public.journey_checkins;
create policy "journey_checkins_select_members"
  on public.journey_checkins
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.couple_journeys cj
      join public.couples c on c.id = cj.couple_id
      where cj.id = journey_checkins.couple_journey_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 4. RPCs (SECURITY DEFINER, membership-guarded — the 0014/0027 pattern).
-- ----------------------------------------------------------------------------

-- Enroll the couple in a journey. Idempotent: re-enrolling returns the
-- existing enrollment id.
create or replace function public.enroll_journey(p_couple uuid, p_journey uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_active boolean;
  v_id uuid;
begin
  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_member_a is null and v_member_b is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select j.active into v_active from public.journeys j where j.id = p_journey;
  if v_active is null then
    raise exception 'journey not found';
  end if;
  if not v_active then
    raise exception 'this journey is not open yet';
  end if;

  select cj.id into v_id
  from public.couple_journeys cj
  where cj.couple_id = p_couple and cj.journey_id = p_journey;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.couple_journeys (couple_id, journey_id)
  values (p_couple, p_journey)
  returning id into v_id;

  insert into public.couple_journey_stages (couple_journey_id, stage_position)
  values (v_id, 1)
  on conflict (couple_journey_id, stage_position) do nothing;

  return v_id;
end;
$$;

revoke all on function public.enroll_journey(uuid, uuid) from public;
grant execute on function public.enroll_journey(uuid, uuid) to authenticated;

-- The couple's journey surface in one round-trip: the current (or most
-- recent) enrollment, its stage pointer, both members' check-in state for the
-- current stage, and the stage progression timestamps.
create or replace function public.get_journey_state(p_couple uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_partner uuid;
  v_cj public.couple_journeys%rowtype;
  v_journey public.journeys%rowtype;
  v_stage_count int;
  v_me boolean;
  v_them boolean;
  v_stages json;
begin
  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- The in-progress enrollment wins; a fully completed one is still returned
  -- (the client shows the finished state) until a new journey is started.
  select * into v_cj
  from public.couple_journeys cj
  where cj.couple_id = p_couple
  order by (cj.completed_at is null) desc, cj.started_at desc
  limit 1;

  if v_cj.id is null then
    return json_build_object('exists', false);
  end if;

  select * into v_journey from public.journeys j where j.id = v_cj.journey_id;

  select count(*)::int into v_stage_count
  from public.journey_stages s where s.journey_id = v_cj.journey_id;

  v_partner := case when auth.uid() = v_member_a then v_member_b else v_member_a end;

  select exists (
    select 1 from public.journey_checkins jc
    where jc.couple_journey_id = v_cj.id
      and jc.stage_position = v_cj.current_stage
      and jc.author = auth.uid()
  ) into v_me;

  v_them := false;
  if v_partner is not null then
    select exists (
      select 1 from public.journey_checkins jc
      where jc.couple_journey_id = v_cj.id
        and jc.stage_position = v_cj.current_stage
        and jc.author = v_partner
    ) into v_them;
  end if;

  select coalesce(json_agg(json_build_object(
           'position', s.stage_position,
           'entered_at', s.entered_at,
           'completed_at', s.completed_at
         ) order by s.stage_position), '[]'::json)
    into v_stages
  from public.couple_journey_stages s
  where s.couple_journey_id = v_cj.id;

  return json_build_object(
    'exists', true,
    'couple_journey_id', v_cj.id,
    'journey_id', v_cj.journey_id,
    'slug', v_journey.slug,
    'title', v_journey.title,
    'emoji', v_journey.emoji,
    'stage_count', v_stage_count,
    'current_stage', v_cj.current_stage,
    'started_at', v_cj.started_at,
    'completed_at', v_cj.completed_at,
    'i_checked_in', v_me,
    'partner_checked_in', v_them,
    'stages', v_stages
  );
end;
$$;

revoke all on function public.get_journey_state(uuid) from public;
grant execute on function public.get_journey_state(uuid) to authenticated;

-- Record my check-in on the current stage (upsert — a re-check-in updates the
-- note). This is the stage's completion evidence; advancing requires one.
create or replace function public.record_journey_checkin(p_couple_journey uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cj public.couple_journeys%rowtype;
begin
  select cj.* into v_cj
  from public.couple_journeys cj
  join public.couples c on c.id = cj.couple_id
  where cj.id = p_couple_journey
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_cj.id is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_cj.completed_at is not null then
    raise exception 'this journey is already complete';
  end if;

  insert into public.journey_checkins (couple_journey_id, stage_position, author, note)
  values (p_couple_journey, v_cj.current_stage, auth.uid(), p_note)
  on conflict (couple_journey_id, stage_position, author)
  do update set note = excluded.note;
end;
$$;

revoke all on function public.record_journey_checkin(uuid, text) from public;
grant execute on function public.record_journey_checkin(uuid, text) to authenticated;

-- Advance to the next stage — server-gated: only when the current stage has a
-- recorded check-in (from either member). Advancing off the final stage
-- completes the journey.
create or replace function public.advance_journey_stage(p_couple_journey uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cj public.couple_journeys%rowtype;
  v_stage_count int;
  v_next int;
  v_done boolean := false;
begin
  select cj.* into v_cj
  from public.couple_journeys cj
  join public.couples c on c.id = cj.couple_id
  where cj.id = p_couple_journey
    and (c.member_a = auth.uid() or c.member_b = auth.uid())
  for update of cj;

  if v_cj.id is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_cj.completed_at is not null then
    raise exception 'this journey is already complete';
  end if;

  if not exists (
    select 1 from public.journey_checkins jc
    where jc.couple_journey_id = p_couple_journey
      and jc.stage_position = v_cj.current_stage
  ) then
    raise exception 'check in on this stage before moving on';
  end if;

  select count(*)::int into v_stage_count
  from public.journey_stages s where s.journey_id = v_cj.journey_id;

  update public.couple_journey_stages s
  set completed_at = now()
  where s.couple_journey_id = p_couple_journey
    and s.stage_position = v_cj.current_stage
    and s.completed_at is null;

  if v_cj.current_stage >= v_stage_count then
    v_done := true;
    update public.couple_journeys
    set completed_at = now()
    where id = p_couple_journey;
    v_next := v_cj.current_stage;
  else
    v_next := v_cj.current_stage + 1;
    update public.couple_journeys
    set current_stage = v_next
    where id = p_couple_journey;
    insert into public.couple_journey_stages (couple_journey_id, stage_position)
    values (p_couple_journey, v_next)
    on conflict (couple_journey_id, stage_position) do nothing;
  end if;

  return json_build_object('current_stage', v_next, 'completed', v_done);
end;
$$;

revoke all on function public.advance_journey_stage(uuid) from public;
grant execute on function public.advance_journey_stage(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Seed: THE BTO JOURNEY. Fixed UUIDs; re-running is a no-op.
--    ballot → unit pick → build wait → money → keys → reno → move-in.
-- ----------------------------------------------------------------------------
insert into public.journeys (id, slug, title, emoji, tagline, description, active)
values (
  '44444444-4444-4444-4444-000000000001',
  'bto',
  'the bto journey',
  '🏠',
  'from ballot night to your first morning in it',
  'singapore''s longest relationship arc: you apply for a flat that doesn''t exist yet, wait years while it grows out of a field, then fight about tiles. this journey keeps you two on the same page through every era — the anxious bits, the money bits, and the mattress-on-the-floor bit.',
  true
)
on conflict (id) do nothing;

insert into public.journey_stages (id, journey_id, position, emoji, title, kick, description, talk_prompts, checkin_prompt, theme)
values
  (
    '45454545-4545-4545-4545-000000000001',
    '44444444-4444-4444-4444-000000000001',
    1, '🎲', 'ballot szn', 'apply · pray · refresh',
    'the application is in and now it''s vibes and probability. everyone has an opinion, hdb has a queue, and you two have each other. the only real job this era: want the same thing out loud.',
    '[{"emoji":"🗺","text":"which estates are actually on our list — and which one is only on your mum''s"},
      {"emoji":"⏳","text":"how many rounds are we honestly willing to ballot before we change the plan"},
      {"emoji":"🅱️","text":"plan b, said out loud: resale? ec? another round? panic?"},
      {"emoji":"📣","text":"who do we tell about the application — and who finds out only if we get it"}]'::jsonb,
    'the ballot''s in. say how you''re actually feeling about it — one honest sentence each.',
    'deeper'
  ),
  (
    '45454545-4545-4545-4545-000000000002',
    '44444444-4444-4444-4444-000000000001',
    2, '🎟', 'queue number reveal', 'the unit pick',
    'a queue number is a lottery ticket with homework attached. floor, facing, afternoon sun, distance to the rubbish chute — every choice here is a tiny preview of how you two decide things.',
    '[{"emoji":"🌇","text":"high floor view vs five figures saved — which one of us flinches first"},
      {"emoji":"☀️","text":"west sun: dealbreaker, or ''we''ll get curtains''"},
      {"emoji":"🚇","text":"closer to the mrt or closer to whose parents (careful)"},
      {"emoji":"🚪","text":"the layout call: open kitchen dreams vs where the tv / altar / cat actually goes"}]'::jsonb,
    'unit picked (or this round skipped). what''s the one thing you compromised on for them?',
    'fun'
  ),
  (
    '45454545-4545-4545-4545-000000000003',
    '44444444-4444-4444-4444-000000000001',
    3, '🏗', 'the long wait', 'bto u/c',
    'your flat is currently a hole in the ground with a crane over it. years of living at your parents'', dates in other people''s neighbourhoods, and visiting a fence to point at concrete. couples who do the wait well practise being home to each other before the address exists.',
    '[{"emoji":"🏠","text":"living apart or at whose parents'' till keys — and our escape-hatch ritual for when it gets much"},
      {"emoji":"📅","text":"one slab-watch date per quarter: go point at the site, eat nearby, dream a bit"},
      {"emoji":"🧳","text":"what we''re saving for first: reno, wedding, honeymoon — rank them together"},
      {"emoji":"🫠","text":"if the completion date slips (it might), what do we do with the extra year"}]'::jsonb,
    'wait check: what''s one thing about not having the flat yet that''s secretly been good for us?',
    'daily'
  ),
  (
    '45454545-4545-4545-4545-000000000004',
    '44444444-4444-4444-4444-000000000001',
    4, '💸', 'money talks', 'cpf · grants · the sheet',
    'the flat is also a spreadsheet. cpf, grants, the downpayment, and the quiet question under all of it: how do we do money as an us? couples who fight about money usually skipped this era — have it on purpose.',
    '[{"emoji":"🏦","text":"joint account, split bills, or one pot — what are we actually doing"},
      {"emoji":"🧾","text":"the real number: a monthly mortgage we''re comfy with, not the max the bank says"},
      {"emoji":"💍","text":"wedding vs reno vs honeymoon — same pool of money, so say the priorities out loud"},
      {"emoji":"🆘","text":"if one of us loses a job mid-loan — the plan we hope we never use"}]'::jsonb,
    'money date done? write down the one number or rule you two agreed on.',
    'deeper'
  ),
  (
    '45454545-4545-4545-4545-000000000005',
    '44444444-4444-4444-4444-000000000001',
    5, '🔑', 'keys day', 'it''s real now',
    'an empty flat, an echo, and a letterbox with your names on it. take the photo at the door. (and yes — the paperwork wants you married soon, so the romance is literally scheduled.)',
    '[{"emoji":"📸","text":"the keys-day ritual: first photo, first meal on the floor, first plan"},
      {"emoji":"📋","text":"the defects walk: who holds the masking tape, who writes the list"},
      {"emoji":"💒","text":"rom timeline reality check — the flat says within three months, what do we say"},
      {"emoji":"🚿","text":"what needs to work before we can camp here: a fan, wifi, one working toilet"}]'::jsonb,
    'you stood inside it. describe the echo — what did keys day actually feel like?',
    'memory'
  ),
  (
    '45454545-4545-4545-4545-000000000006',
    '44444444-4444-4444-4444-000000000001',
    6, '🔨', 'the reno arc', 'id vs contractor vs us',
    'everyone warned you about this era. the group chat with the id, the tile that looked different on the sample, the third ikea trip this month. the reno tests one thing: can you two disagree about a carpentry quote and still share fries after.',
    '[{"emoji":"🎨","text":"the vibe, agreed once: japandi, warm minimal, hdb maximalist — pick it and stop re-picking"},
      {"emoji":"💥","text":"our reno fight rule: sleep on any decision above $500, no tile talk after 11pm"},
      {"emoji":"🪑","text":"the ikea protocol: list first, meatballs after, no feature-wall impulse buys"},
      {"emoji":"🛋","text":"one corner each: a spot in the flat that''s 100% yours, no committee"}]'::jsonb,
    'reno pulse: what did you two disagree on this week — and how did it end?',
    'daily'
  ),
  (
    '45454545-4545-4545-4545-000000000007',
    '44444444-4444-4444-4444-000000000001',
    7, '🛏', 'move-in night', 'mattress on the floor',
    'no bed frame yet, boxes everywhere, dinner eaten sitting on the floor. this is the part you''ll tell people about in ten years. the flat took years — being home takes one night.',
    '[{"emoji":"🍜","text":"first meal in the flat: cooked, dabao''d, or delivered — whatever it is, it''s the tradition now"},
      {"emoji":"📦","text":"the unpacking treaty: one room at a time, and which room wins"},
      {"emoji":"🖼","text":"the first thing we hang on a wall — and where the ballot-era photo goes"},
      {"emoji":"🌅","text":"tomorrow''s first morning: kopi run, ikea run, or absolutely nothing"}]'::jsonb,
    'first night done. what''s the moment from move-in you never want to forget?',
    'spark'
  )
on conflict (id) do nothing;
