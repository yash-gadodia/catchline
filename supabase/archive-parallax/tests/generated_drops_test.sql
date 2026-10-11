-- ============================================================================
-- GENERATED DROPS TEST (0019): the review queue + publish path.
--
-- Proves:
--   1. the prompts shape check-constraint rejects malformed jsonb
--      (2 prompts; 4 options in a prompt) and accepts the valid shape
--   2. publish_drop_candidate creates the drop (GEN code, title/theme/spice
--      mapped, position = catalog max + 1, i.e. IN the rotation) + exactly
--      3 drop_prompts of 5 options at positions 0..2
--   3. re-publishing is idempotent: same drop id back, no duplicate rows
--   4. drop_candidates is an ops surface: authenticated can neither select
--      nor insert (permission denied), and cannot execute the publish fn
--
-- Hermetic: own uuids, rolled back by the harness. Uses errcode-matching
-- throws_ok (23514 check violation, 42501 permission denied) so wording
-- changes never break it.
-- ============================================================================
begin;
  create extension if not exists pgtap;
  select plan(16);

  -- ---- 1. Shape constraint ----------------------------------------------------
  select throws_ok(
    $$insert into public.drop_candidates (id, title, theme, spice, prompts)
      values ('dc000000-0000-0000-0000-00000000bad1'::uuid, 'two prompts', 'fun', 0,
        '[{"emoji":"🍕","question":"q one...","options":["a","b","c","d","e"]},
          {"emoji":"🎬","question":"q two...","options":["a","b","c","d","e"]}]'::jsonb)$$,
    '23514', null,
    'shape: a candidate with only 2 prompts is rejected'
  );
  select throws_ok(
    $$insert into public.drop_candidates (id, title, theme, spice, prompts)
      values ('dc000000-0000-0000-0000-00000000bad2'::uuid, 'four options', 'fun', 0,
        '[{"emoji":"🍕","question":"q one...","options":["a","b","c","d"]},
          {"emoji":"🎬","question":"q two...","options":["a","b","c","d","e"]},
          {"emoji":"🧠","question":"q three...","options":["a","b","c","d","e"]}]'::jsonb)$$,
    '23514', null,
    'shape: a prompt with 4 options is rejected'
  );
  select lives_ok(
    $$insert into public.drop_candidates (id, title, theme, spice, prompts)
      values ('dc000000-0000-0000-0000-000000000001'::uuid, 'the gd test drop', 'spark', 1,
        '[{"emoji":"🦋","question":"the little thing you do that undoes me...","options":["the sleepy voice","the unprompted hand squeeze","laughing before the joke lands","stealing my hoodie","the doorway look back"]},
          {"emoji":"💌","question":"my favourite way you say i love you without saying it...","options":["saving me the last bite","the check-in text","warming my side of the bed","remembering the tiny thing","fixing it before i ask"]},
          {"emoji":"🌙","question":"the us-moment i replay most...","options":["the kitchen dance","the rained-out plan that got better","the long drive silence","the first sleepy sunday","the airport hug"]}]'::jsonb)$$,
    'shape: a valid 3x5 candidate inserts'
  );

  -- ---- 2. Publish creates the drop + prompts -----------------------------------
  -- Remember the catalog max position BEFORE publishing.
  create temp table gd_before as
    select coalesce(max(position), 0) as max_pos
    from public.drops where position is not null;

  create temp table gd_pub as
    select public.publish_drop_candidate('dc000000-0000-0000-0000-000000000001'::uuid) as drop_id;

  select is(
    (select count(*)::int from public.drops
     where id = (select drop_id from gd_pub)
       and code like 'GEN %'
       and title = 'the gd test drop'
       and theme = 'spark'
       and spice = 1),
    1,
    'publish: creates one drop with GEN code, title, theme, spice mapped'
  );
  select is(
    (select position from public.drops where id = (select drop_id from gd_pub)),
    (select max_pos + 1 from gd_before),
    'publish: position = catalog max + 1 (enters the rotation, not null)'
  );
  select is(
    (select count(*)::int from public.drop_prompts
     where drop_id = (select drop_id from gd_pub)),
    3,
    'publish: exactly 3 drop_prompts created'
  );
  select is(
    (select count(distinct position)::int from public.drop_prompts
     where drop_id = (select drop_id from gd_pub) and position between 0 and 2),
    3,
    'publish: prompt positions are exactly 0..2'
  );
  select is(
    (select count(*)::int from public.drop_prompts
     where drop_id = (select drop_id from gd_pub)
       and coalesce(array_length(options, 1), 0) <> 5),
    0,
    'publish: every published prompt has exactly 5 options'
  );
  select is(
    (select options[1] from public.drop_prompts
     where drop_id = (select drop_id from gd_pub) and position = 0),
    'the sleepy voice',
    'publish: options land verbatim from the candidate jsonb'
  );
  select is(
    (select status from public.drop_candidates
     where id = 'dc000000-0000-0000-0000-000000000001'::uuid),
    'approved',
    'publish: candidate flips to approved'
  );
  select ok(
    (select reviewed_at is not null and published_drop_id = (select drop_id from gd_pub)
     from public.drop_candidates
     where id = 'dc000000-0000-0000-0000-000000000001'::uuid),
    'publish: reviewed_at + published_drop_id recorded'
  );

  -- ---- 3. Idempotent re-publish --------------------------------------------------
  select is(
    public.publish_drop_candidate('dc000000-0000-0000-0000-000000000001'::uuid),
    (select drop_id from gd_pub),
    'idempotent: re-publish returns the same drop id'
  );
  select is(
    (select count(*)::int from public.drop_prompts
     where drop_id = (select drop_id from gd_pub)),
    3,
    'idempotent: re-publish does not duplicate prompts'
  );

  -- ---- 4. Ops surface: no client access -------------------------------------------
  set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','dc000000-0000-0000-0000-0000000000aa','role','authenticated')::text, true);

  select throws_ok(
    $$select * from public.drop_candidates$$,
    '42501', null,
    'rls: authenticated cannot select drop_candidates (permission denied)'
  );
  select throws_ok(
    $$insert into public.drop_candidates (title, theme, spice, prompts)
      values ('sneaky', 'fun', 0,
        '[{"emoji":"🍕","question":"q...","options":["a","b","c","d","e"]},
          {"emoji":"🎬","question":"q...","options":["a","b","c","d","e"]},
          {"emoji":"🧠","question":"q...","options":["a","b","c","d","e"]}]'::jsonb)$$,
    '42501', null,
    'rls: authenticated cannot insert drop_candidates (permission denied)'
  );
  select throws_ok(
    $$select public.publish_drop_candidate('dc000000-0000-0000-0000-000000000001'::uuid)$$,
    '42501', null,
    'rls: authenticated cannot execute publish_drop_candidate'
  );
  reset role;

  select * from finish();
rollback;
