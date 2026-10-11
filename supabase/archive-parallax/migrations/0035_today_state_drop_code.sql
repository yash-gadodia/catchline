-- 0035_today_state_drop_code.sql
-- F5: get_today_state also returns the real drop code + title so Today shows
-- the couple's actual rotation position instead of a hardcoded label.
-- Body is the 0026 definition (catch-up fields preserved) + drop_code/drop_title.

create or replace function public.get_today_state(p_couple uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_a uuid;
  v_member_b uuid;
  v_status text;
  v_today date;
  v_last date;
  v_cd_id uuid;
  v_state text;
  v_wave int;
  v_drop_id uuid;
  v_drop_code text;
  v_drop_title text;
  v_prompt_count int;
  v_me_done boolean := false;
  v_partner_done boolean := false;
  v_partner uuid;
  v_y_state text;
  v_catch_up boolean := false;
begin
  select c.member_a, c.member_b, c.status,
         (now() at time zone coalesce(c.tz, 'Asia/Singapore'))::date,
         c.last_played_on
    into v_member_a, v_member_b, v_status, v_today, v_last
  from public.couples c where c.id = p_couple;

  if v_member_a is null and v_member_b is null then
    raise exception 'couple not found';
  end if;

  if not (auth.uid() = v_member_a or auth.uid() = v_member_b) then
    raise exception 'Unauthorized: not a member of this couple';
  end if;

  select cd.state into v_y_state
  from public.couple_drops cd
  where cd.couple_id = p_couple and cd.date = v_today - 1;

  -- Catch-up: yesterday exists unfinished, or was never opened by a couple
  -- that has a history. Held entirely while pending (no reveal to chase).
  v_catch_up := v_status <> 'pending' and (
    (v_y_state is not null and v_y_state <> 'revealed')
    or (v_y_state is null and v_last is not null)
  );

  select cd.id, cd.state, cd.wave_pct, cd.drop_id
    into v_cd_id, v_state, v_wave, v_drop_id
  from public.couple_drops cd
  where cd.couple_id = p_couple and cd.date = v_today;

  if v_cd_id is null then
    return json_build_object(
      'exists', false,
      'date', v_today,
      'catch_up_available', v_catch_up,
      'yesterday_state', v_y_state
    );
  end if;

  select d.code, d.title into v_drop_code, v_drop_title
  from public.drops d
  where d.id = v_drop_id;

  select count(*)::int into v_prompt_count
  from public.drop_prompts where drop_id = v_drop_id;

  v_partner := case when auth.uid() = v_member_a then v_member_b else v_member_a end;

  select v_prompt_count > 0 and count(*) = v_prompt_count into v_me_done
  from public.answers where couple_drop_id = v_cd_id and author = auth.uid();

  if v_partner is not null then
    select v_prompt_count > 0 and count(*) = v_prompt_count into v_partner_done
    from public.answers where couple_drop_id = v_cd_id and author = v_partner;
  end if;

  return json_build_object(
    'exists', true,
    'date', v_today,
    'couple_drop_id', v_cd_id,
    'state', v_state,
    'wave_pct', v_wave,
    'i_answered', v_me_done,
    'partner_answered', v_partner_done,
    'held', (v_status = 'pending'),
    'catch_up_available', v_catch_up,
    'yesterday_state', v_y_state,
    'drop_code', v_drop_code,
    'drop_title', v_drop_title
  );
end;
$$;

grant execute on function public.get_today_state(uuid) to authenticated;
