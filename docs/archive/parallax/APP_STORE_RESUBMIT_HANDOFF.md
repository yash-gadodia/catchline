# App Store Resubmit — Session Handoff (v1.0, rejection cf39f2d8)

> 🎉 **CLOSED: v1.0 (build 14) + all 3 IAPs APPROVED 14-07-2026** ("Ready for Distribution", 8:24 PM SGT). One last trap on 15-07: the Apps page said **"Removed from App Store"** — not a takedown, just App Availability never configured (approval and distribution are independent gates). Fixed via Pricing and Availability → Set Up Availability → All 175 countries; now "Processing to Available" worldwide. Distilled playbook: `docs/SUBMISSION.md` §D–§H.

> ✅ **REJECTION #2 RESOLVED 2026-07-13 — v1.0 (build 14) resubmitted, WAITING_FOR_REVIEW (API-verified). Reply posted in the thread before resubmitting.**
> 1. **Guideline 4 (Design/SIWA):** "Sign in with Apple is not displayed as an equivalent option… buttons should have a similar
>    design as the buttons for other login options." Root cause: our Apple button was a text-only black pill while Google's had
>    its "G" mark. Fix: added `ICONS.apple` to the SIWA button on `app/login.tsx` + `app/signup.tsx` (commit `fe0e1b5`).
> 2. **Guideline 2.1(b) (App Completeness/IAP):** "the free trial period offered in the subscriptions was not included in the
>    sandbox mode." Root cause: checkout/plus promise "7 days free" but neither sub had an ASC **introductory offer**. Fix:
>    created Free/1-Week/no-end-date intro offers on Annual (6786613926) + Monthly (6786613900) via the ASC dashboard
>    (all 175 territories; API-verified `FREE_TRIAL`/`ONE_WEEK` from 2026-07-13). NOTE: the ASC intro-offer duration `<select>`
>    ignores extension form fills — set `select.value` + dispatch `input`/`change` via page JS.
> 3. Build 14: `eas build -p ios --profile production --auto-submit` (auto-increments buildNumber). Reply to Apple **before**
>    clicking Resubmit — the thread locks after. Expo Go on a fresh sim crashes this SDK 56 app at the gesture-handler import
>    (env mismatch, pre-existing) — visual checks need `npx expo run:ios`.

> ✅ **RESOLVED 2026-07-11 — v1.0 (build 13) + Lifetime + Annual + Monthly all WAITING_FOR_REVIEW** (verified via ASC API).
> Root causes of the MISSING_METADATA blocker: (1) Annual was missing a price for ONE territory (SWZ/Eswatini) — found by
> diffing `availableTerritories` vs `prices?include=territory`; (2) ASC only re-evaluates subscription completeness when the
> subscription resource itself is written — a harmless `PATCH /v1/subscriptions/<id>` (reviewNote) flipped both subs to
> Ready to Submit instantly. Subs were then attached via the version page's "In-App Purchases and Subscriptions" selector,
> the stray empty draft was deleted, and "Update Review" → "Resubmit to App Review" resubmitted submission cf39f2d8.
> NOTE: the "Hard constraint" below is WRONG — `claude-in-chrome` DID drive the authenticated ASC session this time.
> Remaining (user): optional reply to Apple with paywall screen recording; age-rating social-media questions by Sept 7 2026.

> Original handoff below, kept for context.

## The rejection (submission `cf39f2d8-64e4-44d3-9515-799a9b58a29f`, July 8)
- **2.1(b)** — the annual & monthly IAP products were never *submitted for review* (only Lifetime was in the build-11 submission; the two subs weren't attached).
- **3.1.2(c)** — the subscription purchase flow lacked functional **Terms of Use (EULA) + Privacy Policy** links; metadata needed the EULA + privacy links too.

## Key IDs / tools
- App: **Parallax: Couples** · ASC App ID `6785406082` · bundle `com.yashgadodia.parallax` · team P6QG53Y747 (Individual, personal `mcbebu` / pirsquare.yash@gmail.com — **NOT** the Voltade org)
- Version 1.0: `d1aeb995-1e52-4e99-9b41-c818570bf5f2` → now **PREPARE_FOR_SUBMISSION**
- **Build 13**: `c165fb27-3d60-4361-b3da-eb945c601b55` · VALID · commit `b364774` (has the links) · **attached to v1.0** ✅
- Lifetime IAP (non-consumable): `parallax_plus_lifetime` id `6786614304` → **WAITING_FOR_REVIEW** (ready) ✅
- Annual sub: `parallax_plus_annual` id `6786613926` → **MISSING_METADATA** ❌ (the blocker)
- Monthly sub: `parallax_plus_monthly` id `6786613900` → **MISSING_METADATA** ❌ (the blocker)
- Subscription group: `Parallax Plus` id `22203481`
- **ASC API helper**: `scripts/asc.py {token|get|post|patch|delete} <path> [json]` — mints ES256 JWT from `.secrets/appstore/AuthKey_7DMZ2M2W46.p8`. This is the only channel that reaches ASC from a headless session.
- An **empty draft review submission** exists (created via the API key `7DMZ2M2W46`). It's the container; items get added via dashboard "Add for Review". Leave it or `DELETE /v1/reviewSubmissions/<id>`.

## ✅ DONE + verified
- **Code (3.1.2c in-app):** `LegalLinks` component (Terms + Privacy) added to `app/checkout.tsx` + `app/(sheets)/plus.tsx`. Files: `src/components/LegalLinks.tsx`(+test), `src/lib/links.ts`. Commit `1ac673a`. `tsc` 0 · `jest` 976/976 · `expo export` bundles.
  - **Why checkout.tsx is the surface:** RevenueCat has **no hosted paywall configured** ("No paywalls yet"), so `presentPaywall()` falls back to `app/checkout.tsx`. That fallback is what the reviewer saw — and it now has the links. No RC dashboard work needed.
- **Metadata (3.1.2c):** Terms/EULA link appended to the **App Description** (en-GB `appStoreVersionLocalizations`); Privacy URL already set in its field. Commit `b364774`.
- **Build 13** built (`eas build -p ios --profile production --auto-submit`), uploaded, VALID, attached to v1.0.
- **Legal docs live (200):** `https://yash-gadodia.github.io/parallax/legal/{privacy,terms}.html`
- **Paid Apps Agreement = ACTIVE**; bank + W-8BEN + SG tax all Active.
- **All 3 IAP review screenshots present** (Annual/Monthly `assetDeliveryState: COMPLETE`, Lifetime submitted).
- **Subs now priced in ~all territories** via API (Annual 174, Monthly 175) — see caveat below.
- Annual **Tax Category** set to "Dating" (via dashboard).

## ❌ THE ONE BLOCKER: the two subscriptions are `MISSING_METADATA`
Everything the API exposes on both subs is complete (name, 1yr/1mo duration, price $39.99/$4.99 across all territories, localization `PREPARE_FOR_SUBMISSION`, review screenshot COMPLETE, availability 175 territories, tax category, group + group localization). Agreement is Active. **Yet ASC holds them at MISSING_METADATA and does not expose the reason via the API.**

### Ruled out (with evidence — do NOT re-investigate these):
availability · localization · Paid Apps Agreement · review screenshot · **pricing completeness** (still MISSING_METADATA at 174–175/175 territories) · tax category (set on Annual, badge didn't clear).

### Current best hypothesis (unproven, dashboard test needed):
**ASC's completeness check may not recognize API-created subscription prices.** The subs have had an API-set price since creation (July 2) and have been MISSING_METADATA the whole time; the **dashboard UI shows "no price / Add Pricing"** even though API price records exist. → The price likely must be set through the **dashboard's own pricing flow**, not the API.

## Hard constraint (why this can't be finished headlessly)
- **Claude Code's `claude-in-chrome` MCP browser is a sandboxed context that is NOT logged into the user's Apple session** — navigating to App Store Connect returns `authResult=FAILED` every time (tested 4×). It cannot drive the ASC/RevenueCat dashboards, and entering the user's Apple credentials is off-limits.
- The **"Claude" sidebar inside the user's Chrome** (a different integration) *is* in the authenticated session and *can* click through — delegate dashboard steps to it or to the user.
- **The ASC API cannot attach IAPs/subscriptions to a review submission** (`inAppPurchaseV2`/`subscription` aren't valid `reviewSubmissionItems` relationships). "Add for Review" is **dashboard-only** and only appears once a product is **Ready to Submit** (not Missing Metadata).
- **ASC API write rate limits:** >~90 rapid POSTs → HTTP 429. Use a fresh token per call (`scripts/asc.py` does) + delays.

## ▶️ Remaining steps to submit (dashboard — user or sidebar Claude)
1. **Set subscription prices via the DASHBOARD** (not API): Annual **$39.99/yr**, Monthly **$4.99/mo** (these are the app's established prices from `src/content/pay.ts` — not a new decision). Subscription → Subscription Prices → Add/Set up pricing → base USD price → auto-generates territories → Save. **Watch for MISSING_METADATA → Ready to Submit.**
   - If it does NOT clear: the ~174/175 API-created prices may be conflicting — delete them (`DELETE /v1/subscriptionPrices/<id>` for each) for a clean slate, then set via dashboard.
   - If it STILL doesn't clear after a clean dashboard price: pricing is not it either — have the dashboard reveal the exact yellow/red "required" section and report it; then fix via API.
2. (Optional) Set Monthly **Tax Category = Dating** (required field; not the blocker).
3. Once **both subs = Ready to Submit** → on each sub page click **"Add for Review"** (adds to the Draft Submission; build 13 rides along automatically).
4. Open the **Draft Submission** → verify it contains **v1.0 (build 13) + Lifetime + Annual + Monthly** → **Submit for Review**. (Do NOT submit an incomplete draft.)
5. Reply to Apple's rejection (submission `cf39f2d8`) with a **screen recording** showing the Terms/Privacy links in the paywall.
6. If prompted: answer the **age-rating social-media** questions (App Information; Apple deadline Sept 7 2026).

## Secondary task requested but NOT done (do after submit)
- **Save this session's learnings** to the cross-project iOS playbook repo `~/.claude/skills/building-ios-apps/` (`LEARNINGS.md` one-liners + `PLAYBOOK.md` §7/§9). Standing rule + memory `push-ios-learnings-to-skill-repo`. New, non-obvious learnings worth capturing:
  1. Which paywall the reviewer sees: RevenueCat with **no** configured paywall → `presentPaywall()` falls back to the in-app checkout screen → **that** screen needs the 3.1.2(c) Terms/Privacy links.
  2. ASC API **cannot** attach IAPs/subscriptions to a review submission — dashboard-only.
  3. **API-created subscription prices may not satisfy ASC's completeness check** — a subscription can sit at MISSING_METADATA with every API field complete; suspect the dashboard price flow.
  4. `claude-in-chrome` MCP runs in a **sandboxed context isolated from the user's authenticated web sessions** (ASC/RevenueCat) — drive ASC via its REST API, not the dashboard.
- **Add a hook** to keep the `building-ios-apps` repo updated: a `SessionEnd` hook in `~/.claude/settings.json` that auto-commits + pushes that repo when it has uncommitted changes (guard against committing secrets; it's a public repo). Use the `update-config` skill.
