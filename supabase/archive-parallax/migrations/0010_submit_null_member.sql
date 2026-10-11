-- 0010_submit_null_member.sql
-- 0009 made couples.member_a / member_b nullable (a deleted account nulls its
-- membership slot). The completion check in submit_answers used
-- `a.author = (select member_a ...)`; when that member is NULL, SQL NULL-comparison
-- makes the check always false, so the surviving partner's drop could never reach
-- 'revealed'. Treat a NULL (dissolved) member slot as already-done.
create or replace function public.submit_answers(
  p_couple_drop uuid,
  p_answers jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_drop_id uuid;
  v_member_a uuid;
  v_member_b uuid;
  v_prompt_id uuid;
  v_pick int;
  v_hunch int;
  v_answer jsonb;
  v_new_state text;
  v_member_a_done boolean;
  v_member_b_done boolean;
  v_prompt_count int;
  v_opt_count int;
begin
  -- Get the couple_drop and verify membership
  select cd.couple_id, cd.drop_id into v_couple_id, v_drop_id
  from public.couple_drops cd
  where cd.id = p_couple_drop;

  if v_couple_id is null then
    raise exception 'couple_drop not found';
  end if;

  select c.member_a, c.member_b into v_member_a, v_member_b
  from public.couples c where c.id = v_couple_id;

  -- Verify caller is a member of the couple
  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  -- Count prompts for this drop (for the "all answered" check)
  select count(*)::int into v_prompt_count
  from public.drop_prompts dp
  where dp.drop_id = v_drop_id;

  -- Insert or update each answer, validating each one
  for v_answer in select * from jsonb_array_elements(p_answers)
  loop
    v_prompt_id := (v_answer->>'prompt_id')::uuid;
    v_pick := (v_answer->>'pick')::int;
    v_hunch := (v_answer->>'hunch')::int;

    -- The prompt must belong to THIS drop (not just exist somewhere)
    select coalesce(array_length(options, 1), 0) into v_opt_count
    from public.drop_prompts
    where id = v_prompt_id and drop_id = v_drop_id;

    if v_opt_count is null then
      raise exception 'prompt % does not belong to this drop', v_prompt_id;
    end if;

    if v_pick is not null and (v_pick < 0 or v_pick >= v_opt_count) then
      raise exception 'pick % out of range for prompt %', v_pick, v_prompt_id;
    end if;
    if v_hunch is not null and (v_hunch < 0 or v_hunch >= v_opt_count) then
      raise exception 'hunch % out of range for prompt %', v_hunch, v_prompt_id;
    end if;

    insert into public.answers (couple_drop_id, prompt_id, author, pick, hunch)
    values (p_couple_drop, v_prompt_id, auth.uid(), v_pick, v_hunch)
    on conflict (couple_drop_id, prompt_id, author) do update
    set pick = excluded.pick, hunch = excluded.hunch, created_at = now();
  end loop;

  -- A dissolved (NULL) member slot counts as done so it never blocks the reveal.
  v_member_a_done := v_member_a is null or (
    select count(*) = v_prompt_count
    from public.answers a
    where a.couple_drop_id = p_couple_drop and a.author = v_member_a
  );
  v_member_b_done := v_member_b is null or (
    select count(*) = v_prompt_count
    from public.answers a
    where a.couple_drop_id = p_couple_drop and a.author = v_member_b
  );

  if v_member_a_done and v_member_b_done then
    v_new_state := 'revealed';
  elsif v_member_a_done or v_member_b_done then
    v_new_state := 'one_done';
  else
    v_new_state := 'open';
  end if;

  update public.couple_drops
  set state = v_new_state
  where id = p_couple_drop;

  return json_build_object(
    'success', true,
    'couple_drop_id', p_couple_drop,
    'new_state', v_new_state
  );
end;
$$;

grant execute on function public.submit_answers(uuid, jsonb) to authenticated;
