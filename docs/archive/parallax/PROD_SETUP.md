# Production Setup — backend & infra runbook

How to stand up Parallax's **production** backend. Pairs with `docs/GO_LIVE.md` (the full launch checklist) and `docs/DEV_SETUP.md` (local dev). Written so anyone on the team (Dani included) can do it.

> # ⚠️ THIS REPO IS PUBLIC / OPEN SOURCE — NEVER COMMIT CREDENTIALS
> No DB passwords, no API keys, no `service_role`/`sb_secret_…` keys, no connection strings that contain a password. Ever. They live in exactly two places:
> - **Local dev:** `.env` (gitignored — points at your *local* Supabase, not prod).
> - **Prod builds:** **EAS secrets** (`eas secret:create …`) — read at build time, never in the repo.
>
> A git hook blocks writes to `.env`/`*.key`/etc., but the rule is simpler than the hook: **if it's a secret, it never touches a tracked file.** If a secret ever leaks (a paste, a screenshot, a commit), **rotate it immediately** (Dashboard → Settings → Database to roll the DB password, Settings → API to roll keys) — rotation makes the leaked copy dead.

---

## Production Supabase (one-time)

### 1. Create the project — ⚠️ region is PERMANENT
- New project → region **Southeast Asia (Singapore) / `ap-southeast-1`** (lowest latency for our SG/SEA users).
- **You cannot change a Supabase project's region after creation.** Pick wrong and you must create a *new* project and re-push (cheap only while there's no data). We learned this the hard way — the first project landed in Seoul and had to be recreated in Singapore.
- Set a strong **DB password** → save it in a password manager (1Password), **not** the repo.

### 2. Push the schema (all migrations)
The direct DB host (`db.<ref>.supabase.co`) is **IPv6-only** and most networks can't reach it (`dial tcp … no route to host`). Use the **Session pooler** (IPv4) connection string instead:

- Dashboard → **Connect** → **Direct** tab → copy the **Session pooler** string (port **5432** — good for migrations/DDL; the 6543 "Transaction pooler" is for serverless runtime, not migrations).

```bash
# from the repo root; <REF> + <DB_PASSWORD> are yours, never committed
supabase db push --db-url "postgresql://postgres.<REF>:<DB_PASSWORD>@aws-<N>-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

Verify it landed (Local ↔ Remote should match `0001 … 00NN`):
```bash
supabase migration list --db-url "postgresql://postgres.<REF>:<DB_PASSWORD>@aws-<N>-ap-southeast-1.pooler.supabase.com:5432/postgres"
```
RLS is the privacy backbone — confirm it's on every table:
```sql
select tablename, rowsecurity from pg_tables where schemaname='public';  -- rowsecurity must be t for all
```

### 3. Auth redirect
Authentication → **URL Configuration** → add redirect `parallax://auth-callback` (email confirmation + OAuth deep-link back into the app).

### 4. Wire the app to prod — at BUILD time, not in the repo
Prod **URL** + **publishable (anon) key** go into **EAS secrets**, read by the build:
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<REF>.supabase.co"
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "sb_publishable_…"
```
- The **publishable/anon** key is *designed* to ship in the client (RLS gates everything) — but still keep it out of tracked files for hygiene.
- The **`service_role` / `sb_secret_…`** key gives full admin + bypasses RLS — it must **never** be exposed; it's only ever set server-side via `supabase secrets set …` for edge functions.

### 5. Everything else
Server-side keys (Anthropic, Resend), OAuth providers, RevenueCat, push (APNs/FCM), the daily `reset_stale_streaks()` cron, and prod hardening (`verify_jwt`, rate limits, gating the demo `sim_partner_submit` RPC) — all in **`docs/GO_LIVE.md`**.

---

## Local dev never touches prod
`docs/DEV_SETUP.md` is the local flow: `supabase start` + `supabase db reset` run a *local* Postgres in Docker, and `.env` points there. Prod is only reached via the explicit `--db-url` push above. Don't put prod creds in `.env`.
