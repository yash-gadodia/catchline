# Competitor review mining for Catchline roadmap

## Method and limits
- **Sample:** 1,126 unique App Store reviews, 21 apps, 8 storefronts (us, gb, au, ca, de, br, jp, sg), pulled 19 Nov 2026.
- **Feed is unreliable:** Apple's RSS returns empty pages at random and the CDN caches them. I retried each empty page up to 22 times with cache-key variants, so some small storefronts may still be under-counted.
- **OnForm US may be truncated:** it stopped at 298 on a partial page 6; I did not probe page 7.
- **Coding:** the 164 bar-path/VBT reviews were read and hand-coded. Coach-video apps (OnForm, CoachNow, CoachMyVideo, Dartfish, Yogger; n=903) were keyword-coded, so those counts are approximate.
- **Not obtained:**
  - Iron Path iOS (ids 955364910 and 982108354) returns 0 reviews in all 8 storefronts.
  - Iron Path Android: no bar-path listing found on Play.
  - Zero reviews came back for TrueRep VBT.
- **Google Play:** WL Analysis only, one page fetch. Histogram 807/85/40/28/143 (5 to 1 star), 4.23 average, 100K+ downloads, 3 visible reviews.
- **Web searches used:** 1 of 5.

## (a) Apps sampled

| App | n | Avg | 1/2/3/4/5 stars | Date range |
|---|---|---|---|---|
| OnForm | 390 | 3.69 | 88/31/21/22/228 | 2020-03 to 2026-10 |
| CoachNow | 244 | 4.10 | 34/14/13/15/168 | 2013-02 to 2026-11 |
| CoachMyVideo | 176 | 4.05 | 28/6/13/12/117 | 2012-02 to 2026-08 |
| Metric Lift (Metric VBT) | 52 | 3.77 | 7/6/6/6/27 | 2022-06 to 2026-09 |
| Yogger | 49 | 4.04 | 4/8/1/5/31 | 2023-05 to 2026-10 |
| myDartfish Express | 44 | 3.20 | 16/3/1/4/20 | 2015-10 to 2024-03 |
| WL Analysis | 32 | 3.72 | 5/1/6/6/14 | 2020-12 to 2026-08 |
| My Jump Lab | 31 | 3.71 | 7/3/0/3/18 | 2021-06 to 2026-11 |
| My Jump 2 | 28 | 3.18 | 8/5/1/2/12 | 2017-08 to 2026-08 |
| Vitruve | 14 | 2.21 | 6/1/6/0/1 | 2025-04 to 2026-07 |
| Qwik VBT | 14 | 4.64 | 1/0/0/1/12 | 2024-05 to 2026-09 |
| Speed4Lifts | 9 | 3.89 | 0/2/1/2/4 | 2021-05 to 2025-01 |
| Spleeft | 8 | 2.88 | 3/1/1/0/3 | 2023-12 to 2026-09 |
| My Lift | 7 | 3.29 | 3/0/0/0/4 | 2016-12 to 2024-09 |
| Coach's Eye (Gym Art) | 7 | 2.86 | 1/3/1/0/2 | 2026-07 to 2026-11 |
| FLEX Stronger | 7 | 4.00 | 1/0/1/1/4 | 2019-12 to 2024-10 |
| RepSpeed | 6 | 4.33 | 1/0/0/0/5 | 2021-10 to 2025-09 |
| Arcus VBT | 4 | 4.75 | 0/0/0/1/3 | 2026-09 to 2026-11 |
| Bar Path (Insilico) | 2 | 3.00 | 1/0/0/0/1 | 2023-09 to 2026-01 |
| VBTgo | 1 | 1.00 | 1/0/0/0/0 | 2026-09 |
| BarSense | 1 | 5.00 | 0/0/0/0/1 | 2010-11 |

Written reviews skew lower than store averages. The direct competitors have tiny review bases (WL Analysis has 46 US ratings in total).

## (b) Top 10 complaints, mostly 1-2 star

Counts are lift/VBT (hand-coded, of 164) plus coach apps (keyword, 1-2 star only).

| # | Complaint | Lift | Coach | Quotes | Catchline |
|---|---|---|---|---|---|
| 1 | Crashes, broken after iOS or app update, stuck processing | ~41 | ~46 | "App keeps crashing on iOS 18" (FLEX, ca); "Whenever I try to upload a video, the app just crashes" (WL Analysis, ca) | Not a feature; a reliability bar to hold. Largest single theme in lift apps |
| 2 | Paywall and price | ~12 | ~58 | "Was great until they wanted $30 a month." (OnForm, us); "Can’t track ur trends workout to workout without paying" (Metric, ca) | Strong: $2.99/mo or $19.99/yr against $30 to $70/mo. Risk: 1 video a week may trigger the same "little bit for free" anger |
| 3 | Subscription instead of one-time | ~3 | ~34 | "Monthly Price is insane" (Coach's Eye, de); "Another thing ruined by subscriptions.." (Yogger, us) | Partial: cheap, but still subscription only. No lifetime option |
| 4 | Forced account, login failures, upload or internet dependence | 5 | ~42 | "Can’t login without internet. Useless in the field" (Yogger, us); "Forced me to use Google or Microsoft to log in." (OnForm, us) | Yes: on-device, no upload |
| 5 | Confusing UI, no instructions | ~5 | ~41 | "Very confusing and not friendly." (OnForm, us); "the instructions doesn’t help" (My Lift, br) | Unknown; needs testing |
| 6 | Tracking fails, wrong object, missed reps | 16 (13 are Metric) | n/a | "the auto detection focused on the box behind me" (WL Analysis, us); "doesn’t recognize plates unless ur angle is perfect" (Metric, ca) | Yes, if the plate check lets the user correct a wrong detection |
| 7 | Setup time and finicky filming angle | 9 | n/a | "Wasted a bunch of gym time trying to get this to work" (WL Analysis, us); "a waste of set up time" (Metric, gb) | Partial: no per-frame tapping, but angle guidance is not in the description |
| 8 | Weight, tags or notes not saving; videos lost | 7 | some | "it does not allow you to save the video description" (WL Analysis, us) | Yes: notes, tags and categories exist. Persistence must be solid |
| 9 | Velocity numbers not trusted | 6, plus 5 on jump height | n/a | "velocity readings change depending on the angle" (Metric, ca); "Velocity tracking more erratic with velocities often 100x greater" (Metric, us) | Open risk: Catchline shows m/s per rep and will face the same doubt |
| 10 | Slow import or processing, battery, heat | 3 | ~17 | "Not only that, the importing takes forever!" (OnForm, us) | Likely yes (no upload); not measured here |

A recurring pattern across items 1, 2 and 5 is "an update ruined it": OnForm after taking over Hudl Technique, Vitruve's new app, and Metric moving free features behind Pro.

## (c) Top 10 things praised, 4-5 star

| # | Praise | Lift count | Quotes | Catchline |
|---|---|---|---|---|
| 1 | Seeing bar path fixes form | 14 | "Never knew my DL form was so trash with my bar path" (WL Analysis, gb) | Yes |
| 2 | Simple, easy to use | 13 (coach ~110) | "So easy to use, accurate and free!?" (Qwik, au) | Target |
| 3 | Velocity accurate against hardware | 12 | "Speeds seem very comparable to the Gymaware" (Metric, gb) | Feature yes; no validation claim |
| 4 | Replaces $400+ hardware | 11 | "Amazing to not have to pay thousands for a unit" (Metric, au) | Yes; good marketing line |
| 5 | Coaches engaging athletes | 9 (coach ~308) | "They move the bar with much more intent when they are being filmed" (WL Analysis, us) | No coach sharing |
| 6 | Free tier is generous, no ads | 7 | "Free features are enough for me. No ads." (WL Analysis, us) | Partial: 1 video a week is tighter than WL Analysis or Qwik |
| 7 | Automatic plate detection | 4, plus 1 on Play | "Automatically detects plates and can handle slightly angled shots" (WL Analysis, us) | Yes |
| 8 | Autoregulation, 1RM estimates, velocity trends | 5 | "Adjusting training load based on velocity has also been useful" (Metric, sg) | No |
| 9 | Side-by-side compare | 3 (coach ~35) | "Especially like the side by side view and bar speed features." (WL Analysis, us) | Yes |
| 10 | Export, CSV, drawing and frame tools | 4 (coach ~83) | "Easy to measure, export to csv" (Qwik, de); "The drawing tools are much better than any other sports analysis app." (OnForm, de) | Yes |

## (d) Top 10 explicit feature requests

| # | Request | Count | Evidence | Catchline |
|---|---|---|---|---|
| 1 | Real-time velocity with audio or velocity-loss alerts | 5 | Three Qwik jp reviews (Japanese, paraphrased); Speed4Lifts us wants voice rep-count feedback and the m/s stop threshold back | No live tracking |
| 2 | In-app trim and choosing trace start/stop | 3 | "it’s so frustrating you can’t crop videos from within the application" (WL Analysis, us) | Not in the description; cheap win |
| 3 | Custom exercises and pause variations | 3 | Speed4Lifts us and ca; Metric gb | Lift categories: partial |
| 4 | Per-rep mean velocity in multi-rep sets | 2 | "I want you to get the mean velocity of each rep." (WL Analysis, jp); also the Play review | Yes |
| 5 | Apple Watch or LiDAR for accuracy | 2 | "it would be nice if they could integrate the Apple Watch and LiDAR" (Metric, us); Arcus us | No |
| 6 | Pounds input | 2 | "the addition of lbs support at the weight input screen" (WL Analysis, us); FLEX us | Unknown; check |
| 7 | Full-quality or 60fps export, reliable sharing | 2 to 3 | "Cannot export in 60FPS or full quality video." (WL Analysis, au) | 9:16 export yes; quality unknown |
| 8 | Re-pick the plate when detection is wrong | 1 | "there’s no way to have it rescan or scan after the first image" (WL Analysis, us) | Yes, via the plate check |
| 9 | Trend history, per-rep graphs, larger-screen review | 3 | FLEX us; Speed4Lifts us; Metric ca | No training log or trends |
| 10 | More languages | 1 | "We need Chinese" (Qwik, us) | 9 languages; whether Chinese and Japanese are included is unconfirmed |

Single mentions: importing data from other sensors, diagnostics explaining why tracking failed, keeping music playing while recording, cross-device sync (My Jump 2, br), and coach sharing (Speed4Lifts user sends videos to a coach).

## (e) Roadmap read
- **Already answered:** no account or upload, automatic tracking with a correction step, per-rep speed, compare, notes and tags, CSV, and price.
- **Cheap gaps:** in-app trim and trace range, lb/kg input, full-quality export, and a plain "why tracking failed, film like this" message.
- **Trust gap:** velocity accuracy is both the top praise and a top doubt. A calibration explainer or validation note would address it.
- **Strategic gaps users ask for:** live velocity with audio, velocity-loss and trend history, a lifetime purchase option, and coach sharing.
- **Free-tier risk:** WL Analysis and Qwik are praised specifically for being usable free; 1 video a week is the likeliest source of 1-star reviews.
- **Android:** almost no demand shows in iOS reviews, as expected, but the Play listing for WL Analysis shows 100K+ downloads.

Files are in /private/tmp/claude-501/-Users-yash/67703cb5-c947-4909-86c5-ddd300e384f6/scratchpad/reviews/
- raw2/ (raw JSON)
- play/ (Play pages)
- scripts/analyse.py
- scripts/fetch2.py

Sources:
- [Iron Path on the App Store](https://apps.apple.com/us/app/iron-path/id955364910)
- [WL Analysis on Google Play](https://play.google.com/store/apps/details?id=com.karolsmolak.wlanalysis&hl=en&gl=us)
