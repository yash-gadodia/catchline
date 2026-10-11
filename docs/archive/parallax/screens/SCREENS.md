# Screen gallery — visual reference for agents & humans

Every screen of the app, captured on the iPhone 17 Pro simulator (iOS 26.2) against the
**local** stack at commit `016652d`-era code (2026-07-03). Seeded demo couple
**Test User & Dani** (`test@parallax.app` / `dani@parallax.app`, `parallax123`), history
backfilled with `./scripts/seed-history.sh`. No real user data.

Downscaled JPEGs (max 1300px). Regenerate by re-capturing on a sim — see "How captured"
at the bottom. **Do not** auto-commit new captures on every change; refresh this set
deliberately when the UI meaningfully evolves.

## Auth & onboarding

| File | Screen | Notes |
|---|---|---|
| `28-welcome.jpg` | Welcome | Signed-out landing: wordmark, tagline, Get started |
| `29-login.jpg` | Log in | Email/password + Apple/Google (dev build prefills test creds) |
| `30-signup.jpg` | Sign up | Create account |
| `31-resetpassword.jpg` | Reset password | Forgot-password flow |

## The daily loop

| File | Screen | Notes |
|---|---|---|
| `04-today.jpg` | Today (played) | **Round complete · you both played · 83%** + "See the reveal" CTA, streak 15 |
| `16-play.jpg` | Play | Prompt 1/3, answer-for-you phase |
| `12-dropdetail.jpg` | Drop detail | A past revealed drop (stored wave, per-prompt breakdown) |
| `01-today-catchup.jpg` | Today (lapsed) | The **catch-up card** ("Yesterday got away? Catch it up · scored at 80%") |
| `03-play-catchup.jpg` | Catch-up play | "Yesterday's drop · scored at 80%" header — the grace flow |

The reveal celebration screen is **not** in this set — `parallax://reveal` deep-linked
without play-flow context shows its honest error state; capture it manually by playing
a drop and tapping "See the reveal".

## Streak & engagement

| File | Screen | Notes |
|---|---|---|
| `05-streak.jpg` | Streak | 🔥 shared streak, this-week checkmarks, milestones, freezes |
| `02-streak-lapsed.jpg` | Streak (lapsed) | Same screen in the lapsed state (streak 0, "play today to keep it alive") |
| `08-activity.jpg` | Activity | Feed of played/milestone events |
| `25-milestone.jpg` | Milestone | Celebration for a streak milestone (`?days=7`) |
| `24-widgetsetup.jpg` | Widget setup | Home-screen widget onboarding |

## Us / history

| File | Screen | Notes |
|---|---|---|
| `07-us.jpg` | Us tab | Couple header, month wavelength chart, Love Map + Wrapped teasers |
| `09-lovemap.jpg` | Love Map | Learnings about each other |
| `10-onthisday.jpg` | On This Day | Memory resurfacing |
| `11-wrapped.jpg` | Wrapped | Honest <1-month empty state ("your first month is still writing itself") |
| `19-sheet-share.jpg` | Share sheet | The real captured 9:16 card (names, wave %, week dots, streak, watermark) |

## Refocus

| File | Screen | Notes |
|---|---|---|
| `06-refocus.jpg` | Refocus tab | Conflict-mediation entry |

## Content & monetization

| File | Screen | Notes |
|---|---|---|
| `13-packs.jpg` | Packs | Catalog (Deep end free; After dark / Chaos hour / Rewind locked) + Plus upsell |
| `14-packdetail.jpg` | Pack detail | Sample prompts + send |
| `15-practice.jpg` | Practice | Solo round against partner's past answers |
| `18-sheet-plus.jpg` | Plus sheet | Compact paywall ("One sub, both of you.") |
| `26-checkout.jpg` | Checkout | Full plan picker: Annual $39.99 / Monthly $4.99 / Lifetime $79.99 |
| `27-plussuccess.jpg` | Plus success | Post-purchase confirmation |
| `20-sheet-spice.jpg` | Spice sheet | Shared spice-level picker |

## Profile & settings

| File | Screen | Notes |
|---|---|---|
| `21-profile.jpg` | Profile | "You & settings" — names, pairing, preferences |
| `22-editprofile.jpg` | Edit profile | Name/avatar editing |
| `23-managesub.jpg` | Manage subscription | Plan state + restore purchases |

## `iap/` — App Store Connect review screenshots (full-res PNG)

Apple requires a screenshot of the purchase surface attached to **each** in-app
purchase before review. These are full-resolution (1206×2622, well above the 640×920
minimum). When creating the IAPs in App Store Connect, attach:

| File | Attach to |
|---|---|
| `iap/checkout-plans.png` | All three subscription products (Annual / Monthly / Lifetime) — shows the full plan picker with prices |
| `iap/plus-paywall-sheet.png` | Plus subscription products (alternate surface) |
| `iap/packs-upsell.png` | Any pack-related IAP / Plus upsell context |

Note: prices shown come from `src/content/pay.ts` (RevenueCat had no API key locally).
Once real StoreKit products exist, re-capture if App Review asks for exact price parity.

## How captured

Deep links (`xcrun simctl openurl booted "parallax://<route>"`) + `xcrun simctl io booted
screenshot`, driven from a healthy signed-in session. Gotchas for the next agent: bare
`simctl launch` can boot a **stale cached dev-client JS bundle** (launch via
`com.anonymous.parallax://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`
to force Metro); `(sheets)` routes stack over deep-linked screens and don't dismiss via
backdrop taps in automation — relaunch the app to reset navigation.
