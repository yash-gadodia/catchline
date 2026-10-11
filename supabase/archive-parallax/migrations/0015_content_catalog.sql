-- 0015_content_catalog.sql
-- Phase 1.1 (docs/IMPROVEMENT_PLAN.md §4): the DB-backed content catalog.
-- Until now every couple got DROP 27 every day forever. This migration:
--   1. adds drops.position (rotation order) + drops.spice (0=sweet, 1=warm,
--      2=spicy — the max spice of any prompt in the drop),
--   2. seeds 89 new drops (positions 1..89, DROP 28..DROP 116), 3 prompts of
--      5 options each, fixed UUIDs so re-running is a no-op,
--   3. replaces ensure_today_drop with per-couple rotation: next unused drop
--      by position, filtered to the couple's allowed spice (least of the two
--      members' profiles.spice_level: sweet=0, flirty=1, spicy=2, null=1;
--      a pending couple uses member_a's level alone). When every eligible
--      drop has been used, cycle from the least-recently-used one.
-- 0014's signature, membership guard, and couple-local-date behavior are
-- preserved exactly. Grants: drops/drop_prompts already have select policies
-- (0002) + table-level grants (0006), which cover new columns — nothing new
-- to grant.

alter table public.drops
  add column if not exists position int,
  add column if not exists spice int not null default 0;

-- DROP 27 (the original seed) joins the rotation at position 0; its third
-- prompt is flirty, so the drop is spice 1.
update public.drops
set position = 0, spice = 1
where id = '11111111-1111-1111-1111-111111111111'::uuid;

-- ----------------------------------------------------------------------------
-- The catalog: 89 drops x 3 prompts x 5 options. Positions are pre-shuffled so
-- consecutive days alternate themes (deeper/fun/spark/daily/memory/spicy).
-- ----------------------------------------------------------------------------
insert into public.drops (id, code, title, theme, position, spice)
values
  ('22222222-2222-2222-2222-000000000001', 'DROP 28', 'hot takes', 'fun', 1, 0),
  ('22222222-2222-2222-2222-000000000002', 'DROP 29', 'the quiet stuff', 'deeper', 2, 0),
  ('22222222-2222-2222-2222-000000000003', 'DROP 30', 'domestic bliss', 'daily', 3, 0),
  ('22222222-2222-2222-2222-000000000004', 'DROP 31', 'the butterflies file', 'spark', 4, 1),
  ('22222222-2222-2222-2222-000000000005', 'DROP 32', 'how to love me', 'deeper', 5, 0),
  ('22222222-2222-2222-2222-000000000006', 'DROP 33', 'the first files', 'memory', 6, 0),
  ('22222222-2222-2222-2222-000000000007', 'DROP 34', 'superpowers & flaws', 'fun', 7, 0),
  ('22222222-2222-2222-2222-000000000008', 'DROP 35', 'after dark', 'spicy', 8, 2),
  ('22222222-2222-2222-2222-000000000009', 'DROP 36', 'under the surface', 'deeper', 9, 0),
  ('22222222-2222-2222-2222-000000000010', 'DROP 37', 'the petty files', 'fun', 10, 0),
  ('22222222-2222-2222-2222-000000000011', 'DROP 38', 'date night draft', 'spark', 11, 1),
  ('22222222-2222-2222-2222-000000000012', 'DROP 39', 'the inner critic', 'deeper', 12, 0),
  ('22222222-2222-2222-2222-000000000013', 'DROP 40', 'morning report', 'daily', 13, 0),
  ('22222222-2222-2222-2222-000000000014', 'DROP 41', 'would i ever', 'fun', 14, 0),
  ('22222222-2222-2222-2222-000000000015', 'DROP 42', 'feeling safe', 'deeper', 15, 0),
  ('22222222-2222-2222-2222-000000000016', 'DROP 43', 'the small hours', 'daily', 16, 0),
  ('22222222-2222-2222-2222-000000000017', 'DROP 44', 'the attraction map', 'spark', 17, 1),
  ('22222222-2222-2222-2222-000000000018', 'DROP 45', 'the real me', 'deeper', 18, 0),
  ('22222222-2222-2222-2222-000000000019', 'DROP 46', 'kid stuff', 'memory', 19, 0),
  ('22222222-2222-2222-2222-000000000020', 'DROP 47', 'snack court', 'fun', 20, 0),
  ('22222222-2222-2222-2222-000000000021', 'DROP 48', 'the tension', 'spicy', 21, 2),
  ('22222222-2222-2222-2222-000000000022', 'DROP 49', 'hard to say', 'deeper', 22, 0),
  ('22222222-2222-2222-2222-000000000023', 'DROP 50', 'main character', 'fun', 23, 0),
  ('22222222-2222-2222-2222-000000000024', 'DROP 51', 'touch language', 'spark', 24, 1),
  ('22222222-2222-2222-2222-000000000025', 'DROP 52', 'what love looks like', 'deeper', 25, 0),
  ('22222222-2222-2222-2222-000000000026', 'DROP 53', 'food logistics', 'daily', 26, 0),
  ('22222222-2222-2222-2222-000000000027', 'DROP 54', 'tiny chaos', 'fun', 27, 0),
  ('22222222-2222-2222-2222-000000000028', 'DROP 55', 'the worry file', 'deeper', 28, 0),
  ('22222222-2222-2222-2222-000000000029', 'DROP 56', 'the balance sheet', 'daily', 29, 0),
  ('22222222-2222-2222-2222-000000000030', 'DROP 57', 'the compliment shop', 'spark', 30, 1),
  ('22222222-2222-2222-2222-000000000031', 'DROP 58', 'growing up me', 'deeper', 31, 0),
  ('22222222-2222-2222-2222-000000000032', 'DROP 59', 'the archives', 'memory', 32, 0),
  ('22222222-2222-2222-2222-000000000033', 'DROP 60', 'game night me', 'fun', 33, 0),
  ('22222222-2222-2222-2222-000000000034', 'DROP 61', 'said out loud', 'spicy', 34, 2),
  ('22222222-2222-2222-2222-000000000035', 'DROP 62', 'measuring up', 'deeper', 35, 0),
  ('22222222-2222-2222-2222-000000000036', 'DROP 63', 'internet me', 'fun', 36, 0),
  ('22222222-2222-2222-2222-000000000037', 'DROP 64', 'romance rewind', 'spark', 37, 1),
  ('22222222-2222-2222-2222-000000000038', 'DROP 65', 'the tender spots', 'deeper', 38, 0),
  ('22222222-2222-2222-2222-000000000039', 'DROP 66', 'house rules', 'daily', 39, 0),
  ('22222222-2222-2222-2222-000000000040', 'DROP 67', 'harmless lies', 'fun', 40, 0),
  ('22222222-2222-2222-2222-000000000041', 'DROP 68', 'the dream file', 'deeper', 41, 0),
  ('22222222-2222-2222-2222-000000000042', 'DROP 69', 'the admin pile', 'daily', 42, 0),
  ('22222222-2222-2222-2222-000000000043', 'DROP 70', 'feeling chosen', 'spark', 43, 1),
  ('22222222-2222-2222-2222-000000000044', 'DROP 71', 'how i fight', 'deeper', 44, 0),
  ('22222222-2222-2222-2222-000000000045', 'DROP 72', 'teenage me', 'memory', 45, 0),
  ('22222222-2222-2222-2222-000000000046', 'DROP 73', 'skills audit', 'fun', 46, 0),
  ('22222222-2222-2222-2222-000000000047', 'DROP 74', 'the memory reel', 'spicy', 47, 2),
  ('22222222-2222-2222-2222-000000000048', 'DROP 75', 'the energy map', 'deeper', 48, 0),
  ('22222222-2222-2222-2222-000000000049', 'DROP 76', 'sleep species', 'fun', 49, 0),
  ('22222222-2222-2222-2222-000000000050', 'DROP 77', 'slow dance', 'spark', 50, 1),
  ('22222222-2222-2222-2222-000000000051', 'DROP 78', 'being known', 'deeper', 51, 0),
  ('22222222-2222-2222-2222-000000000052', 'DROP 79', 'energy hours', 'daily', 52, 0),
  ('22222222-2222-2222-2222-000000000053', 'DROP 80', 'money funny', 'fun', 53, 0),
  ('22222222-2222-2222-2222-000000000054', 'DROP 81', 'my seasons', 'deeper', 54, 0),
  ('22222222-2222-2222-2222-000000000055', 'DROP 82', 'weekend engineering', 'daily', 55, 0),
  ('22222222-2222-2222-2222-000000000056', 'DROP 83', 'the want list', 'spark', 56, 1),
  ('22222222-2222-2222-2222-000000000057', 'DROP 84', 'the tiny truths', 'deeper', 57, 0),
  ('22222222-2222-2222-2222-000000000058', 'DROP 85', 'our greatest hits', 'memory', 58, 0),
  ('22222222-2222-2222-2222-000000000059', 'DROP 86', 'fashion crimes', 'fun', 59, 0),
  ('22222222-2222-2222-2222-000000000060', 'DROP 87', 'instruction manual', 'spicy', 60, 2),
  ('22222222-2222-2222-2222-000000000061', 'DROP 88', 'the hard seasons', 'deeper', 61, 0),
  ('22222222-2222-2222-2222-000000000062', 'DROP 89', 'petty talents', 'fun', 62, 0),
  ('22222222-2222-2222-2222-000000000063', 'DROP 90', 'heat check', 'spark', 63, 1),
  ('22222222-2222-2222-2222-000000000064', 'DROP 91', 'what i believe', 'deeper', 64, 0),
  ('22222222-2222-2222-2222-000000000065', 'DROP 92', 'the little economies', 'daily', 65, 0),
  ('22222222-2222-2222-2222-000000000066', 'DROP 93', 'the group chat', 'fun', 66, 0),
  ('22222222-2222-2222-2222-000000000067', 'DROP 94', 'the soft ego', 'deeper', 67, 0),
  ('22222222-2222-2222-2222-000000000068', 'DROP 95', 'sick day me', 'daily', 68, 0),
  ('22222222-2222-2222-2222-000000000069', 'DROP 96', 'the little rituals', 'spark', 69, 1),
  ('22222222-2222-2222-2222-000000000070', 'DROP 97', 'the maintenance manual', 'deeper', 70, 0),
  ('22222222-2222-2222-2222-000000000071', 'DROP 98', 'the places', 'memory', 71, 0),
  ('22222222-2222-2222-2222-000000000072', 'DROP 99', 'conspiracy corner', 'fun', 72, 0),
  ('22222222-2222-2222-2222-000000000073', 'DROP 100', 'bold requests', 'spicy', 73, 2),
  ('22222222-2222-2222-2222-000000000074', 'DROP 101', 'the future us', 'deeper', 74, 0),
  ('22222222-2222-2222-2222-000000000075', 'DROP 102', 'rate my chaos', 'fun', 75, 0),
  ('22222222-2222-2222-2222-000000000076', 'DROP 103', 'love letters', 'spark', 76, 1),
  ('22222222-2222-2222-2222-000000000077', 'DROP 104', 'the ledger', 'deeper', 77, 0),
  ('22222222-2222-2222-2222-000000000078', 'DROP 105', 'the systems check', 'daily', 78, 0),
  ('22222222-2222-2222-2222-000000000079', 'DROP 106', 'little firsts', 'memory', 79, 0),
  ('22222222-2222-2222-2222-000000000080', 'DROP 107', 'the daring bit', 'spark', 80, 1),
  ('22222222-2222-2222-2222-000000000081', 'DROP 108', 'kitchen court', 'fun', 81, 0),
  ('22222222-2222-2222-2222-000000000082', 'DROP 109', 'nostalgia tech', 'memory', 82, 0),
  ('22222222-2222-2222-2222-000000000083', 'DROP 110', 'the debrief', 'spicy', 83, 2),
  ('22222222-2222-2222-2222-000000000084', 'DROP 111', 'us against the world', 'spark', 84, 1),
  ('22222222-2222-2222-2222-000000000085', 'DROP 112', 'the last 1%', 'deeper', 85, 0),
  ('22222222-2222-2222-2222-000000000086', 'DROP 113', 'the people', 'memory', 86, 0),
  ('22222222-2222-2222-2222-000000000087', 'DROP 114', 'the audit', 'fun', 87, 0),
  ('22222222-2222-2222-2222-000000000088', 'DROP 115', 'the spark plan', 'spark', 88, 1),
  ('22222222-2222-2222-2222-000000000089', 'DROP 116', 'time capsule', 'memory', 89, 0)
on conflict (id) do nothing;

insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
values
  ('33333333-3333-3333-3333-000000000100', '22222222-2222-2222-2222-000000000001', 0, '🍕', 'my most defendable food crime...', array['pineapple on pizza', 'cereal for dinner', 'sauce on everything', 'cold pizza for breakfast', 'fries dipped in ice cream']),
  ('33333333-3333-3333-3333-000000000101', '22222222-2222-2222-2222-000000000001', 1, '🎬', 'the beloved thing i secretly find overrated...', array['superhero movies', 'brunch', 'beach holidays', 'wine', 'big group birthday dinners']),
  ('33333333-3333-3333-3333-000000000102', '22222222-2222-2222-2222-000000000001', 2, '🧠', 'a hill i will absolutely die on...', array['phone calls need warning texts', 'the middle armrest is mine', 'soup is not a meal', 'cinema popcorn counts as dinner', 'early is on time']),
  ('33333333-3333-3333-3333-000000000200', '22222222-2222-2222-2222-000000000002', 0, '🤫', 'when i go quiet, it usually means...', array['i''m processing something', 'i''m tired, not upset', 'i need a minute alone', 'something''s on my mind', 'my social battery died']),
  ('33333333-3333-3333-3333-000000000201', '22222222-2222-2222-2222-000000000002', 1, '🪫', 'my social battery drains fastest when...', array['small talk with strangers', 'big loud groups', 'being ''on'' all day', 'people needing things from me', 'plans that run too long']),
  ('33333333-3333-3333-3333-000000000202', '22222222-2222-2222-2222-000000000002', 2, '🌙', 'what i think about when i can''t sleep...', array['a conversation on replay', 'tomorrow''s list', 'a feeling i can''t name', 'random 3am spirals', 'us, actually']),
  ('33333333-3333-3333-3333-000000000300', '22222222-2222-2222-2222-000000000003', 0, '🧺', 'the chore i secretly don''t mind...', array['folding warm laundry', 'dishes with a podcast', 'grocery runs', 'vacuuming perfect lines', 'watering the plants']),
  ('33333333-3333-3333-3333-000000000301', '22222222-2222-2222-2222-000000000003', 1, '🛋', 'my ideal weeknight looks like...', array['couch, show, snacks', 'early workout, early sleep', 'cooking something new', 'out with people', 'rearranging furniture at 10pm']),
  ('33333333-3333-3333-3333-000000000302', '22222222-2222-2222-2222-000000000003', 2, '🧽', 'my cleaning style is...', array['little and often', 'one big weekend blitz', 'only when guests loom', 'chaos with clean pockets', 'music on, full performance']),
  ('33333333-3333-3333-3333-000000000400', '22222222-2222-2222-2222-000000000004', 0, '🦋', 'you still give me butterflies when...', array['you dress up', 'you laugh at my joke', 'you find me across a crowd', 'you smell like you', 'you say my name softly']),
  ('33333333-3333-3333-3333-000000000401', '22222222-2222-2222-2222-000000000004', 1, '💘', 'my favourite kind of kiss...', array['the slow goodbye one', 'forehead, i melt', 'the surprise mid-sentence one', 'the laughing-too-hard one', 'the ''finally home'' one']),
  ('33333333-3333-3333-3333-000000000402', '22222222-2222-2222-2222-000000000004', 2, '🌹', 'flirt with me best by...', array['teasing me', 'the eye contact thing', 'random compliments', 'a hand on my back in passing', 'remembering something tiny']),
  ('33333333-3333-3333-3333-000000000500', '22222222-2222-2222-2222-000000000005', 0, '💌', 'the compliment that actually lands for me...', array['about my mind', 'about my looks', 'how i treat people', 'my taste', 'something tiny only you''d notice']),
  ('33333333-3333-3333-3333-000000000501', '22222222-2222-2222-2222-000000000005', 1, '🗣', 'what i need to hear more often...', array['i''m proud of you', 'you''re doing enough', 'i''ve got you', 'you look good today', 'i love your weird brain']),
  ('33333333-3333-3333-3333-000000000502', '22222222-2222-2222-2222-000000000005', 2, '🫂', 'the apology that actually works on me...', array['just say the words', 'a real hug', 'changed behaviour', 'give me time first', 'snacks help, honestly']),
  ('33333333-3333-3333-3333-000000000600', '22222222-2222-2222-2222-000000000006', 0, '💭', 'my clearest memory of us starting...', array['the first hello', 'a specific look', 'the first laugh we shared', 'walking somewhere together', 'the first text after meeting']),
  ('33333333-3333-3333-3333-000000000601', '22222222-2222-2222-2222-000000000006', 1, '😅', 'early on, i was nervous about...', array['saying something dumb', 'whether you liked me back', 'meeting your people', 'seeming too keen', 'my laugh, honestly']),
  ('33333333-3333-3333-3333-000000000602', '22222222-2222-2222-2222-000000000006', 2, '📌', 'the exact moment i knew...', array['a completely ordinary tuesday', 'watching you with others', 'a late-night talk', 'when something went wrong and you stayed', 'weirdly early, day one']),
  ('33333333-3333-3333-3333-000000000700', '22222222-2222-2222-2222-000000000007', 0, '🦸', 'my actually useless superpower...', array['finding parking', 'knowing song intros instantly', 'perfect microwave timing', 'sensing rain coming', 'remembering random birthdays']),
  ('33333333-3333-3333-3333-000000000701', '22222222-2222-2222-2222-000000000007', 1, '🧌', 'my villain origin story would start with...', array['slow walkers', 'people who spoil shows', 'group project freeloaders', 'reply-all emails', 'loud chewing']),
  ('33333333-3333-3333-3333-000000000702', '22222222-2222-2222-2222-000000000007', 2, '🎲', 'in a zombie apocalypse, i''m the one who...', array['makes the plan', 'hoards the snacks', 'adopts strangers emotionally', 'dies doing something dumb but brave', 'somehow thrives']),
  ('33333333-3333-3333-3333-000000000800', '22222222-2222-2222-2222-000000000008', 0, '🌙', 'i feel most wanted when you...', array['initiate first', 'say what you''re thinking', 'can''t stop looking', 'pull me closer half-asleep', 'tell me later what you liked']),
  ('33333333-3333-3333-3333-000000000801', '22222222-2222-2222-2222-000000000008', 1, '🕯', 'the mood that works on me...', array['low light, slow music', 'fresh sheets, no rush', 'post-date-night energy', 'the surprise kind', 'hotel-room energy']),
  ('33333333-3333-3333-3333-000000000802', '22222222-2222-2222-2222-000000000008', 2, '🥂', 'what makes me feel irresistible...', array['the way you look at me', 'getting dressed up', 'your hands finding me in passing', 'being told, in words', 'us laughing in between']),
  ('33333333-3333-3333-3333-000000000900', '22222222-2222-2222-2222-000000000009', 0, '🎭', 'the emotion i''m worst at showing...', array['sadness', 'fear', 'needing help', 'disappointment', 'how much i care']),
  ('33333333-3333-3333-3333-000000000901', '22222222-2222-2222-2222-000000000009', 1, '🧊', 'when something hurts me, i usually...', array['go quiet', 'make a joke of it', 'say it straight away', 'sit on it for days', 'pretend it''s fine until it isn''t']),
  ('33333333-3333-3333-3333-000000000902', '22222222-2222-2222-2222-000000000009', 2, '🔦', 'the fear i''d only admit to you...', array['not being enough', 'being left', 'wasting my potential', 'becoming my parents', 'losing people i love']),
  ('33333333-3333-3333-3333-000000001000', '22222222-2222-2222-2222-000000000010', 0, '😤', 'my most irrational pet peeve...', array['slow wifi rage', 'standing on the wrong side', 'unskippable ads', 'wet socks', '''we need to talk'' with no context']),
  ('33333333-3333-3333-3333-000000001001', '22222222-2222-2222-2222-000000000010', 1, '🙃', 'i will hold a grudge forever about...', array['a stolen fry', 'an argument i was right in', 'a game of uno', 'a spoiled ending', 'being left on read by the group chat']),
  ('33333333-3333-3333-3333-000000001002', '22222222-2222-2222-2222-000000000010', 2, '👑', 'the small win that makes me feel unstoppable...', array['green lights all the way', 'first-guess wordle', 'perfectly timed laundry', 'a free upgrade', 'winning an argument with receipts']),
  ('33333333-3333-3333-3333-000000001100', '22222222-2222-2222-2222-000000000011', 0, '🍝', 'my dream date with you...', array['hole-in-the-wall food hunt', 'dressed up, proper dinner', 'night drive, good playlist', 'museum then a long walk', 'staying in, cooking together']),
  ('33333333-3333-3333-3333-000000001101', '22222222-2222-2222-2222-000000000011', 1, '🕯', 'the vibe i want more of...', array['slow mornings together', 'spontaneous plans', 'dressed-up nights', 'adventure days', 'phone-free evenings']),
  ('33333333-3333-3333-3333-000000001102', '22222222-2222-2222-2222-000000000011', 2, '💃', 'if we took a class together, i''d pick...', array['dance, obviously', 'pottery', 'cooking', 'a language', 'rock climbing']),
  ('33333333-3333-3333-3333-000000001200', '22222222-2222-2222-2222-000000000012', 0, '⚖️', 'i judge myself hardest for...', array['procrastinating', 'losing my temper', 'caring what people think', 'not doing enough', 'how i look some days']),
  ('33333333-3333-3333-3333-000000001201', '22222222-2222-2222-2222-000000000012', 1, '🏆', 'what i secretly want more credit for...', array['how hard i try', 'holding it together', 'the little things i do', 'my patience', 'making you laugh']),
  ('33333333-3333-3333-3333-000000001202', '22222222-2222-2222-2222-000000000012', 2, '🌱', 'the thing i''m proudest of that nobody claps for...', array['how far i''ve come', 'a habit i quietly built', 'getting through my worst year', 'staying soft', 'who i''ve become']),
  ('33333333-3333-3333-3333-000000001300', '22222222-2222-2222-2222-000000000013', 0, '🌅', 'before 9am, i am...', array['a functioning miracle', 'do not perceive me', 'fine after coffee only', 'chatty, annoyingly', 'already three tasks deep']),
  ('33333333-3333-3333-3333-000000001301', '22222222-2222-2222-2222-000000000013', 1, '☕', 'my morning non-negotiable...', array['coffee before words', 'the long shower', 'ten minutes of phone in bed', 'actual breakfast', 'silence, blessed silence']),
  ('33333333-3333-3333-3333-000000001302', '22222222-2222-2222-2222-000000000013', 2, '🚿', 'in the shower, i...', array['hold concerts', 'have imaginary arguments', 'plan my empire', 'speed-run it', 'lose all sense of time']),
  ('33333333-3333-3333-3333-000000001400', '22222222-2222-2222-2222-000000000014', 0, '🪂', 'the wildest thing i''d actually try...', array['skydiving', 'karaoke solo, sober', 'quitting to travel a year', 'a cold water plunge', 'the weirdest thing on the menu']),
  ('33333333-3333-3333-3333-000000001401', '22222222-2222-2222-2222-000000000014', 1, '🎤', 'if i went viral, it''d be for...', array['a spectacular fall', 'an unhinged rant that''s correct', 'an accidental talent', 'my pet doing something', 'a niche tutorial nobody asked for']),
  ('33333333-3333-3333-3333-000000001402', '22222222-2222-2222-2222-000000000014', 2, '🛸', 'if aliens landed tomorrow, i''d...', array['befriend them immediately', 'hide and observe', 'try to sell them something', 'ask for a lift', 'assume it''s marketing']),
  ('33333333-3333-3333-3333-000000001500', '22222222-2222-2222-2222-000000000015', 0, '🏠', 'a small thing that makes me feel safe...', array['your hand on my back', 'hearing you come home', 'our inside jokes', 'knowing the plan', 'falling asleep next to you']),
  ('33333333-3333-3333-3333-000000001501', '22222222-2222-2222-2222-000000000015', 1, '🛟', 'when life gets heavy, my first instinct is...', array['go quiet', 'keep busy', 'make jokes', 'plan my way out', 'reach for you']),
  ('33333333-3333-3333-3333-000000001502', '22222222-2222-2222-2222-000000000015', 2, '🤲', 'what ''i''ve got you'' looks like to me...', array['you handling it, no questions', 'you just listening', 'you staying close', 'you making me laugh anyway', 'you saying it out loud']),
  ('33333333-3333-3333-3333-000000001600', '22222222-2222-2222-2222-000000000016', 0, '🎧', 'on my commute, i''m...', array['podcast deep', 'one playlist on repeat', 'people watching', 'half asleep', 'texting you']),
  ('33333333-3333-3333-3333-000000001601', '22222222-2222-2222-2222-000000000016', 1, '🚌', 'the daily moment i weirdly enjoy...', array['the first coffee sip', 'lunch alone sometimes', 'the walk home stretch', 'crossing things off', 'getting into bed, finally']),
  ('33333333-3333-3333-3333-000000001602', '22222222-2222-2222-2222-000000000016', 2, '📅', 'my week''s real mvp day...', array['friday, obviously', 'saturday morning', 'sunday reset', 'wednesday, the summit', 'payday, whenever that is']),
  ('33333333-3333-3333-3333-000000001700', '22222222-2222-2222-2222-000000000017', 0, '😍', 'the first thing i noticed about you...', array['your smile', 'your eyes', 'your laugh', 'your energy', 'how you carried yourself']),
  ('33333333-3333-3333-3333-000000001701', '22222222-2222-2222-2222-000000000017', 1, '🔥', 'you''re most attractive to me when...', array['you''re passionate about something', 'you''re kind to strangers', 'you take charge', 'you''re half-asleep and soft', 'you make me laugh']),
  ('33333333-3333-3333-3333-000000001702', '22222222-2222-2222-2222-000000000017', 2, '🧲', 'what keeps me hooked...', array['we never run out of talk', 'the comfort', 'the chemistry', 'you still surprise me', 'you feel like home']),
  ('33333333-3333-3333-3333-000000001800', '22222222-2222-2222-2222-000000000018', 0, '🎪', 'the version of me only you get...', array['the silly one', 'the soft one', 'the anxious one', 'the big dreamer', 'the fully unfiltered one']),
  ('33333333-3333-3333-3333-000000001801', '22222222-2222-2222-2222-000000000018', 1, '🪞', 'i feel most like myself when...', array['i''m making something', 'i''m with my people', 'i''m alone recharging', 'we''re somewhere new', 'i''m mid-laugh']),
  ('33333333-3333-3333-3333-000000001802', '22222222-2222-2222-2222-000000000018', 2, '📱', 'if my mind had a home screen, it''d be...', array['a to-do list', 'a group chat of worries', 'a daydream on loop', 'a random song stuck', 'us, honestly']),
  ('33333333-3333-3333-3333-000000001900', '22222222-2222-2222-2222-000000000019', 0, '🧸', 'my childhood prized possession...', array['a stuffed animal with a name', 'a game console', 'a bike', 'a collection, cards or stickers', 'a blanket, don''t laugh']),
  ('33333333-3333-3333-3333-000000001901', '22222222-2222-2222-2222-000000000019', 1, '🍭', 'the snack that is pure childhood...', array['ice cream from the van', 'white rabbit sweets', 'a specific biscuit', 'something grandma made', 'tuck shop anything']),
  ('33333333-3333-3333-3333-000000001902', '22222222-2222-2222-2222-000000000019', 2, '📺', 'as a kid, my after-school ritual...', array['cartoons, immediately', 'playground until dark', 'snacks then homework, good kid', 'annoying my siblings', 'imaginary worlds, population me']),
  ('33333333-3333-3333-3333-000000002000', '22222222-2222-2222-2222-000000000020', 0, '🍫', 'my desert island snack...', array['chocolate, obviously', 'chips, salty ones', 'instant noodles', 'fruit, the good kind', 'bread, all bread']),
  ('33333333-3333-3333-3333-000000002001', '22222222-2222-2222-2222-000000000020', 1, '🥤', 'my beverage personality...', array['iced coffee loyalist', 'tea, endless tea', 'water bottle everywhere', 'something bubbly', 'whatever you''re having']),
  ('33333333-3333-3333-3333-000000002002', '22222222-2222-2222-2222-000000000020', 2, '🌮', 'my 3am hunger order...', array['instant noodles deluxe', 'prata or roti', 'mcdonald''s, no shame', 'leftover anything', 'cereal, straight from the box']),
  ('33333333-3333-3333-3333-000000002100', '22222222-2222-2222-2222-000000000021', 0, '⚡', 'the buildup i love most...', array['all-day teasing texts', 'getting ready together', 'a slow dinner first', 'the eye contact game', 'the almost-touch thing']),
  ('33333333-3333-3333-3333-000000002101', '22222222-2222-2222-2222-000000000021', 1, '🌶', 'flirt dangerously with me by...', array['whispering in public', 'the hand on the lower back', 'a look across the room', 'saying my name differently', 'stealing me from a party early']),
  ('33333333-3333-3333-3333-000000002102', '22222222-2222-2222-2222-000000000021', 2, '🖤', 'what i want more of, honestly...', array['more kissing, always', 'slower everything', 'you taking the lead', 'me taking the lead', 'more laughing in between']),
  ('33333333-3333-3333-3333-000000002200', '22222222-2222-2222-2222-000000000022', 0, '🙊', 'i pretend not to care about... but i do', array['what people think', 'my birthday', 'being included', 'compliments', 'how i look in photos']),
  ('33333333-3333-3333-3333-000000002201', '22222222-2222-2222-2222-000000000022', 1, '🥺', 'asking for help feels...', array['like failing', 'embarrassing', 'fine if it''s you', 'impossible until i break', 'easier than it used to']),
  ('33333333-3333-3333-3333-000000002202', '22222222-2222-2222-2222-000000000022', 2, '💬', 'the sentence i rehearse but never send...', array['an apology i owe', 'a boundary with family', 'a hard talk at work', 'a compliment that feels too big', '''i miss you'' to an old friend']),
  ('33333333-3333-3333-3333-000000002300', '22222222-2222-2222-2222-000000000023', 0, '🎥', 'my life as a movie genre...', array['cozy sitcom', 'chaotic comedy', 'slow-burn romance', 'underdog sports movie', 'mockumentary']),
  ('33333333-3333-3333-3333-000000002301', '22222222-2222-2222-2222-000000000023', 1, '🎭', 'in our friend group''s movie, i''m...', array['the responsible one', 'the comic relief', 'the wildcard', 'the mom friend', 'the mysterious one with snacks']),
  ('33333333-3333-3333-3333-000000002302', '22222222-2222-2222-2222-000000000023', 2, '🎼', 'my entrance theme song vibe...', array['smooth jazz confidence', 'villain strings', 'y2k pop', 'lo-fi shuffle', 'stadium anthem']),
  ('33333333-3333-3333-3333-000000002400', '22222222-2222-2222-2222-000000000024', 0, '🤝', 'my favourite casual touch...', array['your hand on my knee', 'you playing with my hair', 'back hugs', 'holding hands walking', 'your head on my shoulder']),
  ('33333333-3333-3333-3333-000000002401', '22222222-2222-2222-2222-000000000024', 1, '🧸', 'when we hug, i secretly want...', array['it to last longer', 'a squeeze at the end', 'the little sway', 'no one letting go first', 'exactly this, it''s perfect']),
  ('33333333-3333-3333-3333-000000002402', '22222222-2222-2222-2222-000000000024', 2, '🌡', 'physical affection, for me, is...', array['the main love language', 'a slow warm-up thing', 'constant small touches', 'big on hard days', 'better than words']),
  ('33333333-3333-3333-3333-000000002500', '22222222-2222-2222-2222-000000000025', 0, '❤️', 'love, to me, mostly looks like...', array['showing up every day', 'being fully known', 'laughing through the mess', 'a safe place to land', 'choosing each other again']),
  ('33333333-3333-3333-3333-000000002501', '22222222-2222-2222-2222-000000000025', 1, '🫀', 'i know i love someone when...', array['i share my food', 'i tell them everything first', 'their wins feel like mine', 'i relax around them', 'i start planning futures']),
  ('33333333-3333-3333-3333-000000002502', '22222222-2222-2222-2222-000000000025', 2, '🔁', 'what i''d change about how i love...', array['worry less', 'say it more', 'be more patient', 'ask for what i need', 'stop keeping score']),
  ('33333333-3333-3333-3333-000000002600', '22222222-2222-2222-2222-000000000026', 0, '🍱', '''what do you want to eat'' makes me...', array['panic, mind blank', 'say ''anything'', a lie', 'present three options', 'crave the same place always', 'turn it back on you']),
  ('33333333-3333-3333-3333-000000002601', '22222222-2222-2222-2222-000000000026', 1, '🛒', 'in a supermarket, i...', array['stick to the list, military', 'detour to the snack aisle, always', 'buy weird sauces', 'forget the one thing we came for', 'race the self-checkout']),
  ('33333333-3333-3333-3333-000000002602', '22222222-2222-2222-2222-000000000026', 2, '🍚', 'my comfort meal, no debate...', array['something my family made', 'noodles, hot and fast', 'a rice and eggs situation', 'the usual order, you know it', 'bread and cheese anything']),
  ('33333333-3333-3333-3333-000000002700', '22222222-2222-2222-2222-000000000027', 0, '🧦', 'my most chaotic habit...', array['seventeen open tabs', 'the clothes chair mountain', 'texts drafted, never sent', 'alarms every five minutes', 'cups everywhere']),
  ('33333333-3333-3333-3333-000000002701', '22222222-2222-2222-2222-000000000027', 1, '⏰', 'my relationship with alarms...', array['one alarm, instant rise', 'five alarms minimum', 'snooze until danger', 'wake before it, smug', 'what alarm, chaos']),
  ('33333333-3333-3333-3333-000000002702', '22222222-2222-2222-2222-000000000027', 2, '📦', 'the thing i own way too many of...', array['tote bags', 'chargers', 'half-used notebooks', 'condiments', 'hoodies']),
  ('33333333-3333-3333-3333-000000002800', '22222222-2222-2222-2222-000000000028', 0, '🌀', 'my brain''s favourite spiral...', array['money', 'am i doing enough', 'what they think of me', 'health stuff', 'the future, all of it']),
  ('33333333-3333-3333-3333-000000002801', '22222222-2222-2222-2222-000000000028', 1, '🧯', 'when i''m anxious, the thing that helps most...', array['naming it out loud', 'a plan', 'distraction', 'being held', 'just time']),
  ('33333333-3333-3333-3333-000000002802', '22222222-2222-2222-2222-000000000028', 2, '☁️', 'i worry you don''t know that...', array['i notice everything you do', 'i''m trying my best', 'i need you more than i show', 'my quiet isn''t distance', 'you''re my favourite person']),
  ('33333333-3333-3333-3333-000000002900', '22222222-2222-2222-2222-000000000029', 0, '⚖️', 'work-life balance, for me, currently...', array['actually decent', 'work is winning', 'life is winning, shh', 'what balance', 'improving, slowly']),
  ('33333333-3333-3333-3333-000000002901', '22222222-2222-2222-2222-000000000029', 1, '📴', 'i truly switch off when...', array['the phone dies, forced', 'we''re travelling', 'i''m cooking', 'mid-workout', 'rarely, teach me']),
  ('33333333-3333-3333-3333-000000002902', '22222222-2222-2222-2222-000000000029', 2, '🧘', 'my stress tell you''d notice first...', array['the sighing', 'snack raids', 'doom-scrolling', 'aggressive tidying', 'going monosyllabic']),
  ('33333333-3333-3333-3333-000000003000', '22222222-2222-2222-2222-000000000030', 0, '💬', 'the praise that makes me blush hardest...', array['that i''m hot, plainly', 'that i''m smart', 'that i''m a good person', 'that i''m funny', 'anything said in front of others']),
  ('33333333-3333-3333-3333-000000003001', '22222222-2222-2222-2222-000000000030', 1, '👀', 'i catch you staring when...', array['i''m getting ready', 'i''m concentrating', 'i''m laughing with people', 'i''m cooking', 'i''m just existing, apparently']),
  ('33333333-3333-3333-3333-000000003002', '22222222-2222-2222-2222-000000000030', 2, '💫', 'make my whole week by...', array['planning a surprise date', 'a long unprompted hug', 'bragging about me to someone', 'a handwritten note', 'kidnapping me for a weekend']),
  ('33333333-3333-3333-3333-000000003100', '22222222-2222-2222-2222-000000000031', 0, '🧒', 'as a kid, i was the one who...', array['followed all the rules', 'questioned all the rules', 'lived in a daydream', 'performed for the adults', 'kept the peace']),
  ('33333333-3333-3333-3333-000000003101', '22222222-2222-2222-2222-000000000031', 1, '🎒', 'the childhood thing that still shapes me...', array['needing to be the good kid', 'hating being told what to do', 'craving praise', 'keeping the peace', 'dreaming of getting out']),
  ('33333333-3333-3333-3333-000000003102', '22222222-2222-2222-2222-000000000031', 2, '🪁', 'what little me would love about my life now...', array['the freedom', 'you', 'where i live', 'what i do', 'that i turned out kind']),
  ('33333333-3333-3333-3333-000000003200', '22222222-2222-2222-2222-000000000032', 0, '📼', 'the family story always told about me...', array['the dramatic exit', 'the weird food phase', 'the time i got lost', 'something i said at four', 'the haircut incident']),
  ('33333333-3333-3333-3333-000000003201', '22222222-2222-2222-2222-000000000032', 1, '🏫', 'in school, i was...', array['the quiet observer', 'the class clown', 'teacher''s favourite, sorry', 'the last-minute genius', 'the one with the snacks']),
  ('33333333-3333-3333-3333-000000003202', '22222222-2222-2222-2222-000000000032', 2, '🎨', 'my childhood dream job...', array['astronaut, obviously', 'teacher', 'vet, animal era', 'famous, unspecified', 'whatever my parents said, then rebellion']),
  ('33333333-3333-3333-3333-000000003300', '22222222-2222-2222-2222-000000000033', 0, '🃏', 'in board games, i''m...', array['the rules lawyer', 'the secret alliance maker', 'the sore loser, sorry', 'the chaos agent', 'just here for snacks']),
  ('33333333-3333-3333-3333-000000003301', '22222222-2222-2222-2222-000000000033', 1, '🏓', 'i talk the most trash during...', array['uno', 'mario kart', 'card games', 'trivia', 'literally checkers']),
  ('33333333-3333-3333-3333-000000003302', '22222222-2222-2222-2222-000000000033', 2, '🥈', 'losing makes me...', array['demand a rematch instantly', 'laugh it off, externally', 'quietly train for revenge', 'claim i let you win', 'genuinely fine, weirdly']),
  ('33333333-3333-3333-3333-000000003400', '22222222-2222-2222-2222-000000000034', 0, '🗣', 'saying what i want out loud feels...', array['easy with you now', 'still a little scary', 'easier in the dark', 'easier over text, honestly', 'like something i''m learning']),
  ('33333333-3333-3333-3333-000000003401', '22222222-2222-2222-2222-000000000034', 1, '💬', 'i wish you''d tell me...', array['what you liked, after', 'what you think when you look at me', 'when you want me', 'a fantasy, any fantasy', 'that i still have that effect']),
  ('33333333-3333-3333-3333-000000003402', '22222222-2222-2222-2222-000000000034', 2, '🔐', 'my honest answer to ''what''s your fantasy''...', array['somewhere we shouldn''t', 'a whole scenario, plot included', 'being fully taken care of', 'being in charge for once', 'you already know, i''ve hinted']),
  ('33333333-3333-3333-3333-000000003500', '22222222-2222-2222-2222-000000000035', 0, '📏', 'if i''m honest, i measure my worth by...', array['what i achieve', 'who loves me', 'how useful i am', 'how i compare', 'still figuring it out']),
  ('33333333-3333-3333-3333-000000003501', '22222222-2222-2222-2222-000000000035', 1, '🎯', 'i feel like i''m ''doing enough'' when...', array['the list is done', 'someone says it', 'i''ve made someone''s day', 'i''ve moved my goals', 'rarely, honestly']),
  ('33333333-3333-3333-3333-000000003502', '22222222-2222-2222-2222-000000000035', 2, '🌤', 'what would actually make me feel successful...', array['enough money to relax', 'work that matters', 'a family that''s close', 'time freedom', 'being someone''s safe person']),
  ('33333333-3333-3333-3333-000000003600', '22222222-2222-2222-2222-000000000036', 0, '📵', 'my screen time is mostly...', array['videos i''ll never finish', 'group chats', 'doom-scrolling news', 'shopping carts i abandon', 'wikipedia rabbit holes']),
  ('33333333-3333-3333-3333-000000003601', '22222222-2222-2222-2222-000000000036', 1, '🐈', 'my algorithm thinks i am...', array['a chef', 'a cat person in denial', 'a gym person mid-crisis', 'a conspiracy hobbyist', 'about to buy a house']),
  ('33333333-3333-3333-3333-000000003602', '22222222-2222-2222-2222-000000000036', 2, '💾', 'my camera roll is 80%...', array['screenshots i''ll never open', 'food', 'you, candid', 'the sky, for some reason', 'memes to send later']),
  ('33333333-3333-3333-3333-000000003700', '22222222-2222-2222-2222-000000000037', 0, '🎞', 'our early days, the thing i miss...', array['the nervous texting', 'first-date energy', 'discovering everything', 'the anticipation', 'nothing — now is better']),
  ('33333333-3333-3333-3333-000000003701', '22222222-2222-2222-2222-000000000037', 1, '💌', 'the move you did that worked on me...', array['the way you texted', 'a specific date', 'how you listened', 'the confidence', 'being unbothered and warm']),
  ('33333333-3333-3333-3333-000000003702', '22222222-2222-2222-2222-000000000037', 2, '🥂', 'let''s bring back...', array['dressing up for each other', 'long dinners', 'surprise notes', 'actual photos of us', 'staying up talking']),
  ('33333333-3333-3333-3333-000000003800', '22222222-2222-2222-2222-000000000038', 0, '🩹', 'the offhand comment that stays with me longest...', array['about my body', 'about my work', 'about my family', 'being called selfish', 'being called too much']),
  ('33333333-3333-3333-3333-000000003801', '22222222-2222-2222-2222-000000000038', 1, '🌊', 'when i''m wrong, the hardest part is...', array['saying it out loud', 'the embarrassment', 'feeling like i failed you', 'letting go of my side', 'apologising first']),
  ('33333333-3333-3333-3333-000000003802', '22222222-2222-2222-2222-000000000038', 2, '🕯', 'the care i never ask for but want...', array['check-ins for no reason', 'help before i ask', 'being tucked into plans', 'reminders to rest', 'hype when i doubt myself']),
  ('33333333-3333-3333-3333-000000003900', '22222222-2222-2222-2222-000000000039', 0, '🌡', 'the thermostat war, my position...', array['arctic, blankets exist', 'warm, i''m not paying for winter', 'window open, always', 'depends on the day', 'whatever you want, i adapt']),
  ('33333333-3333-3333-3333-000000003901', '22222222-2222-2222-2222-000000000039', 1, '🍽', 'dishes protocol, ideally...', array['wash as we cook', 'soak first, not avoidance', 'same night, always', 'morning me''s problem', 'whoever didn''t cook']),
  ('33333333-3333-3333-3333-000000003902', '22222222-2222-2222-2222-000000000039', 2, '📺', 'control of the remote means...', array['i pick, you veto', 'background comfort show', 'twenty minutes of scrolling options', 'you pick, i critique', 'i''m asleep in fifteen minutes']),
  ('33333333-3333-3333-3333-000000004000', '22222222-2222-2222-2222-000000000040', 0, '🤥', 'my most-used tiny lie...', array['''5 minutes away''', '''i''ve seen that movie''', '''i''m listening''', '''i don''t mind, you pick''', '''i read the terms''']),
  ('33333333-3333-3333-3333-000000004001', '22222222-2222-2222-2222-000000000040', 1, '😇', 'i act like i don''t, but i totally...', array['check my horoscope', 'talk to myself in accents', 'practise arguments in the shower', 'google celebrities'' heights', 'cry at ads']),
  ('33333333-3333-3333-3333-000000004002', '22222222-2222-2222-2222-000000000040', 2, '🕵️', 'the weirdest thing in my search history...', array['''is it normal to...''', 'a disease i don''t have', 'how tall a celebrity is', 'the plot of the movie i''m watching', '''what to say when...''']),
  ('33333333-3333-3333-3333-000000004100', '22222222-2222-2222-2222-000000000041', 0, '💭', 'what i daydream about most...', array['our future place', 'quitting and travelling', 'being properly rich', 'a quieter life', 'being great at what i do']),
  ('33333333-3333-3333-3333-000000004101', '22222222-2222-2222-2222-000000000041', 1, '🗺', 'my biggest ''what if''...', array['a path i didn''t take', 'a city i never tried', 'a dream i shelved', 'a person i never thanked', 'none — i''d choose this again']),
  ('33333333-3333-3333-3333-000000004102', '22222222-2222-2222-2222-000000000041', 2, '🔮', 'in ten years, i most hope we...', array['have our own place we love', 'still laugh like this', 'have travelled half the map', 'have tiny humans or pets', 'are still each other''s favourite']),
  ('33333333-3333-3333-3333-000000004200', '22222222-2222-2222-2222-000000000042', 0, '📬', 'my relationship with life admin...', array['inbox zero energy', 'deadline-fuelled panic', 'delegate what i can', 'a shoebox of receipts', 'i weirdly enjoy it']),
  ('33333333-3333-3333-3333-000000004201', '22222222-2222-2222-2222-000000000042', 1, '💳', 'money conversations make me...', array['energised, spreadsheets out', 'a bit anxious', 'fine if there''s food', 'avoidant, working on it', 'competitive about saving']),
  ('33333333-3333-3333-3333-000000004202', '22222222-2222-2222-2222-000000000042', 2, '🗂', 'the adult task i still can''t...', array['fold fitted sheets', 'read insurance anything', 'keep plants alive', 'mail things on time', 'parallel park confidently']),
  ('33333333-3333-3333-3333-000000004300', '22222222-2222-2222-2222-000000000043', 0, '😏', 'i feel smug about you when...', array['you walk in looking like that', 'someone laughs at your joke', 'you win at something', 'people compliment you to me', 'they notice you''re mine']),
  ('33333333-3333-3333-3333-000000004301', '22222222-2222-2222-2222-000000000043', 1, '💍', 'i show you off by...', array['posting you', 'telling stories about you', 'dragging you to meet everyone', 'quietly mentioning you constantly', 'keeping you to myself, actually']),
  ('33333333-3333-3333-3333-000000004302', '22222222-2222-2222-2222-000000000043', 2, '🧿', 'what makes me feel chosen...', array['you leaving things for me', 'plans made without me asking', 'you defending me', 'your undivided attention', 'being your first call']),
  ('33333333-3333-3333-3333-000000004400', '22222222-2222-2222-2222-000000000044', 0, '🌋', 'mid-argument, what i''m usually feeling is...', array['not heard', 'scared we''re breaking', 'frustrated i can''t explain', 'defensive', 'just tired']),
  ('33333333-3333-3333-3333-000000004401', '22222222-2222-2222-2222-000000000044', 1, '🧩', 'after we disagree, i need...', array['space first, then talk', 'to fix it right now', 'a hug before words', 'to know we''re okay', 'to laugh about something']),
  ('33333333-3333-3333-3333-000000004402', '22222222-2222-2222-2222-000000000044', 2, '🕊', 'the fastest way to soften me...', array['touch my arm', 'say ''we''re on the same team''', 'admit one small thing', 'make me laugh', 'just listen fully']),
  ('33333333-3333-3333-3333-000000004500', '22222222-2222-2222-2222-000000000045', 0, '🎸', 'teenage me was mostly...', array['angsty playlists', 'obsessed with one hobby', 'terminally online, early adopter', 'sports and sunburn', 'diary and daydreams']),
  ('33333333-3333-3333-3333-000000004501', '22222222-2222-2222-2222-000000000045', 1, '📟', 'my most embarrassing phase...', array['the hair era', 'the music-taste superiority', 'the fake accent phase', 'matching everything', 'quoting one movie constantly']),
  ('33333333-3333-3333-3333-000000004502', '22222222-2222-2222-2222-000000000045', 2, '💿', 'the song that makes me sixteen again...', array['a boyband anthem', 'an angsty rock one', 'the school dance one', 'a one-hit wonder', 'whatever dad played in the car']),
  ('33333333-3333-3333-3333-000000004600', '22222222-2222-2222-2222-000000000046', 0, '🍳', 'my actual best kitchen move...', array['perfect eggs', 'instant noodles, elevated', 'one signature dish', 'assembling, not cooking', 'dessert only']),
  ('33333333-3333-3333-3333-000000004601', '22222222-2222-2222-2222-000000000046', 1, '🧵', 'the skill i claim but can''t back up...', array['navigation', 'cooking without recipes', 'reading people', 'parallel parking', 'speaking a language']),
  ('33333333-3333-3333-3333-000000004602', '22222222-2222-2222-2222-000000000046', 2, '🤹', 'the talent i''d unlock instantly if i could...', array['singing, properly', 'any instrument', 'drawing', 'a third language', 'dancing without thinking']),
  ('33333333-3333-3333-3333-000000004700', '22222222-2222-2222-2222-000000000047', 0, '🎞', 'the time i still think about...', array['the first time', 'a specific trip', 'the almost-got-caught one', 'a completely random tuesday', 'the last time, recent and good']),
  ('33333333-3333-3333-3333-000000004701', '22222222-2222-2222-2222-000000000047', 1, '🔥', 'we were at our boldest...', array['on holiday', 'when we first met', 'that one wedding', 'early days, anywhere', 'last month, actually']),
  ('33333333-3333-3333-3333-000000004702', '22222222-2222-2222-2222-000000000047', 2, '😇', 'my innocent-looking memory that isn''t...', array['a certain car ride', 'a dinner we left early', 'a ''movie night''', 'a smug hotel breakfast', 'a dance floor moment']),
  ('33333333-3333-3333-3333-000000004800', '22222222-2222-2222-2222-000000000048', 0, '🔋', 'what refills me fastest...', array['proper alone time', 'one deep conversation', 'nature and air', 'a whole free day', 'you, undivided']),
  ('33333333-3333-3333-3333-000000004801', '22222222-2222-2222-2222-000000000048', 1, '🚦', 'i say yes when i mean no because...', array['i hate disappointing people', 'it''s easier', 'i want to be liked', 'guilt', 'i honestly don''t notice i''m doing it']),
  ('33333333-3333-3333-3333-000000004802', '22222222-2222-2222-2222-000000000048', 2, '🧭', 'the boundary i''m still learning to hold...', array['my time off', 'saying no to family', 'not overcommitting', 'phone-free hours', 'putting myself first sometimes']),
  ('33333333-3333-3333-3333-000000004900', '22222222-2222-2222-2222-000000000049', 0, '🛌', 'my sleep position is...', array['starfish, no apologies', 'burrito wrap', 'one leg out, always', 'fetal, guarding the phone', 'face down, gone']),
  ('33333333-3333-3333-3333-000000004901', '22222222-2222-2222-2222-000000000049', 1, '🌃', 'my ideal bedtime, real answer...', array['9pm, grandma and proud', '11pm-ish, reasonable', 'midnight, negotiable', '2am, regret later', '''bedtime'' is a concept']),
  ('33333333-3333-3333-3333-000000004902', '22222222-2222-2222-2222-000000000049', 2, '😴', 'steal my blanket and i will...', array['wake instantly, declare war', 'burrow closer', 'never know, i sleep like the dead', 'passive-aggressively tug at 3am', 'produce a backup, i planned for this']),
  ('33333333-3333-3333-3333-000000005000', '22222222-2222-2222-2222-000000000050', 0, '🎶', 'our song, if i had to pick the vibe...', array['something slow and old', 'the one from the car rides', 'a guilty-pleasure pop song', 'the one you hum', 'we need to pick one, tonight']),
  ('33333333-3333-3333-3333-000000005001', '22222222-2222-2222-2222-000000000050', 1, '🌙', 'my favourite time of day with you...', array['lazy mornings', 'the commute texts', 'the cooking-dinner hour', 'the last hour before sleep', '2am accidental talks']),
  ('33333333-3333-3333-3333-000000005002', '22222222-2222-2222-2222-000000000050', 2, '🕰', 'time stops a little when...', array['you laugh for real', 'we dance in the kitchen', 'you fall asleep on me', 'we people-watch together', 'you tell me your day properly']),
  ('33333333-3333-3333-3333-000000005100', '22222222-2222-2222-2222-000000000051', 0, '🔍', 'the thing i wish more people understood about me...', array['my quiet isn''t rude', 'i care intensely', 'i''m sensitive under the jokes', 'i need time to open up', 'i''m doing my best']),
  ('33333333-3333-3333-3333-000000005101', '22222222-2222-2222-2222-000000000051', 1, '🎧', 'when i share a problem, i mostly want...', array['solutions', 'just listening', 'to feel less crazy', 'a hug', 'someone outraged with me']),
  ('33333333-3333-3333-3333-000000005102', '22222222-2222-2222-2222-000000000051', 2, '🏷', 'the label people give me that''s wrong...', array['chill', 'intimidating', 'quiet', 'dramatic', 'has it all together']),
  ('33333333-3333-3333-3333-000000005200', '22222222-2222-2222-2222-000000000052', 0, '⚡', 'my golden hours are...', array['early morning', 'late morning', 'post-lunch, weirdly', 'evening', 'after midnight, sorry']),
  ('33333333-3333-3333-3333-000000005201', '22222222-2222-2222-2222-000000000052', 1, '🥱', 'the 3pm slump hits and i...', array['coffee number three', 'sugar, immediately', 'a walk, virtuous', 'the art of the power nap', 'push through, zombie mode']),
  ('33333333-3333-3333-3333-000000005202', '22222222-2222-2222-2222-000000000052', 2, '🌙', 'by 10pm, i am...', array['in bed, reading', 'just getting started', 'asleep on the couch, deny it', 'snacking again', 'planning tomorrow']),
  ('33333333-3333-3333-3333-000000005300', '22222222-2222-2222-2222-000000000053', 0, '💸', 'i''ll spend without blinking on...', array['food delivery', 'concert tickets', 'gadgets or plants', 'skincare', 'trips']),
  ('33333333-3333-3333-3333-000000005301', '22222222-2222-2222-2222-000000000053', 1, '🪙', 'but i''m irrationally cheap about...', array['phone cases', 'paying for parking', 'streaming subs, i borrow', 'water at restaurants', 'shipping fees']),
  ('33333333-3333-3333-3333-000000005302', '22222222-2222-2222-2222-000000000053', 2, '🛒', 'my cart abandonment style...', array['add, admire, close app', 'wait for a sale forever', 'screenshot and send to you first', '3am checkout, morning regret', 'what cart, i buy instantly']),
  ('33333333-3333-3333-3333-000000005400', '22222222-2222-2222-2222-000000000054', 0, '🍂', 'my hardest time of year...', array['the year-end rush', 'my birthday, weirdly', 'the long grey stretches', 'family-heavy holidays', 'the long middle of the year']),
  ('33333333-3333-3333-3333-000000005401', '22222222-2222-2222-2222-000000000054', 1, '🌅', 'lately, i''ve been feeling...', array['steady, actually', 'stretched thin', 'hopeful about something', 'restless', 'softer than usual']),
  ('33333333-3333-3333-3333-000000005402', '22222222-2222-2222-2222-000000000054', 2, '🌻', 'what i need more of this season...', array['rest, real rest', 'fun with you', 'momentum on my goals', 'time with my people', 'sunlight and outside']),
  ('33333333-3333-3333-3333-000000005500', '22222222-2222-2222-2222-000000000055', 0, '🗺', 'the perfect saturday ratio...', array['80% couch, 20% food run', 'brunch then errands victory lap', 'adventure day, fully booked', 'people by day, us by night', 'zero plans, follow the vibe']),
  ('33333333-3333-3333-3333-000000005501', '22222222-2222-2222-2222-000000000055', 1, '🛌', 'sleeping in means...', array['8am, that''s late', '10am, civilised', 'noon, no regrets', 'i physically can''t anymore', 'depends who''s making breakfast']),
  ('33333333-3333-3333-3333-000000005502', '22222222-2222-2222-2222-000000000055', 2, '📋', 'sunday night me is...', array['prepped and smug', 'mourning the weekend', 'doing everything i postponed', 'fine, sundays are nice', 'already planning next weekend']),
  ('33333333-3333-3333-3333-000000005600', '22222222-2222-2222-2222-000000000056', 0, '🎁', 'the non-thing gift i want most...', array['a whole planned day', 'words, written down', 'undivided time', 'a skill you learned for me', 'breakfast in bed, no phones']),
  ('33333333-3333-3333-3333-000000005601', '22222222-2222-2222-2222-000000000056', 1, '🏝', 'run away with me to...', array['a beach with no plans', 'a city we can''t pronounce', 'mountains and cold air', 'a road trip, no map', 'anywhere with good food']),
  ('33333333-3333-3333-3333-000000005602', '22222222-2222-2222-2222-000000000056', 2, '✨', 'surprise me best with...', array['food, always food', 'tickets to a thing', 'a random tuesday date', 'something i mentioned once', 'just showing up early']),
  ('33333333-3333-3333-3333-000000005700', '22222222-2222-2222-2222-000000000057', 0, '🫙', 'a small thing i''ve never told you...', array['i reread your old texts', 'i brag about you', 'i copied one of your habits', 'i saved something of yours', 'i planned our future early on']),
  ('33333333-3333-3333-3333-000000005701', '22222222-2222-2222-2222-000000000057', 1, '🍬', 'i feel weirdly loved when you...', array['steal my food', 'use my phrases', 'fall asleep on me', 'send me nothing memes', 'get protective']),
  ('33333333-3333-3333-3333-000000005702', '22222222-2222-2222-2222-000000000057', 2, '🌟', 'my favourite thing about us that i rarely say...', array['how easy it is', 'how we laugh', 'how safe i feel', 'how we''ve grown', 'that it still feels new']),
  ('33333333-3333-3333-3333-000000005800', '22222222-2222-2222-2222-000000000058', 0, '🏆', 'our best day so far, in my head...', array['a trip day', 'a completely lazy day', 'the day something worked out', 'a party we owned', 'an ordinary day that glowed']),
  ('33333333-3333-3333-3333-000000005801', '22222222-2222-2222-2222-000000000058', 1, '😂', 'the memory that still makes me laugh...', array['the getting-lost incident', 'a food disaster', 'something you said half-asleep', 'the photo we can''t post', 'a stranger interaction']),
  ('33333333-3333-3333-3333-000000005802', '22222222-2222-2222-2222-000000000058', 2, '🎬', 'if our story had a trailer, the key scene...', array['the meet', 'the first trip', 'a rain moment, cliché and perfect', 'the surprise reveal', 'us cooking, music on']),
  ('33333333-3333-3333-3333-000000005900', '22222222-2222-2222-2222-000000000059', 0, '👟', 'my comfort outfit that shouldn''t leave the house...', array['the ancient tee', 'hoodie and shorts combo', 'slides with socks', 'the ''painting'' pants', 'airport core, always']),
  ('33333333-3333-3333-3333-000000005901', '22222222-2222-2222-2222-000000000059', 1, '🕶', 'i think i look best in...', array['black, always black', 'that one specific shirt', 'properly dressed up', 'fresh haircut energy', 'your clothes, honestly']),
  ('33333333-3333-3333-3333-000000005902', '22222222-2222-2222-2222-000000000059', 2, '🧥', 'the trend i''d defend in court...', array['socks and slides', 'cargo everything', 'matching sets', 'bucket hats', 'double denim']),
  ('33333333-3333-3333-3333-000000006000', '22222222-2222-2222-2222-000000000060', 0, '🧭', 'the way to actually turn my head...', array['quiet confidence', 'making me laugh first', 'competence, weirdly', 'that specific scent', 'being good with people']),
  ('33333333-3333-3333-3333-000000006001', '22222222-2222-2222-2222-000000000060', 1, '🎚', 'my pace preference, truthfully...', array['slow burn, always', 'depends on the day', 'fast when we''ve been apart', 'you set it, i love that', 'we''re usually synced anyway']),
  ('33333333-3333-3333-3333-000000006002', '22222222-2222-2222-2222-000000000060', 2, '🗺', 'the spot that undoes me, pg version...', array['neck, obviously', 'lower back', 'behind the ear', 'hands, weirdly', 'you know exactly where, don''t play']),
  ('33333333-3333-3333-3333-000000006100', '22222222-2222-2222-2222-000000000061', 0, '⛰', 'my worst year taught me...', array['who actually shows up', 'i''m tougher than i thought', 'to ask for help', 'what really matters', 'to stop waiting to live']),
  ('33333333-3333-3333-3333-000000006101', '22222222-2222-2222-2222-000000000061', 1, '🧱', 'when everything falls apart, i become...', array['scary calm', 'the planner', 'the joker', 'quiet and closed', 'honest, finally']),
  ('33333333-3333-3333-3333-000000006102', '22222222-2222-2222-2222-000000000061', 2, '🌈', 'what got me through, mostly...', array['my people', 'sheer stubbornness', 'routines', 'faith it would pass', 'you']),
  ('33333333-3333-3333-3333-000000006200', '22222222-2222-2222-2222-000000000062', 0, '🎯', 'i''m weirdly accurate at...', array['guessing the time', 'catching falling things', 'remembering lyrics', 'reading a room', 'knowing when food''s done']),
  ('33333333-3333-3333-3333-000000006201', '22222222-2222-2222-2222-000000000062', 1, '🧊', 'my useless flex...', array['i can nap anywhere', 'perfect toast timing', 'never lost my keys', 'one really good impression', 'remembering every plot']),
  ('33333333-3333-3333-3333-000000006202', '22222222-2222-2222-2222-000000000062', 2, '🐙', 'the job i''d be suspiciously good at...', array['detective', 'food critic', 'museum guard', 'game show host', 'professional organiser']),
  ('33333333-3333-3333-3333-000000006300', '22222222-2222-2222-2222-000000000063', 0, '😏', 'you win me over instantly when you...', array['wear that one thing', 'get all competent at something', 'whisper instead of talk', 'play with my hair', 'cook for me']),
  ('33333333-3333-3333-3333-000000006301', '22222222-2222-2222-2222-000000000063', 1, '🔥', 'our chemistry is at its best...', array['when we dance', 'mid banter', 'after we dress up', 'on trips', 'when we''ve missed each other']),
  ('33333333-3333-3333-3333-000000006302', '22222222-2222-2222-2222-000000000063', 2, '💋', 'the look you give me that works...', array['the across-the-room one', 'the proud one', 'the ''let''s leave'' one', 'the morning one', 'the one right before you kiss me']),
  ('33333333-3333-3333-3333-000000006400', '22222222-2222-2222-2222-000000000064', 0, '🌌', 'i believe, quietly, that...', array['everything happens for a reason', 'we make our own luck', 'people can change', 'love is a choice', 'the universe keeps score somewhere']),
  ('33333333-3333-3333-3333-000000006401', '22222222-2222-2222-2222-000000000064', 1, '⏳', 'time feels like...', array['it''s speeding up scarily', 'plenty left', 'something i''m wasting', 'something i''m finally using', 'a thing i refuse to think about']),
  ('33333333-3333-3333-3333-000000006402', '22222222-2222-2222-2222-000000000064', 2, '🎁', 'the point of it all, if i had to guess...', array['love, obviously', 'to grow', 'to enjoy it', 'to leave things better', 'to find your people']),
  ('33333333-3333-3333-3333-000000006500', '22222222-2222-2222-2222-000000000065', 0, '🧾', 'i track my spending...', array['to the cent', 'vibes and bank alerts', 'monthly panic review', 'you don''t want to know', 'in apps i abandon quarterly']),
  ('33333333-3333-3333-3333-000000006501', '22222222-2222-2222-2222-000000000065', 1, '🎟', 'worth every cent, always...', array['good shoes', 'good food', 'good sleep, the mattress kind', 'experiences over things', 'skipping the queue']),
  ('33333333-3333-3333-3333-000000006502', '22222222-2222-2222-2222-000000000065', 2, '🐖', 'i''m saving, in my heart, for...', array['a home that''s ours', 'the big trip', 'freedom money', 'a rainy day, boringly', 'the next shiny thing, honestly']),
  ('33333333-3333-3333-3333-000000006600', '22222222-2222-2222-2222-000000000066', 0, '💬', 'my texting style is...', array['seventeen messages, one thought', 'one paragraph, lawyer-grade', 'voice notes, sorry', 'emojis do the talking', 'read, reply in three days']),
  ('33333333-3333-3333-3333-000000006601', '22222222-2222-2222-2222-000000000066', 1, '📸', 'i''m the friend who always...', array['sends the memes', 'plans the thing', 'cancels the thing', 'documents everything', 'shows up with food']),
  ('33333333-3333-3333-3333-000000006602', '22222222-2222-2222-2222-000000000066', 2, '🎉', 'at parties, find me...', array['with the pet', 'deep in one conversation', 'in the kitchen, near snacks', 'on aux duty', 'leaving early, irish exit']),
  ('33333333-3333-3333-3333-000000006700', '22222222-2222-2222-2222-000000000067', 0, '🦚', 'i''m secretly a little vain about...', array['my hair', 'my taste', 'my work', 'my cooking', 'my playlist']),
  ('33333333-3333-3333-3333-000000006701', '22222222-2222-2222-2222-000000000067', 1, '🥇', 'i get competitive about...', array['games, dangerously', 'work stuff', 'cooking', 'trivia', 'literally anything with points']),
  ('33333333-3333-3333-3333-000000006702', '22222222-2222-2222-2222-000000000067', 2, '🌡', 'envy hits me hardest when someone has...', array['time freedom', 'their dream house', 'effortless confidence', 'a close-knit family', 'money without worry']),
  ('33333333-3333-3333-3333-000000006800', '22222222-2222-2222-2222-000000000068', 0, '🤒', 'when i''m sick, i become...', array['a dramatic victorian ghost', 'stubborn, ''i''m fine''', 'a blanket burrito', 'needy, sorry in advance', 'weirdly productive']),
  ('33333333-3333-3333-3333-000000006801', '22222222-2222-2222-2222-000000000068', 1, '🍲', 'heal me with...', array['soup and silence', 'snacks and bad tv', 'hourly check-ins', 'medicine, i''m practical', 'your presence, that''s it']),
  ('33333333-3333-3333-3333-000000006802', '22222222-2222-2222-2222-000000000068', 2, '🩺', 'i go to the doctor...', array['immediately, health first', 'after three days of denial', 'when you make me', 'google first, always', 'only if something''s visibly wrong']),
  ('33333333-3333-3333-3333-000000006900', '22222222-2222-2222-2222-000000000069', 0, '☕', 'the tiny ritual i''d protect at all costs...', array['morning coffee together', 'goodnight texts', 'the walk after dinner', 'our show, our couch', 'sunday breakfast']),
  ('33333333-3333-3333-3333-000000006901', '22222222-2222-2222-2222-000000000069', 1, '🤙', 'check on me mid-day by...', array['a dumb meme', '''thinking of you''', 'a voice note', 'surprise food delivery', 'a photo of something that''s so us']),
  ('33333333-3333-3333-3333-000000006902', '22222222-2222-2222-2222-000000000069', 2, '🌠', 'let''s start a new ritual...', array['monthly fancy date', 'saturday morning market', 'yearly trip, same date', 'weekly phones-off dinner', 'first-of-the-month photos']),
  ('33333333-3333-3333-3333-000000007000', '22222222-2222-2222-2222-000000000070', 0, '🛠', 'when i''m off, the first sign is...', array['i go quiet', 'i get snappy', 'i disappear into my phone', 'i stop tidying', 'i sleep weird']),
  ('33333333-3333-3333-3333-000000007001', '22222222-2222-2222-2222-000000000070', 1, '📖', 'the best way to check in on me...', array['ask twice, i lie the first time', 'feed me first', 'side-by-side, not face-to-face', 'text a meme, then ask', 'just say ''i''ve noticed''']),
  ('33333333-3333-3333-3333-000000007002', '22222222-2222-2222-2222-000000000070', 2, '🔧', 'what fixes 80% of my bad moods...', array['food', 'sleep', 'a walk', 'being held', 'venting for exactly ten minutes']),
  ('33333333-3333-3333-3333-000000007100', '22222222-2222-2222-2222-000000000071', 0, '🗺', 'the place that made me, honestly...', array['my childhood kitchen', 'a grandparent''s place', 'the playground downstairs', 'a specific classroom', 'my first own room']),
  ('33333333-3333-3333-3333-000000007101', '22222222-2222-2222-2222-000000000071', 1, '✈️', 'the trip that changed me a little...', array['my first solo one', 'the first with you', 'a family one i finally appreciated', 'the disaster one, weirdly', 'a school trip, unexpectedly']),
  ('33333333-3333-3333-3333-000000007102', '22222222-2222-2222-2222-000000000071', 2, '🧳', 'the place i''d take you back to...', array['where i grew up', 'a trip i loved before you', 'my old school, for laughs', 'the first place i lived alone', 'a food place from my childhood']),
  ('33333333-3333-3333-3333-000000007200', '22222222-2222-2222-2222-000000000072', 0, '👽', 'the mild conspiracy i lowkey believe...', array['phones are listening', 'weather apps just guess', 'expiry dates are a scam', 'my plants judge me', 'mattress stores are fronts']),
  ('33333333-3333-3333-3333-000000007201', '22222222-2222-2222-2222-000000000072', 1, '🔮', 'i''m superstitious about...', array['jinxing things by saying them', 'lucky clothes', 'knocking on wood', 'reading my horoscope ''ironically''', 'nothing, says me, knocking on wood']),
  ('33333333-3333-3333-3333-000000007202', '22222222-2222-2222-2222-000000000072', 2, '🎰', 'if i won the lottery, my first move...', array['tell absolutely no one', 'quit dramatically', 'a stupid car', 'pay off everyone''s debts', 'disappear to an island for a month']),
  ('33333333-3333-3333-3333-000000007300', '22222222-2222-2222-2222-000000000073', 0, '🕹', 'when i initiate, what''s going on in my head...', array['i''ve been thinking about it all day', 'total impulse', 'i missed you', 'i want you to feel wanted', 'courage assembled over hours']),
  ('33333333-3333-3333-3333-000000007301', '22222222-2222-2222-2222-000000000073', 1, '🌃', 'the setting that changes my energy...', array['hotels, instantly', 'anywhere after dancing', 'home alone, rare and precious', 'somewhere slightly risky', 'candles, don''t laugh']),
  ('33333333-3333-3333-3333-000000007302', '22222222-2222-2222-2222-000000000073', 2, '🎁', 'the ''yes please'' i haven''t said...', array['a slow massage night', 'a shower, together, no agenda', 'a weekend with one rule: us', 'you choosing everything for a night', 'dressing up for no one but us']),
  ('33333333-3333-3333-3333-000000007400', '22222222-2222-2222-2222-000000000074', 0, '🏡', 'our someday home, in my head...', array['near the sea', 'big city, high floor', 'quiet with a garden', 'near good food, that''s it', 'wherever, it''s about who''s in it']),
  ('33333333-3333-3333-3333-000000007401', '22222222-2222-2222-2222-000000000074', 1, '👶', 'how i feel about tiny humans...', array['definitely, someday', 'maybe, ask me yearly', 'pets are the move', 'terrified but open', 'i just want us for a while']),
  ('33333333-3333-3333-3333-000000007402', '22222222-2222-2222-2222-000000000074', 2, '🧓', 'as an old person, i''ll be the one who...', array['feeds everyone', 'says wildly honest things', 'gardens at dawn', 'still flirts with you', 'knows all the gossip']),
  ('33333333-3333-3333-3333-000000007500', '22222222-2222-2222-2222-000000000075', 0, '🚗', 'as a passenger, i''m...', array['dj, hands off the aux', 'navigator with opinions', 'asleep in ten minutes', 'snack distributor', 'backseat brake presser']),
  ('33333333-3333-3333-3333-000000007501', '22222222-2222-2222-2222-000000000075', 1, '🧳', 'i pack for trips...', array['weeks early, with a list', 'night before, efficiently', 'morning of, pure chaos', 'overpack everything', 'underpack, buy it there']),
  ('33333333-3333-3333-3333-000000007502', '22222222-2222-2222-2222-000000000075', 2, '🗓', 'my relationship with plans...', array['live for them', 'need 20% of them cancelled', 'spontaneous only', 'i make them, you keep them', 'the calendar is my religion']),
  ('33333333-3333-3333-3333-000000007600', '22222222-2222-2222-2222-000000000076', 0, '🖊', 'if you wrote me a note, i''d want it to say...', array['why you chose me', 'a memory you love', 'what you see in ten years', 'the thing you never say aloud', 'something that makes me laugh-cry']),
  ('33333333-3333-3333-3333-000000007601', '22222222-2222-2222-2222-000000000076', 1, '📮', 'my favourite text from you is...', array['the random ''thinking of you''', 'the essay when i''m down', 'the unhinged meme', '''come home soon''', 'the good morning one']),
  ('33333333-3333-3333-3333-000000007602', '22222222-2222-2222-2222-000000000076', 2, '💝', 'say ''i love you'' without words by...', array['my coffee, made right', 'your hand on my back', 'saving me the last bite', 'playing my song', 'just staying close']),
  ('33333333-3333-3333-3333-000000007700', '22222222-2222-2222-2222-000000000077', 0, '🙏', 'what i''m most grateful for right now...', array['my health, honestly', 'us', 'my people', 'the calm after a hard stretch', 'the small daily stuff']),
  ('33333333-3333-3333-3333-000000007701', '22222222-2222-2222-2222-000000000077', 1, '💎', 'the luckiest break i ever got...', array['meeting you', 'a job that found me', 'my family', 'a near-miss that missed', 'being born exactly when i was']),
  ('33333333-3333-3333-3333-000000007702', '22222222-2222-2222-2222-000000000077', 2, '🕰', 'if i could relive one ordinary day...', array['an early date with you', 'a childhood sunday', 'a random perfect trip day', 'a lazy day that meant nothing', 'yesterday, honestly']),
  ('33333333-3333-3333-3333-000000007800', '22222222-2222-2222-2222-000000000078', 0, '🔄', 'the routine that actually changed my life...', array['morning walks', 'meal prepping', 'a sleep schedule, boring but true', 'lists, everywhere', 'phone out of the bedroom']),
  ('33333333-3333-3333-3333-000000007801', '22222222-2222-2222-2222-000000000078', 1, '🧯', 'when plans change last minute, i...', array['secretly celebrate', 'need a minute to recalibrate', 'roll with it fine', 'mourn the original plan', 'become the new plan''s ceo']),
  ('33333333-3333-3333-3333-000000007802', '22222222-2222-2222-2222-000000000078', 2, '🎛', 'my life runs on...', array['caffeine and calendars', 'deadlines and adrenaline', 'routines and rituals', 'you, basically', 'vibes, dangerous ones']),
  ('33333333-3333-3333-3333-000000007900', '22222222-2222-2222-2222-000000000079', 0, '🥇', 'my first crush was...', array['a classmate, classic', 'a friend''s older sibling', 'a celebrity, fully committed', 'a teacher, sorry', 'fictional, animated even']),
  ('33333333-3333-3333-3333-000000007901', '22222222-2222-2222-2222-000000000079', 1, '🚲', 'the first thing i saved up for...', array['a phone', 'a game', 'shoes', 'a concert', 'a bike']),
  ('33333333-3333-3333-3333-000000007902', '22222222-2222-2222-2222-000000000079', 2, '🔑', 'my first taste of freedom...', array['my own keys', 'my first paycheck', 'staying home alone', 'taking the bus alone', 'moving out']),
  ('33333333-3333-3333-3333-000000008000', '22222222-2222-2222-2222-000000000080', 0, '🎢', 'the date that would scare me, in a good way...', array['karaoke duet', 'a dance class', 'sunrise hike', 'getting matching something', 'a no-phones weekend']),
  ('33333333-3333-3333-3333-000000008001', '22222222-2222-2222-2222-000000000080', 1, '🌶', 'i''d love you to steal more...', array['kisses mid-errand', 'glances across rooms', 'of my hoodies', 'me, from boring plans', 'slow dances in the kitchen']),
  ('33333333-3333-3333-3333-000000008002', '22222222-2222-2222-2222-000000000080', 2, '🪄', 'the move i keep meaning to make...', array['the surprise weekend', 'learning your favourite meal', 'the photo book of us', 'a proper love letter', 'asking you to dance, anywhere']),
  ('33333333-3333-3333-3333-000000008100', '22222222-2222-2222-2222-000000000081', 0, '🍜', 'the correct way to eat instant noodles...', array['soup, classic', 'drained and sauced', 'raw with the seasoning dust', 'midnight only', 'with cheese, fight me']),
  ('33333333-3333-3333-3333-000000008101', '22222222-2222-2222-2222-000000000081', 1, '🥚', 'my egg order says i am...', array['scrambled: soft chaos', 'sunny side up: optimist', 'half-boiled kopitiam: cultured', 'omelette: has it together', 'no eggs: unhinged']),
  ('33333333-3333-3333-3333-000000008102', '22222222-2222-2222-2222-000000000081', 2, '🍰', 'dessert is...', array['mandatory, always', 'shared, one spoon', 'breakfast sometimes', 'only if it''s chocolate', 'a personality trait']),
  ('33333333-3333-3333-3333-000000008200', '22222222-2222-2222-2222-000000000082', 0, '📱', 'peak nostalgia tech for me...', array['the mp3 player clickwheel', 'msn-era chat', 'the family computer, timed turns', 'brick phone games', 'burned cds with marker labels']),
  ('33333333-3333-3333-3333-000000008201', '22222222-2222-2222-2222-000000000082', 1, '🎮', 'my childhood game of choice...', array['console classics', 'early internet pet sites', 'playground made-up ones', 'card games at recess', 'whatever the neighbours had']),
  ('33333333-3333-3333-3333-000000008202', '22222222-2222-2222-2222-000000000082', 2, '📷', 'old photos of me are mostly...', array['forced family poses', 'blurry chaos', 'one repeated outfit', 'me mid-cry', 'suspiciously posed, tiny influencer']),
  ('33333333-3333-3333-3333-000000008300', '22222222-2222-2222-2222-000000000083', 0, '📈', 'we''re at our best when...', array['we''ve been apart a few days', 'after a proper date', 'lazy mornings', 'we stop being polite about it', 'we talk about it after']),
  ('33333333-3333-3333-3333-000000008301', '22222222-2222-2222-2222-000000000083', 1, '💡', 'the thing i learned about myself with you...', array['i''m more affectionate than i knew', 'i can actually say things', 'what i actually like', 'i''m playful when i feel safe', 'comfort beats performance']),
  ('33333333-3333-3333-3333-000000008302', '22222222-2222-2222-2222-000000000083', 2, '🫦', 'one word for what i want tonight...', array['slow', 'playful', 'close', 'bold', 'all of it']),
  ('33333333-3333-3333-3333-000000008400', '22222222-2222-2222-2222-000000000084', 0, '🛡', 'we''re strongest when...', array['we''re travelling', 'things go wrong, weirdly', 'we team up on a project', 'we''re laughing at the same thing', 'it''s just us, no noise']),
  ('33333333-3333-3333-3333-000000008401', '22222222-2222-2222-2222-000000000084', 1, '🤝', 'my favourite thing we do as a team...', array['host people', 'navigate airports', 'cook big meals', 'win game nights', 'survive family events']),
  ('33333333-3333-3333-3333-000000008402', '22222222-2222-2222-2222-000000000084', 2, '🏆', 'the couple-goal i actually want...', array['the banter forever', 'the travel archive', 'the calm home', 'still on dates at 70', 'the matching sunday routine']),
  ('33333333-3333-3333-3333-000000008500', '22222222-2222-2222-2222-000000000085', 0, '🚪', 'the dream i haven''t said out loud...', array['starting my own thing', 'making something people love', 'moving somewhere wild', 'a bigger family', 'a slower life']),
  ('33333333-3333-3333-3333-000000008501', '22222222-2222-2222-2222-000000000085', 1, '🗝', 'what i''m still learning to believe...', array['i''m allowed to rest', 'i''m enough as is', 'good things stay', 'i can ask for more', 'this is real']),
  ('33333333-3333-3333-3333-000000008502', '22222222-2222-2222-2222-000000000085', 2, '♾', 'what i hope never changes...', array['how we talk', 'your laugh', 'our little rituals', 'how home feels', 'us choosing this']),
  ('33333333-3333-3333-3333-000000008600', '22222222-2222-2222-2222-000000000086', 0, '👵', 'the relative who shaped me most...', array['grandma, obviously', 'mum', 'dad', 'an aunt or uncle', 'an older cousin i copied']),
  ('33333333-3333-3333-3333-000000008601', '22222222-2222-2222-2222-000000000086', 1, '🏡', 'sundays growing up meant...', array['big family lunch', 'market runs', 'homework dread', 'service then food', 'cartoons and cereal']),
  ('33333333-3333-3333-3333-000000008602', '22222222-2222-2222-2222-000000000086', 2, '🫶', 'the friendship that taught me the most...', array['the childhood bestie', 'the one that faded', 'the school squad', 'the internet friend', 'the one that survived everything']),
  ('33333333-3333-3333-3333-000000008700', '22222222-2222-2222-2222-000000000087', 0, '📊', 'my most-used emoji is basically...', array['the crying-laughing one', 'the skull', 'a heart, some heart', 'the side-eye', 'thumbs up, passive-aggressively']),
  ('33333333-3333-3333-3333-000000008701', '22222222-2222-2222-2222-000000000087', 1, '🔁', 'the app i open without thinking...', array['instagram', 'tiktok', 'whatsapp', 'youtube', 'the fridge, it counts']),
  ('33333333-3333-3333-3333-000000008702', '22222222-2222-2222-2222-000000000087', 2, '🎚', 'my volume in life is...', array['loud, sorry', 'quiet until comfortable', 'matches the room', 'loud only with you', 'depends on caffeine']),
  ('33333333-3333-3333-3333-000000008800', '22222222-2222-2222-2222-000000000088', 0, '⚡', 'when the spark dips, what works for me...', array['a proper planned date', 'time apart, then reunion', 'a deep talk, no screens', 'a trip, even a small one', 'dancing, music loud']),
  ('33333333-3333-3333-3333-000000008801', '22222222-2222-2222-2222-000000000088', 1, '🌹', 'romance me on a budget by...', array['a picnic you packed', 'a playlist with a note', 'cooking my comfort food', 'a sunset walk, hand in hand', 'recreating our first date']),
  ('33333333-3333-3333-3333-000000008802', '22222222-2222-2222-2222-000000000088', 2, '🥰', 'the small thing you do that''s secretly huge...', array['your hand finding mine', 'how you say my name', 'checking i ate', 'the way you wait for me', 'laughing at my worst jokes']),
  ('33333333-3333-3333-3333-000000008900', '22222222-2222-2222-2222-000000000089', 0, '⏳', 'if i could tell 12-year-old me one thing...', array['it gets so much better', 'stop caring what they think', 'keep that hobby', 'hug the family more', 'wait till you see who you find']),
  ('33333333-3333-3333-3333-000000008901', '22222222-2222-2222-2222-000000000089', 1, '📦', 'in my time capsule from age 15...', array['a playlist', 'the diary, sealed forever', 'a uniform relic', 'cringe photos', 'a dramatic note to future me']),
  ('33333333-3333-3333-3333-000000008902', '22222222-2222-2222-2222-000000000089', 2, '🔮', 'past me would be shocked that i...', array['wake up early voluntarily', 'eat vegetables by choice', 'am this soft', 'did the scary thing', 'found you'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- ensure_today_drop: 0014 behavior (couple-local today, membership guard,
-- idempotent per couple+date) + rotation instead of the hardcoded DROP 27.
-- Rotation only considers catalog drops (position is not null), so ad-hoc /
-- test drops never enter the cycle.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_today_drop(p_couple uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_drop_id uuid;
  v_drop_id uuid;
  v_today date;
  v_member_a uuid;
  v_member_b uuid;
  v_allowed int;
begin
  select (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date, c.member_a, c.member_b
    into v_today, v_member_a, v_member_b
  from public.couples c
  where c.id = p_couple
    and (c.member_a = auth.uid() or c.member_b = auth.uid());

  if v_today is null then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select id into v_couple_drop_id
  from public.couple_drops
  where couple_id = p_couple
    and date = v_today;

  if v_couple_drop_id is null then
    -- Allowed spice = least of the members' levels (a missing member / missing
    -- profile / null level counts as flirty = 1, matching the app default).
    v_allowed := coalesce((
      select min(case lower(p.spice_level) when 'sweet' then 0 when 'spicy' then 2 else 1 end)
      from public.profiles p
      where p.id in (v_member_a, v_member_b)
    ), 1);

    -- Next drop this couple has never had, in catalog order.
    select d.id into v_drop_id
    from public.drops d
    where d.position is not null
      and d.spice <= v_allowed
      and not exists (
        select 1 from public.couple_drops cd
        where cd.couple_id = p_couple and cd.drop_id = d.id
      )
    order by d.position
    limit 1;

    -- Catalog exhausted: cycle from the least-recently-used eligible drop.
    if v_drop_id is null then
      select d.id into v_drop_id
      from public.drops d
      where d.position is not null
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

    insert into public.couple_drops (couple_id, drop_id, date, state)
    values (p_couple, v_drop_id, v_today, 'open')
    returning id into v_couple_drop_id;
  end if;

  return v_couple_drop_id;
end;
$$;
