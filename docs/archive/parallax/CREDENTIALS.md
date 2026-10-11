# Credentials & env vars — inventory (a MAP, never the values)

> ⚠️ **This repo is PUBLIC.** This file lists **what** credentials the app uses and **where the real values live** — it must **never contain a value** (no keys, passwords, tokens). Secrets live in **1Password** + the service dashboards. If a value ever lands in here (or any tracked file), remove it and **rotate** the secret.

## App env vars (`EXPO_PUBLIC_*`) — embedded into the build
| Var | Purpose | Where the value lives |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | **EAS env vars** (preview + production) · local: `.env` (gitignored) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | publishable/anon key (client-safe, RLS-gated) | **EAS env vars** (marked *sensitive*) · local: `.env` |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` | RevenueCat SDK keys | EAS env / `.env` (when set) |
| `EXPO_PUBLIC_ANALYTICS_KEY` | PostHog analytics | EAS env / `.env` (no-ops until set) |

- Inspect: `eas env:list preview` (or `production`). Add: `eas env:create --environment <env> --name <NAME> --value <…>`.
- **Local dev uses local Supabase**, so your `.env` URL/key point at `127.0.0.1`, *not* prod.

## Server-side secrets — NEVER in the client, the repo, or chat
| Secret | Purpose | Where it lives |
|---|---|---|
| Supabase **DB password** | migrations / direct DB (`--db-url`) | 1Password + Supabase → Settings → Database |
| Supabase **`service_role` / `sb_secret_…`** | admin (bypasses RLS), edge fns | Supabase → Settings → API + `supabase secrets set` |
| `ANTHROPIC_API_KEY` | Refocus AI edge fn | `supabase secrets set …` (value from Anthropic console) |
| `RESEND_SMTP_PASSWORD` | prod confirmation emails | Supabase Auth SMTP config + 1Password |
| **Expo token** (personal/robot) | EAS CLI/CI automation | 1Password (rotate if ever exposed) |
| **App Store Connect API key** | `eas submit` to TestFlight | 1Password + App Store Connect |

## How a teammate (e.g. Dani) inherits all this — without copy-pasting secrets
1. **EAS** (build env vars): add them to the project → `expo.dev/accounts/mcbebu/projects/parallax` → members. Build env vars then apply automatically.
2. **Supabase** (dashboard/keys): add them to the project → Organization → Members.
3. **Secrets** (DB password, API keys, tokens): share via a **1Password vault** — never a commit, never a chat.
4. **Local dev**: they create their own `.env` against their own local Supabase (see `docs/DEV_SETUP.md`).

## If something leaks
Rotate immediately in the service dashboard (Supabase → Database/API to roll; Expo → revoke token; Apple → revoke key). Rotation makes the leaked copy dead. See `docs/PROD_SETUP.md`.
