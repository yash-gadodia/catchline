-- 0029_money_dates_reinforcement.sql
-- Two features (docs/IMPROVEMENT_PLAN.md P1 content engine + P4 rituals,
-- docs/research/2026-06-29-relationship-science.md "strong levers"):
--
--   A. Reinforcement drop kinds — drops.kind ('classic' | 'gratitude' | 'are'
--      | 'self_expansion') + 12 seeded global drops (couple_id null), served
--      as a ~1-in-5 cadence by _next_drop_for. Content levers, per the
--      research doc (no citations shipped in user-facing copy):
--        gratitude       — other-praising appreciation (praise THEM, not the
--                          benefit to you).
--        are             — accessibility / responsiveness / engagement
--                          check-ins, inspired by attachment-science (EFT)
--                          framing.
--        self_expansion  — novel shared-activity sparks against couple
--                          boredom.
--      Same 3-prompt / 5-option shape as the 0015 catalog, so play/reveal
--      need ZERO client changes — kind is a serving concern only.
--
--   B. Money Dates — a recurring guided money CONVERSATION (not budgeting, no
--      accounts, no advice): money_date_sessions + SECURITY DEFINER RPCs
--      (start / get-state / advance / complete). Done together on one phone;
--      ends with one tiny agreed action. Modeled on 0020 refocus_sessions.
--
-- _next_drop_for is copied forward from 0030 with ONE new branch + ONE fence:
--   priority: pack_override > own-couple scoped > reinforcement cadence (every
--   5th round, i.e. played-count % 5 = 4) > intent-weighted unplayed CLASSIC >
--   any unplayed eligible drop (so unplayed reinforcement still beats a repeat
--   when classics run out) > LRU cycle. Every 0030 fence is preserved:
--   couple scoping on every branch, spice gating, override consumed only on a
--   hit, LRU as the final fallback.
--
-- Idempotent: if-not-exists / on-conflict-do-nothing / create-or-replace /
-- drop-policy-if-exists. Depends on 0015 (position, spice) + 0030 (couple_id,
-- _next_drop_for(uuid, boolean)); independent of 0028/0031.

-- ----------------------------------------------------------------------------
-- A1. The kind column. Existing rows (and any future plain insert) stay
--     'classic'; the check constraint is added via a guard because Postgres
--     has no ADD CONSTRAINT IF NOT EXISTS.
-- ----------------------------------------------------------------------------
alter table public.drops
  add column if not exists kind text not null default 'classic';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drops_kind_check'
      and conrelid = 'public.drops'::regclass
  ) then
    alter table public.drops
      add constraint drops_kind_check
      check (kind in ('classic', 'gratitude', 'are', 'self_expansion'));
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- A2. The reinforcement starter set: 12 global drops x 3 prompts x 5 options.
--     Positions 301..312 sit past the base catalog (0..89) so they order only
--     among themselves — the cadence branch, not catalog order, serves them.
--     Spice 0 everywhere: appreciation and check-ins must reach sweet couples.
-- ----------------------------------------------------------------------------
-- NOTE (03-07-2026 ordering fix): this insert originally listed couple_id
-- (always null), but drops.couple_id is only created by 0030 — on a virgin
-- database, migrations apply 0029 BEFORE 0030 and the insert hard-failed
-- (42703). couple_id is omitted here (null is also 0030's column default),
-- so the end state is identical on databases that already applied the old
-- text. See 0032_fix_next_drop_for_ordering.sql for the function-clobber
-- half of the same ordering bug.
insert into public.drops (id, code, title, theme, position, spice, kind)
values
  -- gratitude: specific, other-praising appreciation
  ('66666666-6666-6666-6666-000000000001', 'GLOW 01', 'the glow file',        'deeper', 301, 0, 'gratitude'),
  ('66666666-6666-6666-6666-000000000002', 'GLOW 02', 'proud of you hours',   'deeper', 302, 0, 'gratitude'),
  ('66666666-6666-6666-6666-000000000003', 'GLOW 03', 'the thank-you backlog','deeper', 303, 0, 'gratitude'),
  ('66666666-6666-6666-6666-000000000004', 'GLOW 04', 'seen and noted',       'deeper', 304, 0, 'gratitude'),
  -- are: accessibility / responsiveness / engagement check-ins
  ('66666666-6666-6666-6666-000000000005', 'TUNE 01', 'can i reach you?',     'deeper', 305, 0, 'are'),
  ('66666666-6666-6666-6666-000000000006', 'TUNE 02', 'do you catch me?',     'deeper', 306, 0, 'are'),
  ('66666666-6666-6666-6666-000000000007', 'TUNE 03', 'all the way here',     'deeper', 307, 0, 'are'),
  ('66666666-6666-6666-6666-000000000008', 'TUNE 04', 'the signal check',     'deeper', 308, 0, 'are'),
  -- self_expansion: novel shared-activity sparks
  ('66666666-6666-6666-6666-000000000009', 'WILD 01', 'the never list',       'spark',  309, 0, 'self_expansion'),
  ('66666666-6666-6666-6666-000000000010', 'WILD 02', 'plot twist night',     'spark',  310, 0, 'self_expansion'),
  ('66666666-6666-6666-6666-000000000011', 'WILD 03', 'the someday heist',    'spark',  311, 0, 'self_expansion'),
  ('66666666-6666-6666-6666-000000000012', 'WILD 04', 'strangers again',      'spark',  312, 0, 'self_expansion')
on conflict (id) do nothing;

insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
values
  -- GLOW 01 · the glow file
  ('66666666-6666-6666-7777-000000000011', '66666666-6666-6666-6666-000000000001', 0, '🌟', 'this week, i most appreciated you for...', array['a small kindness you didn''t announce', 'carrying something heavy for us', 'making an ordinary moment fun', 'how you handled a hard thing', 'just being easy to come home to']),
  ('66666666-6666-6666-7777-000000000012', '66666666-6666-6666-6666-000000000001', 1, '🫶', 'the thing you do that i never say thank you for...', array['the invisible chores', 'listening to the same worry twice', 'letting me have my weird', 'keeping our people close', 'noticing before i say anything']),
  ('66666666-6666-6666-7777-000000000013', '66666666-6666-6666-6666-000000000001', 2, '💬', 'if i bragged about you to a stranger, i''d lead with...', array['how kind you are, for real', 'how funny you are off script', 'how hard you go for your people', 'your taste. impeccable', 'the way you just handle things']),
  -- GLOW 02 · proud of you hours
  ('66666666-6666-6666-7777-000000000021', '66666666-6666-6666-6666-000000000002', 0, '🏆', 'lately i''ve been quietly proud of you for...', array['pushing through the work stuff', 'a boundary you actually held', 'how you showed up for someone', 'a habit you''re building', 'staying soft in a hard week']),
  ('66666666-6666-6666-7777-000000000022', '66666666-6666-6666-6666-000000000002', 1, '🌱', 'the way you''ve grown that deserves flowers...', array['you ask for help now', 'you say the hard thing sooner', 'you rest without guilt, almost', 'you let the small stuff go', 'you back yourself more']),
  ('66666666-6666-6666-7777-000000000023', '66666666-6666-6666-6666-000000000002', 2, '✨', 'watching you do this is my favourite show...', array['you in your element', 'you cooking to a playlist', 'you winning over strangers', 'you hyped about your thing', 'you half-asleep and honest']),
  -- GLOW 03 · the thank-you backlog
  ('66666666-6666-6666-7777-000000000031', '66666666-6666-6666-6666-000000000003', 0, '💌', 'a thank you i owe you from way back...', array['for staying that one time', 'for a sacrifice you played down', 'for believing me first', 'for a kindness i never mentioned', 'for choosing us on a hard day']),
  ('66666666-6666-6666-7777-000000000032', '66666666-6666-6666-6666-000000000003', 1, '🧺', 'you make my life lighter by...', array['handling the boring stuff', 'defusing my spirals', 'making the plans happen', 'feeding me, honestly', 'turning errands into hangs']),
  ('66666666-6666-6666-7777-000000000033', '66666666-6666-6666-6666-000000000003', 2, '🎁', 'the gift you give me without knowing...', array['calm when i''m chaos', 'courage to try things', 'a soft place to land', 'someone to laugh with at 1am', 'the feeling of being picked']),
  -- GLOW 04 · seen and noted
  ('66666666-6666-6666-7777-000000000041', '66666666-6666-6666-6666-000000000004', 0, '👀', 'the effort of yours i see, even when i don''t say it...', array['how early you get up for us', 'the peacekeeping you do', 'the careful-with-money thing', 'the family stuff you carry', 'how you quietly keep improving']),
  ('66666666-6666-6666-7777-000000000042', '66666666-6666-6666-6666-000000000004', 1, '🌤', 'my day gets better the second you...', array['text me something dumb', 'walk in the door', 'laugh at my joke', 'send the song', 'say my name like that']),
  ('66666666-6666-6666-7777-000000000043', '66666666-6666-6666-6666-000000000004', 2, '🏅', 'the underrated thing about loving you...', array['the running jokes', 'the food discoveries', 'feeling safe being weird', 'your pep talks', 'the naps. elite']),
  -- TUNE 01 · can i reach you? (accessibility)
  ('66666666-6666-6666-7777-000000000051', '66666666-6666-6666-6666-000000000005', 0, '📡', 'when something''s wrong, reaching for you feels...', array['easy, always', 'easy once we''re alone', 'hard when you''re busy', 'hard if i think i caused it', 'easier by text first']),
  ('66666666-6666-6666-7777-000000000052', '66666666-6666-6666-6666-000000000005', 1, '🚪', 'when i go quiet, the way in is...', array['just sit with me', 'ask twice, gently', 'touch first, words later', 'give me an hour, then find me', 'food. i''m serious']),
  ('66666666-6666-6666-7777-000000000053', '66666666-6666-6666-6666-000000000005', 2, '🕰', 'lately, our time together has felt...', array['plenty, and easy', 'good but too scheduled', 'squeezed by everything', 'there, but distracted', 'i just want more of it']),
  -- TUNE 02 · do you catch me? (responsiveness)
  ('66666666-6666-6666-7777-000000000061', '66666666-6666-6666-6666-000000000006', 0, '🎣', 'when i hint that i need you, you usually...', array['catch it instantly', 'catch it a beat late', 'catch the big ones', 'need me to say it straight', 'catch it and act innocent']),
  ('66666666-6666-6666-7777-000000000062', '66666666-6666-6666-6666-000000000006', 1, '🌊', 'when i share a win, what i secretly want back...', array['full hype, loud', 'questions — tell me everything', 'quiet pride', 'a celebration plan', 'you bragging to other people']),
  ('66666666-6666-6666-7777-000000000063', '66666666-6666-6666-6666-000000000006', 2, '🧷', 'when i''m upset with you, what helps first...', array['hearing ''i''m here''', 'you putting the phone down', 'you asking, not guessing', 'a hand on me', 'space, then a check-back']),
  -- TUNE 03 · all the way here (engagement)
  ('66666666-6666-6666-7777-000000000071', '66666666-6666-6666-6666-000000000007', 0, '🫧', 'i feel you fully here when...', array['phones are face down', 'you ask the second question', 'we''re doing nothing, together', 'you remember the tiny thing', 'you find me across a room']),
  ('66666666-6666-6666-7777-000000000072', '66666666-6666-6666-6666-000000000007', 1, '🔌', 'the moment i tend to check out...', array['mid-stress, i go inward', 'when plans stack up', 'anytime after 10pm', 'when i feel criticised', 'i don''t leave — i just go quiet']),
  ('66666666-6666-6666-7777-000000000073', '66666666-6666-6666-6666-000000000007', 2, '🧲', 'this week, i felt closest to you when...', array['a random weekday laugh', 'an errand became a date', 'a late-night talk', 'you looked after me when i was low', 'a look that said everything']),
  -- TUNE 04 · the signal check
  ('66666666-6666-6666-7777-000000000081', '66666666-6666-6666-6666-000000000008', 0, '📶', 'my ''i need you'' signal usually looks like...', array['going quiet', 'extra jokes', 'hovering near you', 'the long sigh', 'saying it straight. growth']),
  ('66666666-6666-6666-7777-000000000082', '66666666-6666-6666-6666-000000000008', 1, '🛰', 'when we drift a little, i''d want us to...', array['name it early, gently', 'plan proper us-time', 'more touch, fewer talks', 'one honest check-in', 'laugh together, fast']),
  ('66666666-6666-6666-7777-000000000083', '66666666-6666-6666-6666-000000000008', 2, '💡', 'one thing that would make me feel more met this week...', array['a real how-are-you', 'help before i ask', 'your full attention for one hour', 'a tiny surprise', 'hearing what you like about us']),
  -- WILD 01 · the never list
  ('66666666-6666-6666-7777-000000000091', '66666666-6666-6666-6666-000000000009', 0, '🗺', 'the thing we''ve never done that i''d try tomorrow...', array['a sunrise mission', 'a city neither of us knows', 'a class we''d be bad at', 'actual outdoors camping', 'a day trip decided by coin flip']),
  ('66666666-6666-6666-7777-000000000092', '66666666-6666-6666-6666-000000000009', 1, '🎢', 'my kind of scared-but-in...', array['heights, somehow', 'performing anything', 'deep water', 'talking to strangers', 'ordering the mystery dish']),
  ('66666666-6666-6666-7777-000000000093', '66666666-6666-6666-6666-000000000009', 2, '🧪', 'the hobby i''d secretly love us to start...', array['climbing', 'pottery', 'a two-person sport', 'making music', 'growing something we can eat']),
  -- WILD 02 · plot twist night
  ('66666666-6666-6666-7777-000000000101', '66666666-6666-6666-6666-000000000010', 0, '🎲', 'one free evening, zero excuses — i pick...', array['a gig by a band we don''t know', 'a night swim', 'cooking a cuisine we can''t pronounce', 'arcade until close', 'getting lost on purpose']),
  ('66666666-6666-6666-7777-000000000102', '66666666-6666-6666-6666-000000000010', 1, '🧭', 'the version of us i want more of...', array['tourists in our own city', 'competitive us', 'learning-something us', 'out-past-midnight us', 'feral holiday us']),
  ('66666666-6666-6666-7777-000000000103', '66666666-6666-6666-6666-000000000010', 2, '🌶', 'a tiny dare i''d actually do this week...', array['swap phones for an evening', 'order for each other, no vetoes', 'talk to the couple next to us', 'a no-map walk', 'matching outfits. kidding. unless']),
  -- WILD 03 · the someday heist
  ('66666666-6666-6666-7777-000000000111', '66666666-6666-6666-6666-000000000011', 0, '✈️', 'the trip that lives rent-free in my head...', array['trains across somewhere far', 'an island with nothing to do', 'a food pilgrimage', 'snow, properly', 'the big backpack one']),
  ('66666666-6666-6666-7777-000000000112', '66666666-6666-6666-6666-000000000011', 1, '🛠', 'the thing i want us to build together...', array['a ridiculous fort, non-negotiable', 'a tiny side hustle', 'a bookshelf we argue over', 'a garden', 'a two-person tradition']),
  ('66666666-6666-6666-7777-000000000113', '66666666-6666-6666-6666-000000000011', 2, '🎯', 'the new thing i''d actually commit to this month...', array['a weekly try-something night', 'one new dish each week', 'a standing sunset walk', 'a game we both learn', 'saying yes to the weird invite']),
  -- WILD 04 · strangers again
  ('66666666-6666-6666-7777-000000000121', '66666666-6666-6666-6666-000000000012', 0, '🕶', 'if we met again this weekend, i''d take you...', array['somewhere with terrible parking and great food', 'dancing, no skills required', 'a museum then a long walk', 'a market at opening time', 'the lookout point, obviously']),
  ('66666666-6666-6666-7777-000000000122', '66666666-6666-6666-6666-000000000012', 1, '🎭', 'skill swap: you teach me yours, i teach you...', array['my playlist science', 'my kitchen one-hander', 'my nap technique', 'my people-reading', 'my unhinged hobby']),
  ('66666666-6666-6666-7777-000000000123', '66666666-6666-6666-6666-000000000012', 2, '🌀', 'the routine i''d love us to break...', array['same three dinner spots', 'phones at breakfast', 'default-couch weekends', 'sleeping at different hours', 'saving fun for holidays'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- A3. _next_drop_for: 0030's function copied forward. New: the reinforcement
--     cadence branch (every 5th round) + the classic fence on the intent
--     branch + an any-kind unplayed fallback so an unplayed reinforcement
--     drop still beats an LRU repeat. Signature unchanged (uuid, boolean).
--     Priority: pack_override > own-couple > cadence > intent-weighted
--     classic > any unplayed > LRU.
-- ----------------------------------------------------------------------------
create or replace function public._next_drop_for(p_couple uuid, p_use_override boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_override text;
  v_allowed int;
  v_drop_id uuid;
  v_played int;
begin
  select c.member_a, c.member_b, c.pack_override
    into v_member_a, v_member_b, v_override
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  v_allowed := coalesce((
    select min(case lower(p.spice_level) when 'sweet' then 0 when 'spicy' then 2 else 1 end)
    from public.profiles p
    where p.id in (v_member_a, v_member_b)
  ), 1);

  -- 5.3: a sent pack steers the next drop, once — consumed only on a hit.
  if p_use_override and v_override is not null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.theme = v_override
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

    if v_drop_id is not null then
      update public.couples set pack_override = null where id = p_couple;
      return v_drop_id;
    end if;
  end if;

  -- v2: the couple's OWN scoped unplayed drops (its personal moat) win over
  -- any global pick. Spice-gated, catalog order.
  select d.id into v_drop_id
  from public.drops d
  where d.position is not null
    and d.couple_id = p_couple
    and d.spice <= v_allowed
    and not exists (
      select 1 from public.couple_drops cd
      where cd.couple_id = p_couple and cd.drop_id = d.id
    )
  order by d.position
  limit 1;

  if v_drop_id is not null then
    return v_drop_id;
  end if;

  -- 0029: reinforcement cadence — every 5th round (the couple's 5th, 10th, …
  -- drop, i.e. played-count % 5 = 4) serves one unplayed reinforcement drop
  -- (kind <> 'classic'), fenced exactly like every other branch. Nothing
  -- unplayed of those kinds -> fall through unchanged.
  select count(*) into v_played
  from public.couple_drops cd
  where cd.couple_id = p_couple;

  if v_played % 5 = 4 then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.kind <> 'classic'
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

    if v_drop_id is not null then
      return v_drop_id;
    end if;
  end if;

  -- 1.3: unplayed CLASSIC drops, themes matching either member's intents
  -- first. Reinforcement kinds are held back for the cadence branch so they
  -- sprinkle (~1-in-5) instead of clumping in catalog order.
  with intent_themes as (
    select distinct m.theme
    from public.profiles p
    cross join lateral unnest(coalesce(p.intents, '{}')) as i(intent)
    join (values
      ('know', 'deeper'), ('know', 'memory'),
      ('talk', 'spark'),  ('talk', 'daily'),
      ('rough', 'deeper'),
      ('far', 'memory'),  ('far', 'daily'),
      ('fun', 'fun'),     ('fun', 'spark'), ('fun', 'spicy')
    ) as m(intent, theme) on m.intent = i.intent
    where p.id in (v_member_a, v_member_b)
  )
  select d.id into v_drop_id
  from public.drops d
  where d.position is not null
    and d.kind = 'classic'
    and (d.couple_id is null or d.couple_id = p_couple)
    and d.spice <= v_allowed
    and not exists (
      select 1 from public.couple_drops cd
      where cd.couple_id = p_couple and cd.drop_id = d.id
    )
  order by (d.theme in (select theme from intent_themes)) desc,
           d.position
  limit 1;

  -- 0029: classics exhausted — any unplayed eligible drop (any kind) still
  -- beats recycling. Repeat-prompt rate stays 0 while anything is unplayed.
  if v_drop_id is null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;
  end if;

  -- Catalog exhausted: cycle from the least-recently-used eligible drop.
  if v_drop_id is null then
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and (d.couple_id is null or d.couple_id = p_couple)
      and d.spice <= v_allowed
    order by (select max(cd.date)
              from public.couple_drops cd
              where cd.couple_id = p_couple and cd.drop_id = d.id) asc,
             d.position asc
    limit 1;
  end if;

  if v_drop_id is null then
    raise exception 'no eligible drop in catalog';
  end if;

  return v_drop_id;
end;
$$;

revoke all on function public._next_drop_for(uuid, boolean) from public;

-- ============================================================================
-- B. Money Dates — the guided money conversation.
-- ============================================================================

-- The session: one per sitting, done together on one phone. `step` is the
-- next card to show (0-based); `responses` accumulates the couple's optional
-- shared notes as they advance; `agreed_action` is the one tiny thing they
-- leave with. Card CONTENT lives in the client (it's copy, not data) — the
-- server owns progress, the outcome, and who can see it.
create table if not exists public.money_date_sessions (
  id uuid not null primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  started_by uuid not null references public.profiles(id) on delete cascade,
  step int not null default 0 check (step between 0 and 16),
  responses jsonb not null default '[]'::jsonb,
  agreed_action text check (agreed_action is null or char_length(agreed_action) between 1 and 280),
  state text not null default 'open' check (state in ('open', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists money_date_sessions_couple_time
  on public.money_date_sessions (couple_id, created_at desc);

alter table public.money_date_sessions enable row level security;

-- 0006 lesson: grants open the door, RLS gates the rows. SELECT only —
-- every write goes through the DEFINER RPCs below.
grant select on public.money_date_sessions to authenticated;
grant select, insert, update, delete on public.money_date_sessions to service_role;

drop policy if exists "money_date_sessions_select_member" on public.money_date_sessions;
create policy "money_date_sessions_select_member"
  on public.money_date_sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.couples c
      where c.id = couple_id
        and (c.member_a = auth.uid() or c.member_b = auth.uid())
    )
  );

-- ============================================================================
-- start_money_date(p_couple) -> uuid
-- Opens (or resumes) the couple's money date. A same-day-ish (< 24h) open
-- session resumes — it's one shared phone, interruptions happen. Older open
-- sessions flip to 'abandoned' so a stale half-date never resurrects weeks
-- later mid-card.
-- ============================================================================
create or replace function public.start_money_date(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  update public.money_date_sessions
  set state = 'abandoned'
  where couple_id = p_couple
    and state = 'open'
    and created_at < now() - interval '24 hours';

  select s.id into v_session_id
  from public.money_date_sessions s
  where s.couple_id = p_couple
    and s.state = 'open'
  order by s.created_at desc
  limit 1;

  if v_session_id is not null then
    return v_session_id;
  end if;

  insert into public.money_date_sessions (couple_id, started_by)
  values (p_couple, auth.uid())
  returning id into v_session_id;

  return v_session_id;
end;
$$;

grant execute on function public.start_money_date(uuid) to authenticated;

-- ============================================================================
-- get_money_date_state(p_couple) -> jsonb
-- Everything the Us row + the session screen need in one round trip:
--   { open: {id, step, started_by} | null,
--     last_completed_at, last_agreed_action, sessions_completed }
-- Only a fresh (< 24h) open session counts as resumable, matching start.
-- ============================================================================
create or replace function public.get_money_date_state(p_couple uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open jsonb;
begin
  if not exists (
    select 1
    from public.couples c
    where c.id = p_couple
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select jsonb_build_object('id', s.id, 'step', s.step, 'started_by', s.started_by)
    into v_open
  from public.money_date_sessions s
  where s.couple_id = p_couple
    and s.state = 'open'
    and s.created_at >= now() - interval '24 hours'
  order by s.created_at desc
  limit 1;

  return jsonb_build_object(
    'open', coalesce(v_open, 'null'::jsonb),
    'last_completed_at', (
      select max(s.completed_at)
      from public.money_date_sessions s
      where s.couple_id = p_couple and s.state = 'completed'
    ),
    'last_agreed_action', (
      select s.agreed_action
      from public.money_date_sessions s
      where s.couple_id = p_couple and s.state = 'completed'
      order by s.completed_at desc
      limit 1
    ),
    'sessions_completed', (
      select count(*)
      from public.money_date_sessions s
      where s.couple_id = p_couple and s.state = 'completed'
    )
  );
end;
$$;

grant execute on function public.get_money_date_state(uuid) to authenticated;

-- ============================================================================
-- advance_money_date(p_session, p_note) -> int
-- Records the (optional, shared) note for the current card and moves to the
-- next one. Returns the new step. Either member may drive — one phone.
-- ============================================================================
create or replace function public.advance_money_date(
  p_session uuid,
  p_note text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.money_date_sessions%rowtype;
  v_note text;
begin
  select * into v_session
  from public.money_date_sessions
  where id = p_session
  for update;

  if v_session.id is null then
    raise exception 'money_date_not_found';
  end if;

  if not exists (
    select 1
    from public.couples c
    where c.id = v_session.couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_session.state <> 'open' then
    raise exception 'money_date_not_open';
  end if;

  if v_session.step >= 16 then
    raise exception 'money_date_step_limit';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if char_length(coalesce(v_note, '')) > 2000 then
    raise exception 'money_date_note_too_long';
  end if;

  update public.money_date_sessions
  set responses = responses || jsonb_build_object('step', v_session.step, 'note', v_note),
      step = v_session.step + 1
  where id = p_session;

  return v_session.step + 1;
end;
$$;

grant execute on function public.advance_money_date(uuid, text) to authenticated;

-- ============================================================================
-- complete_money_date(p_session, p_action) -> void
-- The whole point: one tiny agreed action, in their own words. Required,
-- <= 280 chars. Completing stamps completed_at (the Us row's "last money
-- date" date).
-- ============================================================================
create or replace function public.complete_money_date(
  p_session uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.money_date_sessions%rowtype;
  v_action text;
begin
  select * into v_session
  from public.money_date_sessions
  where id = p_session
  for update;

  if v_session.id is null then
    raise exception 'money_date_not_found';
  end if;

  if not exists (
    select 1
    from public.couples c
    where c.id = v_session.couple_id
      and (c.member_a = auth.uid() or c.member_b = auth.uid())
  ) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  if v_session.state <> 'open' then
    raise exception 'money_date_not_open';
  end if;

  v_action := trim(coalesce(p_action, ''));
  if v_action = '' then
    raise exception 'money_date_action_required';
  end if;
  if char_length(v_action) > 280 then
    raise exception 'money_date_action_too_long';
  end if;

  update public.money_date_sessions
  set state = 'completed',
      agreed_action = v_action,
      completed_at = now()
  where id = p_session;
end;
$$;

grant execute on function public.complete_money_date(uuid, text) to authenticated;
