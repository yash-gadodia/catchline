-- 0042_feature_flags.sql
-- V2 eng gate §11.6: OTA-toggleable feature flags. One row per flag; clients
-- read, only service_role (the dashboard / ops) writes. Every V2 surface is
-- gated on one of these and every flag ships OFF:
--   f1_mood_check      — Today mood-check inline card
--   f1_partner_notify  — async "when you're ready" partner push
--   f2_repair_checkin  — repair check-in card + mutual reveal
--   f3_weave           — event-driven drop weave (required kill-switch)
--   f5_growth_counter  — Us tab growth counter hero
--
-- F1 flag-on is additionally blocked by Yash's S0 safety sign-off (V2_PLAN §4).

create table if not exists public.feature_flags (
  key text not null primary key,
  enabled boolean not null default false,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;

-- Clients may read flag state; no client may ever write it.
drop policy if exists "feature_flags_select" on public.feature_flags;
create policy "feature_flags_select"
  on public.feature_flags
  for select
  to authenticated
  using (true);

insert into public.feature_flags (key, enabled, note)
values
  ('f1_mood_check',     false, 'V2 F1: Today mood-check card. Flag-on blocked by S0 safety sign-off.'),
  ('f1_partner_notify', false, 'V2 F1: async partner notification on two-sided refocus start.'),
  ('f2_repair_checkin', false, 'V2 F2: repair check-in card + gated mutual reveal.'),
  ('f3_weave',          false, 'V2 F3: event-driven weave. KILL SWITCH — only after the §4-F3 quality gate.'),
  ('f5_growth_counter', false, 'V2 F5: Us tab growth counter hero.')
on conflict (key) do nothing;

-- ============================================================================
-- GRANTS (0037 pattern: explicit, never default ACLs)
-- ============================================================================
revoke all on public.feature_flags from public, anon, authenticated;
grant select on public.feature_flags to authenticated;
grant select, insert, update, delete on public.feature_flags to service_role;
