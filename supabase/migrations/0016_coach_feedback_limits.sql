-- save_coach_feedback checks the coach_links size limits itself and raises a named code. Left to the table
-- CHECKs, an oversized note or override came back to the anonymous caller as a raw 23514 whose details held
-- the whole coach_links row (owner user_id, lift_id, token).

create or replace function public.save_coach_feedback(p_token text, p_overrides jsonb default null,
                                                      p_notes text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_overrides is not null and jsonb_typeof(p_overrides) <> 'object' then
    raise exception 'bad_overrides';
  end if;
  if p_overrides is not null and pg_column_size(p_overrides) > 8192 then
    raise exception 'overrides_too_large';
  end if;
  if p_notes is not null and char_length(p_notes) > 4000 then
    raise exception 'notes_too_long';
  end if;
  update public.coach_links
     set overrides = coalesce(p_overrides, overrides), notes = coalesce(p_notes, notes)
   where token = p_token and revoked_at is null and expires_at > now();
  return found;
end;
$$;

revoke all on function public.save_coach_feedback(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_coach_feedback(text, jsonb, text) to anon, authenticated;
