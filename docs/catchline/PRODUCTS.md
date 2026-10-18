# Catchline products, entitlements and offerings

What Yash creates in App Store Connect, Google Play Console and RevenueCat. Nothing here has been created yet; the app runs in demo mode until the RevenueCat keys are set. The ids below are hardcoded in `src/features/paywall/products.ts` and `entitlements.ts`. Change them there too if you change them here.

Prices are USD base prices. Let Apple and Google set the other territories, then override any you want.

## The plans

| Plan | Videos | Monthly | Annual | Entitlements it grants |
|---|---|---|---|---|
| Free | 3 for life (1 in the ad funnel) | - | - | none |
| Hook | 12 a month | $4.99 | $29.99 | `hook` |
| Pull (preselected) | Unlimited (1000 a month fair use) | $2.99 | $19.99 | `hook`, `pull` |
| Platform | 100 a month, fair use | $14.99 | $99.99 | `hook`, `pull`, `platform` |
| Founding member | Unlimited (Pull for life) | - | $29.99 once | `hook`, `pull`, `founding` |

What each tier unlocks (`featuresFor` in `entitlements.ts`):
- Free and Hook: cue, player, watermarked share. Hook adds 90-day cue memory.
- Pull and Founding: full cue memory, ghost of best rep, "did it stick", 240 fps, watermark-free export.
- Platform: everything in Pull, plus coach link, explainer from your own clip, CSV export and priority queue.

The monthly caps reset on the 1st of each calendar month. Usage is counted on the device for now (`usageStore.ts`). Phase 3 moves the count to the server.

## App Store Connect

**Subscription group:** `Catchline`. All 8 subscriptions go in this one group, so an upgrade replaces the old plan and is not stacked on top of it. Rank the group levels from highest to lowest: Platform, then Pull, then Hook.

| Product id | Type | Duration | Price | Level | Introductory offer |
|---|---|---|---|---|---|
| `catchline_hook_monthly` | Auto-renewable | 1 month | $4.99 | 3 | none |
| `catchline_hook_annual` | Auto-renewable | 1 year | $29.99 | 3 | none |
| `catchline_pull_monthly` | Auto-renewable | 1 month | $2.99 | 2 | none |
| `catchline_pull_annual` | Auto-renewable | 1 year | $19.99 | 2 | none |
| `catchline_pull_monthly_trial7` | Auto-renewable | 1 month | $2.99 | 2 | Free trial, 1 week |
| `catchline_pull_annual_trial7` | Auto-renewable | 1 year | $19.99 | 2 | Free trial, 1 week |
| `catchline_platform_monthly` | Auto-renewable | 1 month | $14.99 | 1 | none |
| `catchline_platform_annual` | Auto-renewable | 1 year | $99.99 | 1 | none |
| `catchline_founding_lifetime` | Non-consumable | - | $29.99 | - | - |

- Only the two `_trial7` products have a trial, so the organic paywall never shows one. Apple allows one introductory offer per subscription group per person, so a lifter who has already used a trial pays from day one.
- On iOS an upgrade takes effect straight away. Apple charges the full price of the new tier and refunds the unused part of the old one, so the upgrade sheet shows "$59.99 today, $X back for unused time" on iOS.
- Parallax's old products (`parallax_plus_monthly`, `parallax_plus_annual`, `parallax_plus_lifetime`) belong to the Parallax app record. If Catchline ships under that same record (`app.json` still says `com.yashgadodia.parallax`), take those three off sale. Approved products cannot be deleted.

## Google Play Console

| Product id | Type | Base plans | Price | Offers |
|---|---|---|---|---|
| `catchline_hook` | Subscription | `monthly` (P1M), `annual` (P1Y) | $4.99 / $29.99 | none |
| `catchline_pull` | Subscription | `monthly`, `annual`, `monthly-trial7`, `annual-trial7` | $9.99 / $59.99 (the trial base plans cost the same) | `trial7` on the two trial base plans only: 7-day free trial, new customers only |
| `catchline_platform` | Subscription | `monthly`, `annual` | $14.99 / $99.99 | none |
| `catchline_founding_lifetime` | One-time product | - | $49.99 | - |

- All base plans are auto-renewing.
- RevenueCat names Play products `subscriptionId:basePlanId`, for example `catchline_pull:annual`.
- Upgrades: the app sends `replacementMode: CHARGE_PRORATED_PRICE` with the old subscription id. Play charges the price difference for the days left and keeps the renewal date. That is the "$18.40 today, pro-rated" line in the design. Downgrades use `DEFERRED`.

## RevenueCat

**App user id:** the app identifies RevenueCat customers by the Supabase user id, and the `revenuecat-webhook` edge function writes `profiles.plan` from webhook events (setup in `BACKEND_SETUP.md` section 3).

**Project:** Catchline, with one iOS app and one Android app. Put the public SDK keys (`appl_...`, `goog_...`) in EAS secrets and local `.env`, never in git:
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

**Entitlements.** Use these ids exactly:

| Entitlement | Attached products |
|---|---|
| `hook` | every Hook, Pull and Platform product (including the trial ones), plus `catchline_founding_lifetime` |
| `pull` | every Pull and Platform product (including the trial ones), plus `catchline_founding_lifetime` |
| `platform` | `catchline_platform_monthly`, `catchline_platform_annual`, `catchline_platform:monthly`, `catchline_platform:annual` |
| `founding` | `catchline_founding_lifetime` (both stores) |

The app reads the highest active entitlement: `platform`, then `founding`, then `pull`, then `hook`, then free (`tierFromEntitlements`). A founding member who also subscribes to Platform gets Platform and keeps the founding badge.

**Offerings:**

`default` (mark it **Current**). Its packages use custom identifiers:

| Package id | iOS product | Play product |
|---|---|---|
| `hook_monthly` | `catchline_hook_monthly` | `catchline_hook:monthly` |
| `hook_annual` | `catchline_hook_annual` | `catchline_hook:annual` |
| `pull_monthly` | `catchline_pull_monthly` | `catchline_pull:monthly` |
| `pull_annual` | `catchline_pull_annual` | `catchline_pull:annual` |
| `platform_monthly` | `catchline_platform_monthly` | `catchline_platform:monthly` |
| `platform_annual` | `catchline_platform_annual` | `catchline_platform:annual` |
| `founding` | `catchline_founding_lifetime` | `catchline_founding_lifetime` |

`ad_trial` is not current. The ad funnel requests it by id:

| Package id | iOS product | Play product |
|---|---|---|
| `$rc_annual` | `catchline_pull_annual_trial7` | `catchline_pull:annual-trial7` |
| `$rc_monthly` | `catchline_pull_monthly_trial7` | `catchline_pull:monthly-trial7` |

- The app uses its own paywall screens, not a RevenueCat-hosted paywall. Leave Paywalls unconfigured.
- Customer Center is used for "Change plan" on the Plans screen. Turn it on with the defaults.
- Once all 500 founding seats are sold, remove the `founding` package from `default`. The app already hides the founding row when the counter reaches 0.

## Founding seat counter

RevenueCat has no seat counter. The app reads seats through `getFoundingSeats()` (`src/features/paywall/seats.ts`): with the backend on it calls the public `founding_seats()` RPC (`{taken, cap: 500}`, counting `profiles.founding`, which the RevenueCat webhook sets on a `catchline_founding_lifetime` purchase or a `founding` entitlement); in fixture mode it is a local stub (137 of 500). A refund does not give the seat back.

The stores cannot cap how many people buy, so two buyers racing for the last seat could both get through. Remove the package at a few seats left if that matters.

## Web checkout (ad funnel, behind a flag)

This is off by default. To turn it on, set `EXPO_PUBLIC_WEB_CHECKOUT=1` and `EXPO_PUBLIC_WEB_CHECKOUT_URL` (for example a RevenueCat Web Billing purchase link). The app opens `<url>?plan=pull_annual` or `<url>?plan=pull_monthly`. For a web purchase to unlock the app, it must use the same RevenueCat project, grant the same `pull` entitlement and use the same app user id. Research (12-gtm-paid.md) only clears this for US traffic.

## Not created by this change

No App Store Connect, Play Console or RevenueCat objects were created. Everything above is for Yash to set up by hand.
