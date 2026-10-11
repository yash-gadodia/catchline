# App Store Submission Playbook — pass review the first time

> ✅ **OUTCOME: v1.0 + all 3 IAPs APPROVED 14-07-2026** after 2 rejections (§F, §G) and one post-approval trap (§H). This doc is the distilled playbook so the next submission (1.0.1, Android, or the next app) one-shots it. Cross-app version lives in `~/.claude/skills/building-ios-apps`.

The code side is built (see GO_LIVE). This is the checklist + the App-Store-Connect-side work that gets Parallax through review on the **first** try. Reviewers reject for predictable reasons — each is pre-addressed below.

## A. Hard requirements that must exist before you submit
| Item | Status | Owner |
|---|---|---|
| **App icon** (1024×1024 PNG, no alpha, no rounded corners) | ✅ DONE 2026-07-03 — `assets/icon.png` (para//ax slashes on dawn), wired in app.json + Android adaptive + splash. Dani may restyle anytime. | Done (Claude) |
| **Screenshots** (6.7" + 6.5" iPhone, a few per size) | ❌ blocked on this Mac (no Xcode/simulator — CLT only). Capture on the MacBook sim or from the TestFlight build. Same blocker for the 3 IAP review screenshots (IAPs sit at MISSING_METADATA until uploaded). | Yash/Dani |
| **Privacy Policy URL** (publicly reachable) | ✅ LIVE: https://yash-gadodia.github.io/parallax/legal/privacy.html (contact pirsquare.yash+parallax@gmail.com; lawyer review still recommended) | Done (Claude) |
| **Terms of Service URL** | ✅ LIVE: https://yash-gadodia.github.io/parallax/legal/terms.html | Done (Claude) |
| **Account deletion in-app** | ✅ built + deployed (`delete-account` edge fn) — reviewers test this | Done |
| **Demo/review account** | ✅ pre-paired on prod (Alex & Sam, 3 revealed drops @83%, streak 3) — creds in .secrets/KEYS.md | Done (Claude) |
| **Apple Developer account active** + **App Store Connect app record** | ⏳ enrollment activating; create the record under your **personal** team | You |
| **Working sign-up email** | ⛔ Supabase default email is rate-limited; set up **Resend** SMTP or reviewers can't register | You (GO_LIVE §3) |

## B. App Privacy "nutrition labels" (App Store Connect → App Privacy)
Fill these accurately — mismatches are a top rejection cause. Parallax collects:
- **Contact Info:** email address — *App Functionality, Linked to identity.*
- **User Content:** the daily answers/hunches, Love Map entries, Refocus messages — *App Functionality, Linked to identity.* (Sensitive — relationship data.)
- **Identifiers:** user ID — *App Functionality.*
- **Usage Data / Diagnostics:** analytics + crash (only if you enable PostHog) — *Analytics.*
- **Purchases:** subscription status (via RevenueCat) — *App Functionality.*
- **Not collected:** precise location, contacts, health, financial, browsing history.
- **Tracking:** Parallax does **not** track across other companies' apps → answer "No" to tracking (no ATT prompt needed) unless you add an ad/attribution SDK.

## C. Reviewer demo account (couples apps get rejected without one)
The reviewer must be able to see the *paired* experience, not just the "invite your partner" wall. In **App Review Information → Sign-In Required → Demo Account**, give a **pre-paired** account's email/password. Claude can seed a confirmed, already-paired couple (with some answered drops so the reveal is visible) directly in prod — ask when you're ready to submit, and add a note: *"This is a couples app; the demo account is pre-paired so you can see the full reveal/Refocus loop. Answer-ahead lets a solo user in too."*

## D. Common rejections — and how Parallax already answers them
- **5.1.1(v) Account deletion** → built (`delete-account` fully erases data + the Auth record).
- **Guideline 1.5 / 5.1 Privacy** → privacy policy required (host it) + accurate labels (§B).
- **4.0 / 2.1 "couldn't review / login"** → demo account (§C) + working email (Resend).
- **3.1.1 IAP** → Parallax Plus must use Apple IAP (RevenueCat handles this) — don't link to external payment.
- **AI content (Refocus)** → ToS disclaims it's not therapy/crisis support (`docs/TERMS.md` §3). Keep that.
- **Sign in with Apple parity (4.8)** → if you offer Google sign-in, you MUST also offer Sign in with Apple. `expo-apple-authentication` is already a plugin — wire both, or ship email-only first.
- **Sign in with Apple DESIGN parity (Guideline 4)** → presence isn't enough (that's 4.8): if the Google button carries its "G" mark, the Apple button needs the  logo at equal prominence. A text-only black pill next to a logo'd Google button = rejection #2 here. (`fe0e1b5`)
- **"7 days free" promised anywhere → ASC introductory offer must exist (2.1(b))** → reviewers test purchases in **sandbox**, where the trial comes only from a configured intro offer. Each subscription needs: Subscription Prices ➕ → Create Introductory Offer → all territories → start today, no end date → Free → 1 week. Verify `GET /v1/subscriptions/<id>/introductoryOffers` shows FREE_TRIAL/ONE_WEEK per territory.
- **IAPs ride the same submission as the binary (2.1(b))** → attach all products to the version before submitting; the FIRST auto-renewable subs can ONLY ship with an app version. "Add for Review" is dashboard-only and only appears at Ready to Submit.
- **The paywall the reviewer sees is the fallback** → with no RevenueCat hosted paywall configured, `presentPaywall()` falls back to `app/checkout.tsx` — so THAT screen carries the 3.1.2(c) Terms + Privacy links (`src/components/LegalLinks.tsx`).
- **Crashes / broken links** → app passes `tsc`/`jest`/`expo export`; verify the build runs before submitting.

## E. The submission sequence (once Apple is active)
1. App Store Connect → switch to your **personal team** → **+ New App** (bundle `com.yashgadodia.parallax`, your chosen unique **name** — check availability!).
2. Create an **App Store Connect API key** (Admin) → send to Claude → `eas build -p ios --profile production` then `eas submit -p ios`.
3. Fill: privacy URL, support URL, description, keywords, screenshots, **App Privacy** labels (§B), **demo account** (§C), age rating (17+ likely, mature/suggestive themes for a couples app).
4. Submit → TestFlight first (beta), then App Store review.

> Keep this in sync with `docs/GO_LIVE.md`. The two un-fakeable blockers for a first-pass approval are the **app icon** and a **hosted privacy policy** — line those up early.

## F. Review rejection 2026-07-08 (v1.0 build 11) — resolution log
Submission `cf39f2d8-64e4-44d3-9515-799a9b58a29f`. Two guidelines:

- **2.1(b) — IAP products not submitted for review.** The 3 IAP products (annual/monthly/lifetime) sit at MISSING_METADATA and were never attached to the version. **Dashboard-only, Yash:** in App Store Connect → the app version → **In-App Purchases**, add all three products, upload the required **App Review screenshot** per product (needs a Mac sim / TestFlight build — the §A blocker), then submit them *with* the next binary. IAPs must be in the same submission as the build.
- **3.1.2(c) — subscription info.** Two halves:
  - **In-app (DONE in code, this commit):** the purchase-flow screens (`app/checkout.tsx`, `app/(sheets)/plus.tsx`) already showed title/length/price; they were missing **functional Terms of Use (EULA) + Privacy Policy links**. Added `src/components/LegalLinks.tsx` (URLs in `src/lib/links.ts`) to both. Links point to the live GitHub Pages docs (verified 200). **Rebuild + resubmit binary** for this to count.
  - **Metadata (DONE via ASC API):** privacy-policy URL was already set in its dedicated field; the **Terms of Use (EULA)** link is now appended to the **App Description** (`appStoreVersionLocalizations` PATCH, en-GB). Both halves satisfied.
  - Reply to Apple with a **screen recording** showing the two links working in the paywall, and note it in App Review Information → Notes.

### Still blocking the resubmit (as of 2026-07-09)
1. **New binary (build 13)** — the LegalLinks code ships only in a fresh build; builds 11 & 12 predate it. Needs `eas build -p ios --profile production` → **requires EAS login** (interactive; `eas whoami` = not logged in). Only the account owner can start it.
2. **Subscriptions `parallax_plus_annual` + `parallax_plus_monthly` = MISSING_METADATA.** Confirmed present via API: name, `ONE_YEAR`/`ONE_MONTH` duration, USD base price, en-US localization, 175-territory availability, review screenshot. The public API doesn't expose the offending field — open each in ASC → the inline "Missing Metadata" badge names it (likely the localized display-name/description or a price-schedule gap). Lifetime IAP is already WAITING_FOR_REVIEW.
3. Then: attach build 13 + all 3 IAPs to the version → **submit for review** → reply to Apple with the screen recording.
   *(Resolved 11-07 — root causes: Annual was unpriced in ONE territory (Eswatini), found by diffing `availableTerritories` vs `prices?include=territory`; and ASC only re-evaluates completeness when the subscription resource is WRITTEN — a harmless `PATCH /v1/subscriptions/<id>` flipped both to Ready to Submit. Full log: `APP_STORE_RESUBMIT_HANDOFF.md`.)*

## G. Review rejection #2 2026-07-12 (v1.0 build 13) — resolution log
- **Guideline 4 (Design)** — SIWA button not "displayed as an equivalent option": text-only Apple pill vs Google's logo'd button. Fix: `ICONS.apple` on the SIWA button in `app/login.tsx` + `app/signup.tsx` (`fe0e1b5`). Lesson now in §D.
- **2.1(b)** — "free trial period … not included in the sandbox mode": checkout copy promised "7 days free" but neither sub had an ASC introductory offer. Fix: Free/1-week/no-end intro offers on Annual + Monthly, all 175 territories (13-07, API-verified). Lesson now in §D.
- Gotchas: ASC's Ember UI ignores extension form-fills on `<select>`s (set `select.value` + dispatch `input`/`change` via page JS); reply to Apple **before** clicking Resubmit — the thread locks after.
- Build 14 `eas build -p ios --profile production --auto-submit` → resubmitted 13-07 → **APPROVED 14-07-2026, 8:24 PM SGT** ("Ready for Distribution"), all 3 IAPs Approved with it.

## H. ⚠️ Post-approval trap: "Removed from App Store" ≠ removed
Approval and distribution are **independent gates**. After approval the Apps page showed **"Removed from App Store"** — which reads like an Apple takedown but only meant **App Availability was never configured** (zero territories). No rejection/removal email + version still "Ready for Distribution" = it's this, not enforcement.
**Fix (15-07-2026):** Pricing and Availability → App Availability → **Set Up Availability** → All Countries or Regions (175) → Confirm. Status flips back to "Ready for Distribution"; territories go "Processing to Available"; App Store propagation up to 24h. **Do this the moment the app record exists** so launch isn't gated on a hidden toggle.
