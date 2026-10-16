-- 0009_apple_tokens.sql
-- Sign in with Apple refresh tokens, kept so delete-account can revoke them
-- (App Store guideline 5.1.1(v)). Written by the apple-token edge function and
-- read by delete-account, both with the service role. RLS is on with no
-- policies and every client grant revoked: no app session ever sees a token.

create table if not exists public.apple_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
revoke all on public.apple_tokens from public, anon, authenticated;
grant all on public.apple_tokens to service_role;
