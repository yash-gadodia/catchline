-- 0031_sg_ldr_packs.sql
-- Two themed content packs as GLOBAL drops (couple_id null), per
-- docs/IMPROVEMENT_PLAN.md 5.3 (real themed packs wired to the catalog) and
-- 6.3 (a dedicated LDR pack for the highest-converting segment):
--
--   theme 'sg'  — SG 01..07:  Singapore couple life (hawker orders as love
--                 languages, MRT vs Grab, void-deck nostalgia, NS-era waiting,
--                 the eating deadlock, aircon wars).
--   theme 'ldr' — LDR 01..07: long distance (timezone math, goodnight calls,
--                 airport reunions, care packages, proximity envy, synced
--                 shows, the same-city endgame).
--
-- Shape matches the 0015 catalog: fixed UUIDs + on-conflict-do-nothing so
-- re-running is a no-op; positions 501..514 sit past the base catalog (0..89)
-- and past any published GEN drops (position = max+1 keeps growing from here),
-- so pack drops never hijack the early rotation — they surface via send_pack
-- (theme steer) or once the main catalog is exhausted. Every prompt works
-- bidirectionally (both partners answer about THEMSELVES + hunch the other)
-- and carries exactly 3 genuinely pickable options.
--
-- Client registry: src/content/extras.ts PACKS gains 'sg' + 'ldr' entries
-- keyed to these themes (usePackSamples + send_pack both key off drops.theme).
--
-- No new tables/functions: drops + drop_prompts grants (0006) and RLS (0030 —
-- global rows readable by any authenticated user) already cover these rows.
-- Depends only on 0015 (position, spice) and 0030 (couple_id). Idempotent.

insert into public.drops (id, code, title, theme, position, spice, couple_id)
values
  -- ── SG: little red dot ────────────────────────────────────────────────────
  ('44444444-4444-4444-4444-000000000001', 'SG 01', 'the hawker heart',    'sg', 501, 0, null),
  ('44444444-4444-4444-4444-000000000002', 'SG 02', 'east side west side', 'sg', 502, 0, null),
  ('44444444-4444-4444-4444-000000000003', 'SG 03', 'mrt or grab',         'sg', 503, 0, null),
  ('44444444-4444-4444-4444-000000000004', 'SG 04', 'void deck days',      'sg', 504, 0, null),
  ('44444444-4444-4444-4444-000000000005', 'SG 05', 'the ns era',          'sg', 505, 0, null),
  ('44444444-4444-4444-4444-000000000006', 'SG 06', 'the eating deadlock', 'sg', 506, 0, null),
  ('44444444-4444-4444-4444-000000000007', 'SG 07', 'aircon wars',         'sg', 507, 0, null),
  -- ── LDR: same moon ────────────────────────────────────────────────────────
  ('44444444-4444-4444-4444-000000000008', 'LDR 01', 'the timezone tax',    'ldr', 508, 0, null),
  ('44444444-4444-4444-4444-000000000009', 'LDR 02', 'goodnight protocol',  'ldr', 509, 0, null),
  ('44444444-4444-4444-4444-000000000010', 'LDR 03', 'airport mode',        'ldr', 510, 1, null),
  ('44444444-4444-4444-4444-000000000011', 'LDR 04', 'care package theory', 'ldr', 511, 0, null),
  ('44444444-4444-4444-4444-000000000012', 'LDR 05', 'the green-eyed hours','ldr', 512, 0, null),
  ('44444444-4444-4444-4444-000000000013', 'LDR 06', 'synced screens',      'ldr', 513, 0, null),
  ('44444444-4444-4444-4444-000000000014', 'LDR 07', 'the long game',       'ldr', 514, 0, null)
on conflict (id) do nothing;

insert into public.drop_prompts (id, drop_id, position, emoji, question, options)
values
  -- SG 01 · the hawker heart — the order IS the love language
  ('55555555-5555-5555-5555-000000000100', '44444444-4444-4444-4444-000000000001', 0, '🍗', 'my death-row hawker order, no experiments...', array['chicken rice, the eternal answer', 'laksa, extra everything', 'cai fan — my custom build, don''t rush me']),
  ('55555555-5555-5555-5555-000000000101', '44444444-4444-4444-4444-000000000001', 1, '☕', 'my kopitiam order personality...', array['kopi o kosong, no nonsense', 'teh c peng, sweet and iced', 'milo dinosaur, judge me']),
  ('55555555-5555-5555-5555-000000000102', '44444444-4444-4444-4444-000000000001', 2, '🫰', 'i know it''s love when you...', array['chope the seat with tissue before i arrive', 'stand the long queue so i don''t have to', 'remember my exact chilli-to-sauce ratio']),

  -- SG 02 · east side west side — island loyalty
  ('55555555-5555-5555-5555-000000000200', '44444444-4444-4444-4444-000000000002', 0, '🧭', 'my side of the island, non-negotiable...', array['east side, best side', 'west side, the honest side', 'i claim whichever side you''re on']),
  ('55555555-5555-5555-5555-000000000201', '44444444-4444-4444-4444-000000000002', 1, '🚇', 'a cross-island trip to see you is...', array['a love letter in mrt form', 'an expedition — i pack water', 'the reason we should just move in']),
  ('55555555-5555-5555-5555-000000000202', '44444444-4444-4444-4444-000000000002', 2, '🛫', 'changi airport, to me, is...', array['a legitimate date spot, fight me', 'the send-off cry zone', 'terminal 3 basement food, that''s it']),

  -- SG 03 · mrt or grab — the getting-there negotiations (+ the JB pilgrimage)
  ('55555555-5555-5555-5555-000000000300', '44444444-4444-4444-4444-000000000003', 0, '🚕', 'my default way across town...', array['mrt — we are not made of money', 'grab, my comfort is priceless', 'depends how sweaty the day is']),
  ('55555555-5555-5555-5555-000000000301', '44444444-4444-4444-4444-000000000003', 1, '⏰', '"otw" from me actually means...', array['already on the train, tracking my dot', 'just got out of the shower', 'have not left the house, sorry']),
  ('55555555-5555-5555-5555-000000000302', '44444444-4444-4444-4444-000000000003', 2, '🛂', 'on our jb day trip, i''m the one who...', array['built the massage-and-makan itinerary', 'says "just follow you" and means it', 'falls asleep at the checkpoint queue']),

  -- SG 04 · void deck days — HDB childhood nostalgia
  ('55555555-5555-5555-5555-000000000400', '44444444-4444-4444-4444-000000000004', 0, '🏢', 'little me, after school, was mostly...', array['at the mama shop spending 50 cents slowly', 'void deck block catching till the lights came on', 'home by three, guilty as charged']),
  ('55555555-5555-5555-5555-000000000401', '44444444-4444-4444-4444-000000000004', 1, '🐉', 'the playground i''d defend with my life...', array['the sand-pit dragon', 'the hdb fitness corner we never exercised at', 'the one they demolished, rip']),
  ('55555555-5555-5555-5555-000000000402', '44444444-4444-4444-4444-000000000004', 2, '🍧', 'the old-school snack that unlocks my childhood...', array['iced gem biscuits, colour first', 'ice cream uncle''s rainbow bread', 'mama shop slush, tongue dyed blue']),

  -- SG 05 · the ns era — the waiting seasons (both sides of them)
  ('55555555-5555-5555-5555-000000000500', '44444444-4444-4444-4444-000000000005', 0, '🫡', 'army stories at our table, i''m...', array['the teller, sorry in advance', 'the listener who knows them by heart', 'the fact-checker — "eh, got exaggerate"']),
  ('55555555-5555-5555-5555-000000000501', '44444444-4444-4444-4444-000000000005', 1, '✉️', 'long stretches apart turn me into...', array['the long-letter writer', 'the countdown keeper', 'the "act normal, miss you sick" type']),
  ('55555555-5555-5555-5555-000000000502', '44444444-4444-4444-4444-000000000005', 2, '🎉', 'book-out-day energy, for us, is now...', array['friday night, every week', 'seeing you after any trip away', 'honestly, every time you come over']),

  -- SG 06 · the eating deadlock — the national question
  ('55555555-5555-5555-5555-000000000600', '44444444-4444-4444-4444-000000000006', 0, '🍱', '"anything also can" from me means...', array['i truly mean anything, i promise', 'i have a craving — guess it', 'anything except the place we always go']),
  ('55555555-5555-5555-5555-000000000601', '44444444-4444-4444-4444-000000000006', 1, '🤝', 'our where-to-eat deadlock usually breaks when...', array['someone finally admits the craving', 'we surrender to the usual place', 'whoever''s hangrier wins']),
  ('55555555-5555-5555-5555-000000000602', '44444444-4444-4444-4444-000000000006', 2, '🌶', 'chilli in this relationship, i''m...', array['extra chilli, extra everything', 'the mild one, don''t bully me', 'crying but stealing your sambal anyway']),

  -- SG 07 · aircon wars — climate is the fifth love language
  ('55555555-5555-5555-5555-000000000700', '44444444-4444-4444-4444-000000000007', 0, '❄️', 'my sleeping aircon setting, the truth...', array['18 degrees, blanket burrito', '24 with the fan on, balance', 'fan only — aircon is for guests']),
  ('55555555-5555-5555-5555-000000000701', '44444444-4444-4444-4444-000000000007', 1, '⛈', 'caught in a sudden downpour with you, i...', array['love it — free date extension', 'book the grab, zero discussion', 'run for it, hand in hand']),
  ('55555555-5555-5555-5555-000000000702', '44444444-4444-4444-4444-000000000007', 2, '🛋', 'my perfect sweaty-sunday escape...', array['mall aircon marathon', 'staycation robe life', 'thunderstorm nap, no alarms']),

  -- LDR 01 · the timezone tax — the math of us
  ('55555555-5555-5555-5555-000000000800', '44444444-4444-4444-4444-000000000008', 0, '🕰', 'my brain and your timezone...', array['i do the conversion instantly now', 'i keep a second clock on my phone', 'i still text you at your 4am, sorry']),
  ('55555555-5555-5555-5555-000000000801', '44444444-4444-4444-4444-000000000008', 1, '🌗', 'the hardest hour of the day apart...', array['my morning, your midnight', 'right after something funny happens', 'sunday evenings, always']),
  ('55555555-5555-5555-5555-000000000802', '44444444-4444-4444-4444-000000000008', 2, '📱', 'my "you''re awake now" tell...', array['the triple text landing at once', 'your spotify going green', 'i just feel it, honestly']),

  -- LDR 02 · goodnight protocol — the call is the ritual
  ('55555555-5555-5555-5555-000000000900', '44444444-4444-4444-4444-000000000009', 0, '📞', 'on our goodnight call, my honest role...', array['the one who falls asleep mid-sentence', 'the one narrating the entire day', 'the one who never hangs up first']),
  ('55555555-5555-5555-5555-000000000901', '44444444-4444-4444-4444-000000000009', 1, '🌙', 'if we skip the goodnight call, i...', array['sleep worse, won''t lie', 'leave a voice-note essay instead', 'am fine, but the bed feels bigger']),
  ('55555555-5555-5555-5555-000000000902', '44444444-4444-4444-4444-000000000009', 2, '🛏', 'what i actually look like on our video calls...', array['effort — for you, always', 'the same hoodie every single time', 'blanket cocoon, eyes only']),

  -- LDR 03 · airport mode — the reunion
  ('55555555-5555-5555-5555-000000001000', '44444444-4444-4444-4444-000000000010', 0, '🛬', 'my arrivals-gate energy...', array['running, luggage abandoned', 'playing it cool, dying inside', 'crying before i even spot you']),
  ('55555555-5555-5555-5555-000000001001', '44444444-4444-4444-4444-000000000010', 1, '⏳', 'the reunion countdown, i...', array['have the widget, the app, the wallpaper', 'refuse to count until the week of', 'count in "sleeps" like a kid']),
  ('55555555-5555-5555-5555-000000001002', '44444444-4444-4444-4444-000000000010', 2, '🔑', 'our first hour back together should be...', array['straight home, door closed, world off', 'our food place, immediately', 'no plan — just staring at you in 3d']),

  -- LDR 04 · care package theory — love in a box
  ('55555555-5555-5555-5555-000000001100', '44444444-4444-4444-4444-000000000011', 0, '📦', 'the first thing going in your care package...', array['snacks you can''t get over there', 'something that smells like me', 'a letter i''d never manage out loud']),
  ('55555555-5555-5555-5555-000000001101', '44444444-4444-4444-4444-000000000011', 1, '🧸', 'the thing of yours i keep closest...', array['the hoodie, obviously', 'the screenshots of us i re-read', 'the playlist we built together']),
  ('55555555-5555-5555-5555-000000001102', '44444444-4444-4444-4444-000000000011', 2, '💌', 'surprise mail from you would have me...', array['crying at the letterbox', 'calling you before i even open it', 'keeping the wrapping, keeping everything']),

  -- LDR 05 · the green-eyed hours — proximity envy, said out loud
  ('55555555-5555-5555-5555-000000001200', '44444444-4444-4444-4444-000000000012', 0, '🫥', 'couples doing boring errands together make me...', array['ache a little, won''t lie', 'screenshot it — "us soon"', 'weirdly proud of what we pull off instead']),
  ('55555555-5555-5555-5555-000000001201', '44444444-4444-4444-4444-000000000012', 1, '🎉', 'when you''re out with friends and i''m asleep...', array['happy for you, promise', 'a tiny bit left out, also promise', 'waiting for the 2am voice note']),
  ('55555555-5555-5555-5555-000000001202', '44444444-4444-4444-4444-000000000012', 2, '🪫', 'the distance hits hardest when...', array['i''m sick and want you here', 'something great happens and you''re asleep', 'everyone else brings a plus one']),

  -- LDR 06 · synced screens — the shared couch, virtually
  ('55555555-5555-5555-5555-000000001300', '44444444-4444-4444-4444-000000000013', 0, '📺', 'on movie-sync nights, i''m the one who...', array['counts down 3-2-1-play', 'pauses the second you get a snack', 'watches your face more than the show']),
  ('55555555-5555-5555-5555-000000001301', '44444444-4444-4444-4444-000000000013', 1, '🍿', 'if you watched ahead without me...', array['betrayal — actual crime', 'fine, but i need a full recap', 'i''ve done it too, no comment']),
  ('55555555-5555-5555-5555-000000001302', '44444444-4444-4444-4444-000000000013', 2, '🎮', 'our best long-distance date is...', array['movie night, synced to the second', 'online games until way too late', 'cooking the same recipe on call']),

  -- LDR 07 · the long game — hopeful, not saccharine
  ('55555555-5555-5555-5555-000000001400', '44444444-4444-4444-4444-000000000014', 0, '🗺', 'what keeps me sure about us...', array['we have an actual end-date plan', 'we never run out of things to say', 'every visit feels like proof']),
  ('55555555-5555-5555-5555-000000001401', '44444444-4444-4444-4444-000000000014', 1, '🏠', 'when i picture same-city us, i see...', array['the boring errands, finally together', 'a tiny place that''s ours', 'never saying goodbye at a gate again']),
  ('55555555-5555-5555-5555-000000001402', '44444444-4444-4444-4444-000000000014', 2, '📆', 'the milestone i quietly can''t wait for...', array['keys that open the same door', 'a timezone of our own', 'retiring the countdown app forever'])
on conflict (id) do nothing;
