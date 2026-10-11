# Replacing Parallax with Catchline in the stores

Decision (SYNTHESIS, 11-10-2026): keep the Parallax App Store record (app `6785406082`, bundle `com.yashgadodia.parallax`), rename it to Catchline and release it as version 3.0. Parallax lifetime buyers get Catchline Founding. Parallax users are told before the switch, and their data is deleted.

The scripts are in `scripts/catchline-store/`. Each one is a dry run unless you pass `--apply`, and each is safe to re-run: it reads the current state first and only changes what is different. Keys are read from `.secrets/` when the script runs and are never printed.

| Script | What it does |
|---|---|
| `render_screenshots.sh` | Renders the six 6.9" screenshots (1320x2868) from design 09 into `~/dev/liftcheck-research/launch/screenshots/ios-6.9/` |
| `asc_replace.py` | App Store Connect: version 3.0, listing copy, review notes, subscription group, 8 subscriptions, founding lifetime, screenshots |
| `revenuecat_replace.py` | RevenueCat: app names, entitlements, products, offerings, Founding grant for Parallax lifetime buyers |

## Order to run

### 0. Parallax users: notice first (at least 14 days before step 7)

Decide the date the Parallax data will be deleted. Then send the notice by email to every `auth.users` row in the Parallax Supabase project, and as a push notification where push tokens exist. The notice should say:

- Parallax is closing on <date>. The app updates to Catchline, a different product.
- Before that date, you can export your data from Profile > Export my data.
- On <date>, all Parallax data (accounts, vents, syntheses, pulses, memory) is deleted.
- If you bought Parallax lifetime, you get Catchline Founding (Pull for life) free. Tap Restore Purchases in Catchline.
- If you have a Parallax subscription, cancel it in App Store settings. Catchline does not honour it. Decide whether to give these users a refund or Hook for the rest of their term; the numbers come from the `revenuecat_replace` dry run.

Update the hosted privacy policy and terms pages to say the same thing.

### 1. Accept the agreement (Yash, Account Holder)

In App Store Connect > Business, accept the pending agreement and check that the Paid Apps agreement is **Active** (banking and tax done). Until then, every API call returns `403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. `asc_replace.py` stops cleanly with exit code 2 when it gets that error. Apple will not let auto-renewable subscriptions leave MISSING_METADATA without an active Paid Apps agreement.

### 2. RevenueCat secret key (Yash)

In RevenueCat, open the Parallax project and go to Project settings > API keys > New secret API key. Pick v2, with read/write on Project configuration and Customer information. Then:

```
mkdir -p .secrets/revenuecat
pbpaste > .secrets/revenuecat/secret_v2.txt
chmod 600 .secrets/revenuecat/secret_v2.txt
```

Add a line to `.secrets/KEYS.md` that names the file. Do not write the key itself there.

### 3. Screenshots

```
scripts/catchline-store/render_screenshots.sh
```

This writes `catchline-store-1.png` to `catchline-store-6.png`, each 1320x2868 RGB with no alpha. They are rendered from the design comps. Apple 2.3.3 expects the app in use, so re-render them with numbers from real analyses before you submit (see store-listing.md). For the IAP review screenshot, take one of the Catchline paywall from a TestFlight build.

### 4. App Store Connect, dry run

```
scripts/catchline-store/asc_replace.py --version 3.0
```

The dry run prints the current record: versions, app infos, every IAP and subscription group, including Parallax's. It also checks the length of every piece of copy and lists any `[PLACEHOLDERS]` still left. The copy is read from `~/dev/liftcheck-research/launch/store-listing.md`. Before `--apply`, resolve the `[confirm ...]` notes in the App Review notes section. `--apply` refuses to run while placeholders remain unless you pass `--allow-placeholders`.

`--version` has to match `"version"` in `app.json` exactly. Set `app.json` to `"version": "3.0"`, or pass `--version 3.0.0` and set `app.json` to `3.0.0`. `runtimeVersion` follows the app version, so this also keeps Catchline OTA updates off Parallax 2.2.0 builds.

### 5. App Store Connect, apply

```
CATCHLINE_DEMO_PASSWORD="$(cat .secrets/catchline-demo-password.txt)" \
scripts/catchline-store/asc_replace.py --apply --version 3.0 \
  --privacy-url https://catchline.io/privacy --terms-url https://catchline.io/terms \
  --support-url https://catchline.io/support --marketing-url https://catchline.io \
  --support-email <support email> --contact-first Yash --contact-last Gadodia --contact-phone <phone> \
  --demo-email <demo account> --iap-review-screenshot <paywall.png>
```

| Step (`--only`) | What it changes |
|---|---|
| `preflight` | Nothing. Reads the record, stops if the bundle id is not `com.yashgadodia.parallax`, and lists the Parallax IAPs |
| `version` | Creates iOS version 3.0 with manual release. If an editable version already exists, it renames that one to 3.0 |
| `appinfo` | en-US name `Catchline: Lift Form Check`, subtitle, privacy policy URL. These live on the editable app info that version 3.0 creates |
| `localization` | 3.0 en-US description (en-US spelling), keywords, promotional text, What's New, support and marketing URLs |
| `review` | Review notes: a 2.3.1 change-of-purpose paragraph followed by the store-listing notes (camera, AI estimate, subscriptions and lifetime IAP, account deletion). Also the contact details and the demo account. The password comes from the env var |
| `subscriptions` | Group `Catchline`, 8 auto-renewable subscriptions at levels Platform 1, Pull 2, Hook 3, en-US localizations, availability in every territory. The USA price comes from the price-point endpoint, and every other territory gets Apple's equalized price for that point. The 1-week free trial goes on the two `_trial7` products only |
| `iaps` | Non-consumable `catchline_founding_lifetime` at $49.99. The base territory is USA and Apple equalizes the rest |
| `screenshots` | Deletes the Parallax screenshots that were copied into 3.0 (every display type) and uploads the 6.9" set in file-name order. Skipped if the folder is missing |

The script never touches `parallax_plus_monthly`, `parallax_plus_annual` or `parallax_plus_lifetime`, and it never submits for review. It ends by printing the remaining manual steps:

- App Privacy labels
- Age rating
- Category
- Group level order
- Attaching the new IAPs to version 3.0
- Other locales

### 6. RevenueCat

```
scripts/catchline-store/revenuecat_replace.py                 # dry run, prints the grandfather count
scripts/catchline-store/revenuecat_replace.py --apply
```

| Step | What it changes |
|---|---|
| `apps` | Renames the RevenueCat apps to `Catchline (iOS)` and `Catchline (Android)`. The v2 API cannot rename a project, so rename the project in the dashboard |
| `entitlements` | Creates `hook`, `pull`, `platform` and `founding`. `Parallax Pro` is kept |
| `products` | Creates the 9 iOS products, plus the 9 Play products if a Play app exists, and attaches each one to entitlements as in PRODUCTS.md. It also attaches **`parallax_plus_lifetime` to `hook`, `pull` and `founding`**, so anyone whose Apple ID bought Parallax lifetime gets Founding on Restore Purchases, whatever account they sign in with |
| `offerings` | `default` is made Current and gets the Catchline packages, with Pull annual and Pull monthly first. If Parallax packages are still in `default`, they are listed and left alone. Also creates `ad_trial` with `$rc_annual` and `$rc_monthly` pointing at the trial products |
| `grandfather` | Scans every customer. Anyone holding `Parallax Pro` with no expiry (lifetime) gets a promotional `founding` grant that lasts until 2100-01-01; the v2 API needs an expiry date. The dry run prints counts only |

Run the `grandfather` step again after step 9. RevenueCat skips grants it has already made.

### 7. Build 3.0

On the `catchline` branch, once it is merged:

```
eas build -p ios --profile production
eas submit -p ios --profile production
```

`eas.json` already points submit at app `6785406082`. **Do not run `eas update --branch production` from Catchline code while `app.json` still says 2.2.0.** The runtime would match the live Parallax builds, and Parallax users would be pushed Catchline JS.

### 8. TestFlight

Install the build and check that:

- Sandbox purchases work for each plan.
- A sandbox account that owns `parallax_plus_lifetime` restores to Founding.
- The `ad_trial` offering shows the trial.
- Account deletion works.

When that passes, take the IAP review screenshot (step 3).

### 9. Submit (Yash, by hand)

In App Store Connect, open version 3.0:

1. Select the build.
2. Attach the 8 subscriptions and the founding lifetime under In-App Purchases and Subscriptions.
3. Check the App Privacy labels and the age rating.
4. Add for Review.

Leave release on manual. Then release it on the day after the deletion date from the notice in step 0.

## Parallax data deletion (after release)

On the date given in the notice:

1. Export a final encrypted backup of the Parallax Supabase project for your own records. Decide how long to keep it and write that in the privacy policy.
2. Delete the Parallax user data: auth users, couples, vents, syntheses, pulses and memory. Then delete or pause the project.
3. In RevenueCat, leave the Parallax customers in place. They hold the purchase history that the Founding grandfathering depends on.
4. Remove `parallax_plus_monthly` and `parallax_plus_annual` from sale in App Store Connect. Leave `parallax_plus_lifetime` existing (removing it from sale is fine, because restores still work). Never delete it.

## Rollback

| What went wrong | How to undo it |
|---|---|
| Copy or screenshots before submission | Re-run `asc_replace.py --apply` with fixed copy, or edit in ASC. Nothing is live until 3.0 is released |
| Version 3.0 itself | An editable version can be deleted in ASC (Remove version). The live 2.2.0 listing is untouched until 3.0 is released |
| New subscriptions or IAP | Before submission they can be deleted in ASC. After approval, product ids can never be reused or deleted, only removed from sale |
| RevenueCat entitlements, products, offerings | Archive or delete them in the dashboard or with the v2 `archive` / `DELETE` endpoints. Making `default` Current affects the live Parallax build only if Parallax reads its own packages from it. The script adds packages and never removes them, so Parallax keeps working |
| Founding grants | `POST /projects/{id}/customers/{customer}/actions/revoke_granted_entitlement` with `entitlement_id` for each customer |
| After 3.0 is released | No rollback to Parallax on this record. Ship a 3.0.x fix. Releasing manually in step 9 is what keeps this window under your control |
