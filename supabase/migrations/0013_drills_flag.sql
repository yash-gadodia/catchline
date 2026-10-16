-- Server switch for the drill card under the cue (feature_flags is client-readable, service-role writable).
-- Off by default: the drill copy is a draft until a coach reviews it (src/features/drills/drills.ts).
insert into public.feature_flags (key, enabled, note)
values ('drills', false, 'Shows the "Try this drill" card under the cue. Draft drills stay hidden in release builds while this is off.')
on conflict (key) do nothing;
