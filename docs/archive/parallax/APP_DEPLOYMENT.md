# App Deployment — building & shipping via EAS

How to build Parallax and ship it to the **App Store** (iOS) + **Play Store** (Android) with **EAS** (Expo Application Services, expo.dev). Pairs with `docs/GO_LIVE.md`, `docs/PROD_SETUP.md`, `docs/CREDENTIALS.md`.

> ⚠️ **Public repo — no credentials here.** This doc is the *generic, value-free* runbook. Expo tokens, Apple keys, DB passwords live in **`.secrets/` (gitignored) / 1Password / EAS / the dashboards**, never in tracked files. The map of what lives where is `docs/CREDENTIALS.md`; the **private, values-included** build & deploy runbook for this app is **`.secrets/BUILD_AND_DEPLOY.md`** (gitignored — never copy from it into tracked docs).

## One-time EAS setup
1. Install: `npm i -g eas-cli` (or just use `npx eas-cli`).
2. **Auth:** `eas login` (interactive) — *or* set `EXPO_TOKEN=<token>` for non-interactive/CI (token from expo.dev → **Account Settings → Access Tokens**; revoke when done).
3. **Link the EXISTING repo to the EAS project** — ⚠️ do **NOT** run `npx create-expo-app` (that scaffolds a *blank* app in a subfolder; Expo's generic onboarding suggests it but it's wrong for an existing project):
   ```bash
   eas init --id <eas-project-id>     # writes extra.eas.projectId + owner into app.json
   ```
4. `eas.json` build profiles live in the repo: `development` / `preview` / `production`. Each binds to an EAS env via `"environment": "<name>"` so it picks up that environment's variables.

## ⚠️ The `.npmrc` gotcha (build dies at install in ~20s)
Parallax requires `--legacy-peer-deps` (the reanimated/worklets peer range). EAS's default `npm install` doesn't use it, so the build **errors during the install phase in ~20 seconds** with no obvious reason. Fix = a tracked `.npmrc` at repo root:
```
legacy-peer-deps=true
```
(Already committed. **If a future build fails fast at "Install dependencies", this is the first thing to check.**)

## Env vars → EAS, never the repo
Prod Supabase URL + publishable key are EAS environment variables (not committed):
```bash
eas env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<ref>.supabase.co" --visibility plaintext
eas env:create --environment preview    --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "sb_publishable_…"               --visibility sensitive
# repeat with --environment production
```
Inspect: `eas env:list preview` (or `production`).

## Android — builds with NO Apple account
```bash
eas build --platform android --profile preview --non-interactive --no-wait
```
- EAS **auto-generates the Android keystore** in the cloud on the first build (nothing to upload).
- `preview` profile → internal-distribution **`.apk`** you can install directly. Watch/download at the printed `expo.dev/.../builds/<id>` URL.

## iOS — needs an Apple Developer account
### Account: Individual vs Organization — a real ownership decision
- **Personal app → enroll Individual** (Apple Developer iPhone app or developer.apple.com). ~**US$99/yr**, shown in local currency (e.g. **~S$145** in Singapore — same standard program, not a premium tier).
- **Do NOT ship a personal app under an employer's org.** If your Apple ID is already a member of a company's Apple Developer team, the App Store **seller name, app ownership, revenue payouts, and IP** all attach to whichever team you ship under. Keep personal apps on your **own Individual team**.
- One Apple ID can belong to **multiple teams** → **always pick the right team** in EAS prompts *and* in the App Store Connect team switcher (top-right) — or it silently ships under the wrong entity.

### Hands-off iOS builds via App Store Connect API key
1. App Store Connect (team switcher set to the RIGHT team) → **Users and Access → Integrations → App Store Connect API** → create a key (**Admin** or **App Manager**) → download the **`.p8`** (one time only) + copy **Key ID** + **Issuer ID**. Store in 1Password.
2. Hand EAS the API key (so no Apple password/2FA prompts), then:
   ```bash
   eas build  --platform ios --profile production
   eas submit --platform ios --profile production    # uploads to App Store Connect → TestFlight
   ```
3. Create the **app record** in App Store Connect (bundle `com.yashgadodia.parallax`) + enable **TestFlight** for the beta.

## Apple Developer portal — identifiers, push key & auth providers (one-time per app)

Do this **before** the first iOS build (the App ID gates the build; Sign in with Apple + push gate features). All at developer.apple.com → **Certificates, Identifiers & Profiles**, with the **right team** selected (top-right). Capture every ID into 1Password / `.secrets/` (gitignored) — never the repo.

### 1. App ID (Identifier) — the foundation
- **Identifiers → ➕ → App IDs → App.** Bundle ID = your `bundleIdentifier` from `app.json` (e.g. `com.yashgadodia.parallax`), **explicit**.
- In **Capabilities**, check **☑ Push Notifications** and **☑ Sign in with Apple** (leave it "Enable as a primary App ID") → **Save**.
- ⚠️ **App IDs ≠ Services IDs.** A *Services ID* is for the **web** OAuth redirect flow only. A native RN/Expo app uses the **native** flow → you need an **App ID**, not a Services ID. **Identifiers are globally unique across types** — registering the bundle string as a Services ID *blocks* creating the App ID. Delete the stray Services ID first.

### 2. APNs push key (`.p8`) — token-based, replaces legacy SSL certs
- **Keys → ➕** → name it, check **only ☑ Apple Push Notifications service (APNs)** → **Configure**.
- ⚠️ **Environment = Sandbox & Production** (or leave unscoped). **TestFlight *and* the App Store use the *Production* APNs environment** — a **Sandbox-only key silently fails for testers and real users** (works only in dev/debug builds). #1 push gotcha.
- Download the **`.p8` (one-time only)** + note the **Key ID** and your **Team ID**.
- If the App-ID "Configure Push" dialog offers **"APNs SSL Certificates"** (Development/Production) → **ignore it, click Done.** Those are the *legacy* cert method; the token `.p8` replaces them.
- Hand the key to EAS once: `eas credentials` → iOS → **Push Notifications Key** → upload the `.p8` + Key ID + Team ID. (Needed for *remote* push on device — **not** required just to reach TestFlight.)

### 3. App Store Connect API key — unblocks headless build + submit
- App Store Connect → **Users and Access → Integrations → App Store Connect API → Keys → ➕** → role **Admin** → Generate.
- Download the **`.p8`** + note **Key ID** + **Issuer ID** (Issuer ID is atop that page, one per account).
- Master key for CI: lets EAS **non-interactively generate the Distribution Certificate + provisioning profile** *and* `eas submit` to TestFlight — no Apple password/2FA. Without it, a token-only (`EXPO_TOKEN`) build can't create iOS credentials and fails.

### 4. App Store Connect app record
- App Store Connect → **Apps → ➕ New App** → Platform **iOS**, pick the **Bundle ID**, choose a unique **Name** (≤30 chars; "Parallax" alone may be taken — use `Parallax: Couples`), **SKU** = any private unique string (e.g. `parallax` — not user-visible), **User Access = Full Access** → **Create**. (Or let `eas submit` auto-create it.)

### 5. Supabase auth providers — wire via the Management API (surgical), not `config push`
Hosted-project auth providers are set in the dashboard **or** the Management API. Prefer the API — it touches only the fields you name. ⚠️ **Do NOT `supabase config push`** to set one provider: it pushes your whole local `config.toml` `[auth]` block (localhost site_url, redirects, JWT-off) and **clobbers prod**.

**Sign in with Apple — native flow needs NO secret** (`signInWithIdToken` validates the ID-token `aud` against the client ID = your bundle ID):
```bash
TOKEN=<sbp_… personal access token>   # supabase.com/dashboard/account/tokens
REF=<prod project ref>                 # curl GET /v1/projects to find it
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  https://api.supabase.com/v1/projects/$REF/config/auth \
  -d '{"external_apple_enabled": true, "external_apple_client_id": "com.yashgadodia.parallax"}'
# verify: curl GET …/config/auth | grep apple   → enabled:true, secret:null
```
- `external_apple_secret` stays **null** for native. (Services-ID + secret-JWT is only the *web* OAuth flow.)
- Set `app.json` → `ios.usesAppleSignIn: true` so the entitlement ships in the build.
- **Google** needs a real OAuth **client ID + secret** from a GCP **Web** client (redirect `https://<ref>.supabase.co/auth/v1/callback`) → same PATCH with `external_google_enabled/_client_id/_secret`.

## OTA updates (optional, recommended)
Ship JS-only fixes to installed apps **without** a rebuild/resubmit:
```bash
npx expo install expo-updates
eas update:configure
eas update --branch production --message "fix X"
```
(Without `expo-updates`, a build profile's `channel` is inert — that's the harmless warning on the first build.)

## Build troubleshooting — diagnose LOCALLY, don't burn cloud builds
EAS builds are limited/metered — don't blindly re-kick. Before (re)building:
```bash
npx expo-doctor      # catches missing peer deps + SDK version mismatches that fail the native build
```
- A generic **`EAS_BUILD_UNKNOWN_GRADLE_ERROR`** (Android) usually traces to something `expo-doctor` flags. We hit a **missing `expo-constants`** peer dep (required by `expo-router`, "may crash outside Expo Go") — fixed with `npx expo install expo-constants`. Run doctor *first*, fix locally, then build once.
- Android can wait — prove iOS (the launch target) first; don't spend builds on Android until it matters.

## Verify before submitting
`npm run typecheck` (0) · `npx jest` (green) · `npx expo export -p ios` (bundles) · EAS build succeeds · `eas env:list production` shows the prod vars · **Privacy Policy + Terms URLs ready** (App Store requires them — see `docs/GO_LIVE.md`).
