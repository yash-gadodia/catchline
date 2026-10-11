# Dev Setup — running Parallax locally

A from-scratch guide to get the app running on your Mac. Aimed at a first-time clone. If something breaks, jump to [Troubleshooting](#troubleshooting).

> ## 🔑 Secrets: the one rule
>
> This repo is **PUBLIC** — anyone on the internet can read every tracked file. So real values (API keys, tokens, passwords, `.p8` files, connection strings) live in exactly two places, **both gitignored**:
>
> - **`.secrets/`** — real key files + a value index (`KEYS.md`). Yash AirDrops this folder to you; it never goes through git.
> - **`.env`** — your local environment values (created in step 3 below).
>
> You don't have to be perfect — the tooling has your back: a **git pre-commit hook** (`.githooks/pre-commit`, wired automatically when you `npm install`) refuses any commit containing a secret-looking file or value, Claude's hooks block writes to key files (`.env`, `*.p8`, `*.pem`, `credentials*`, …), and `.gitignore` keeps both places out of commits. Just follow the habit: **a real value never goes into a tracked file** — not in code, not in docs, not in an example. `.env.example` gets placeholders only.
>
> And if you ever *do* spot a real key sitting in a tracked file: no panic, no shame — **tell Yash right away** so he can rotate it. Fast beats perfect here. 💛

## 1. Get the code + prerequisites

```bash
git clone https://github.com/yash-gadodia/parallax.git
cd parallax
```

| Tool | Why | Install |
|---|---|---|
| **macOS (Apple Silicon)** | dev machine | — |
| **Node 20+ LTS** | JS runtime / Expo | `brew install node` or nvm |
| **Docker** (OrbStack or colima) | runs local Supabase | `brew install orbstack` (or `brew install colima docker && colima start`) |
| **Supabase CLI** | local Postgres/Auth/Realtime | `brew install supabase/tap/supabase` |
| **Xcode** + a simulator *(optional)* | only for the iOS **simulator** / native dev builds | Mac App Store → open once → install an iPhone simulator |
| **Watchman** *(optional)* | faster file watching | `brew install watchman` |

> **No Xcode? No problem.** You can develop with **Expo Go on your phone** (free on the App Store) — `npx expo start`, scan the QR code, done. See step 5. Xcode is only needed for the Mac simulator or native builds.

Check: `node -v` (≥20), `docker ps` (daemon up), `supabase --version` — and only if using the simulator, `xcrun simctl list devices | grep Booted`.

## 2. Install JS dependencies

```bash
npm install --legacy-peer-deps
```

> **`--legacy-peer-deps` is required**, not optional — `react-native-reanimated`/`react-native-worklets` declare a peer range npm's strict resolver rejects. The tracked `.npmrc` (`legacy-peer-deps=true`) already sets it for you, so plain `npm install` works too — the explicit flag is belt-and-braces. If an install ever errors on peer deps, this flag is the fix.

## 3. Environment

```bash
cp .env.example .env
```

`.env` only *needs* two values, both public-safe (the anon key is designed to ship in the client — RLS is the security backbone). Both come from the output of `supabase start` in the next step:

```
EXPO_PUBLIC_SUPABASE_URL=http://<your-LAN-IP>:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key printed by `supabase start`>
```

- Use your Mac's **LAN IP** (e.g. `192.168.x.x`), not `localhost`, so a physical phone on the same Wi-Fi can reach it. The iOS simulator accepts the LAN IP too (though `127.0.0.1` is more reliable there — see Troubleshooting). Find it: `ipconfig getifaddr en0`.
- The other four vars in `.env.example` are optional locally and degrade gracefully while unset: `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (payments no-op outside a real build) and `EXPO_PUBLIC_ANALYTICS_KEY` / `EXPO_PUBLIC_ANALYTICS_HOST` (analytics no-ops).

## 4. Backend (local Supabase)

```bash
supabase start          # boots Postgres + Auth + Realtime + Studio in Docker
supabase db reset       # applies ALL migrations (supabase/migrations/) + seed.sql (wipes local data)
```

> **On colima** (instead of OrbStack/Docker Desktop), plain `supabase start` fails on the `vector` log container (colima can't mount its docker.sock). Use:
> ```bash
> supabase start -x vector,analytics --ignore-health-check
> ```
> Everything the app needs still runs; you only lose the CLI's internal log shipper.

`supabase start` prints the **API URL**, **anon key**, and **service_role key** — copy the first two into `.env`. Useful local URLs:

- **Studio** (DB browser): http://127.0.0.1:54323
- **Mailpit** (catches all outgoing email, incl. signup confirmations): http://127.0.0.1:54324

Seed a pre-confirmed user so you can sign in without the email step:

```bash
npm run seed        # (= ./scripts/seed-test-user.sh) → test@parallax.app / parallax123
```

## 5. Run the app

**Path A — Expo Go on your phone (no Xcode needed):**

```bash
npx expo start      # (or: npm start)
```

Scan the QR code with the **Expo Go** app (free on the App Store); phone and Mac must be on the same Wi-Fi, and `.env` must use the Mac's LAN IP (step 3). Native-only features gate gracefully in Expo Go: payments no-op and Apple sign-in shows a labeled error — everything else works.

**Path B — iOS simulator (needs Xcode):**

```bash
npm run dev        # doctor (health-checks env, auto-fixes) + builds & launches on the sim
# or the direct route:
npm run ios        # prebuilds (if needed), compiles the native dev client, installs & launches on the booted sim
```

First build takes a few minutes (compiles native pods incl. RevenueCat). Subsequent runs are incremental. JS changes hot-reload via Metro; **native/route-layout changes need a full reload** (shake → Reload) or a rebuild.

To target a specific simulator: `npm run ios -- --device "iPhone 17 Pro Max"`.

## 6. Verify your setup

```bash
npm run typecheck          # → 0 errors
npm test                   # → all suites green
npx expo export -p ios     # → bundles every route (catches route/import breaks)
supabase test db           # → pgTAP RLS + reveal-gate tests pass
```

(`npm run verify` runs the first three in one go.) If all four are green, you're set.

## Testing the flows by hand

- **Skip signup:** Welcome → "I already have an account" → `test@parallax.app` / `parallax123`.
- **Real signup + confirmation:** create an account in-app → open **Mailpit** (http://127.0.0.1:54324) → click the confirmation link (it deep-links back into the app via `parallax://auth-callback`).
- **Whole daily loop solo:** the app has a demo/SIM mode — `sim_partner_submit` stands in for a partner, so you can create a couple and complete a full reveal alone.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm install` peer-dep error | use `npm install --legacy-peer-deps` |
| `supabase start` hangs/fails on the `vector` container | you're on colima → `supabase start -x vector,analytics --ignore-health-check` |
| App can't reach Supabase / network errors / **sign-in fails or times out** | Two common causes on the **simulator**: (1) use `http://127.0.0.1:54321` as the URL — the sim reaches the Mac via loopback, the LAN IP is only for a physical phone (and goes stale between networks); (2) the **anon key in `.env` must match `supabase status`** — it drifts if the local stack is recreated. Fix both, then **restart Metro with `--clear`** and relaunch the app (env vars are bundled at Metro start). |
| `supabase test db` shows FAIL right after manual psql/agent work | local DB is dirty → `supabase db reset` first, then re-run. |
| Reload shows stale JS in the sim | Expo caches the bundle — shake → Reload, or rebuild. Verify route/layout changes with `npx expo export`. |
| Port 8081 already in use | a Metro server is already running; reuse it, or kill it and re-run. |
| Native build fails after a dep change | `cd ios && pod install` (or delete `ios/` and let `npm run ios` prebuild), then rebuild. |
| Text invisible / clipped | RN `lineHeight` is **pixels** not a multiplier, and every `<Text>` needs its own `color`. See `.claude/rules/frontend.md`. |
| Confirmation email never arrives locally | it won't be sent via real SMTP locally — check **Mailpit**. |
