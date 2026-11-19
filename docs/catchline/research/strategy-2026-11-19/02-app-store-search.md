# Catchline ASO assessment (measured 19 Nov 2026)

**Method.** 334 iTunes Search API calls (20 English terms × 14 storefronts, plus 6 local terms × 9 storefronts), with no rate-limiting or errors, so the full storefront list was kept. The Search API order approximates in-app search ranking and is not identical to it. "-" means not in the roughly 200 results returned.

## (a) Rank table: Catchline position

```
term                      us  gb  au  ca  sg  de  fr  es  mx  br  it  jp  kr  cn | US #1 (ratings)
bar path                   9   7   8  13   2  14  11  15  14  14  10  15  14  12 | WL Analysis (46)
bar path tracker           8   6   4  27   3   9   9  13   9  11  12  10  11  11 | WL Analysis (46)
barbell tracker           88  57  54   -   8   - 131   -   -   -   -   4 191 123 | WL Analysis (46)
barbell path              11  14  10  77   4  22   7  16  14  16  10   7  22  12 | Barbell Path (4)
weightlifting              -   -   -   - 151   -   -   -   -   -   -   -   -   - | Weightlifting App (1,699)
olympic weightlifting      -   - 142   -  54   -   -   -   -   -   -   -   -   - | Peak Strength (1,496)
weightlifting analysis   126  93  80   -   -   -   -   -   -   -   -   -   -   - | WL Analysis (46)
snatch                    76   -   -   -  35   -  92   -   -   -   -   -  97  70 | Snapchat (6.1M)
clean and jerk            65  30  23  42   8  67  38  45  75  71  42  34  53  33 | Crazy Office (103,772)
vbt                       43  62  49  62  25  73  67   -  68  77  81  62  72  46 | Arcus VBT (9)
velocity based training    -   -   -   -   -   -   -   -   -   -   -   -   -   - | Metric Lift (45)
bar speed                 43  32  23   -   3  53  35  38  50  49  40  74  47  29 | BarSpeed (1)
lift analysis              -   -   -   -   -   -   -   -   -   -   -   -   -   - | SetSync (0)
form check                 -   -   -   -  47   -   -   -   -   -   -   -   -   - | TrainReady (0)
squat form                 -   -   -   -  15   -   -   -   -   -   -  88 177 114 | Squat Checker (1)
deadlift form             90  63  53 160   3  62  47  63  90  71  62  39  73  44 | Deadlift AI (3)
video analysis             -   -   -   -   -   -   -   -   -   -   -   -   -   - | VisualEyes (418)
slow motion video analysis, crossfit, powerlifting: "-" in all 14 | 21,382 / CrossFit 3,785 / Bar Is Loaded 603
```

**US top 5 for "bar path":** WL Analysis (46), BarPath: Lift Form Coach (0), Bar Path (5), FormVision (0), Qwik VBT (42). Metric (45), BarPath: Gym Workout Log (6) and Beyond Normal (0) also sit above Catchline.

**UK top 5 for "bar path":** WL Analysis (5), Bar Path (0), Metric (19), BarPath: Lift Form Coach (0), FormVision (1).

**Local-language terms (position / results returned):**

| Storefront | Ranks well | Weak or unranked |
|---|---|---|
| de | hantelweg 1/1 | gewichtheben 83/87 |
| fr | suivi trajectoire barre 1/1, trajectoire de barre 2/2 | haltérophilie 75/97 |
| es | rastreador de barra 1/17, trayectoria de la barra 3/3 | halterofilia 44/50 |
| mx | trayectoria de la barra 2/2, rastreador de barra 3/20 | halterofilia 32/45 |
| br | trajetória da barra 1/2 | levantamento de peso -/85 |
| it | traiettoria bilanciere 1/2 | sollevamento pesi 50/56 |
| jp | バーベル 軌道 1/3, バー軌道 2/16 | バーパス -, ウエイトリフティング - |
| kr | 바벨 궤적 1/4 | 역도 50/55, 바 패스 - |
| cn | 杠铃轨迹追踪 2/2 | 杠铃轨迹 20/31, 举重 -/168 |

The #1 local positions are on queries that return only 1 to 4 apps. That shows near-zero supply; demand for those queries was not measured.

## Competitor lookup (us / gb / sg)

The lookup API does not expose subtitles, so they were read from the US web product page. All apps are free unless a price is shown.

| App | Subtitle | Ratings us/gb/sg (US avg) | Released | Updated | Langs |
|---|---|---|---|---|---|
| **Catchline** | not read from web page | 0 / 0 / 3 (5.0 in sg) | 2026-07-14 | 2026-11-18 | 9 |
| WL Analysis | Bar path tracker | 46 / 5 / 0 (4.3) | 2020-12 | 2026-08 | 9 |
| Metric Lift Strength Training | Barbell velocity & workout log | 45 / 19 / 2 (4.0) | 2022-04 | 2026-11 | 11 |
| Qwik VBT: Velocity Bar Tracker | Barbell Speed for Lifting | 42 / 7 / 0 (4.8) | 2023-02 | 2026-10 | 1 |
| Bar Path ($4.99) | none | 5 / 0 / 0 (3.0) | 2018-07 | never | 1 |
| BarSense ($2.99) | none | 1 / 0 / 0 | 2010 | never | 1 |
| My Lift: Measure your strength ($17.99) | Load-velocity profiles | 24 / 10 / 0 (4.8) | 2016 | 2023-01 | 2 |
| Spleeft | VBT Barbell Tracker | 3 / 0 / 0 (1.0) | 2022-02 | 2026-10 | 2 |
| OnForm: Video Analysis App | Technique Coaching & Messaging | 8,732 / 1,435 / 25 (4.8) | 2020-03 | 2026-11 | 21 |
| FormVision: Bar Path & Speed | See your bar path. Fix it. | 0 / 1 / 0 | 2026-08 | 2026-11 | 2 |
| BarPath: Lift Form Coach | none | 0 / 0 / 0 | 2026-07 | never | 1 |
| Arcus VBT | Precise VBT & Jump Analysis | 9 / 0 / 0 (202 in cn) | 2026-06 | 2026-11 | 32 |
| Speed4Lifts | Velocity-Based Training | 70 / 11 / 0 | 2018 | 2025-04 | 4 |

- **Iron Path:** two unrelated apps exist (IronPath and Iron Path: Workout Tracker), both with 0 ratings and neither ranking for "bar path".
- **Title patterns:** competitors use "Brand: keyword phrase" and put VBT or velocity in the subtitle. Nobody pairs "weightlifting" with "bar path" in visible metadata except WL Analysis via its subtitle.

## Analysis

- **"bar path" is winnable in 90 days.** The US #1 has 46 ratings and the UK #1 has 5. Three zero-rating apps outrank Catchline in the US, so metadata and installs are deciding the order, not rating volume alone. Why they sit above Catchline could not be determined from public data.
- **The same incumbents hold the adjacent terms.** "bar path tracker", "barbell tracker", "barbell path", "weightlifting analysis", "vbt" and "velocity based training" all have top-5 apps at 45 ratings or fewer.
- **Weak long-tail terms.** The top 5 for "form check", "squat form", "deadlift form" and "lift analysis" have 0 to 3 ratings. "olympic weightlifting" has 0 to 135 ratings from position 2 down.
- **Missing words, not competition, explain most blanks.** Catchline is unranked for "velocity based training", "form check", "lift analysis", "olympic weightlifting" and "video analysis" because "based", "training", "check", "lift", "olympic", "video" and "analysis" are absent from its metadata.
- **Not winnable in 90 days.** "weightlifting" (top 5 around 100k+ ratings), "crossfit", "powerlifting" and "slow motion video analysis". "snatch" is polluted by Snapchat. "video analysis" has an 8.7k-rating incumbent, so it is a stretch.
- **Wasted characters today.** The subtitle repeats "bar" and "path" from the title. Apple says not to repeat words across name, subtitle and keywords. The keyword field uses 94 of 100 characters.
- **Demand.** US autocomplete suggests "bar path tracker", "bar path" and "catchline: bar path tracker", so the query exists. Search volume was not measured, as it needs Apple Ads popularity data.
- **Ratings needed.** To be competitive for "bar path", Catchline needs more than 46 US ratings and more than 19 UK ratings (Metric is the highest UK count among bar path apps). Ratings are counted per storefront, so the 3 Singapore ratings do not help in the US.

## Ranking factors (2025-26 sources)

- **Apple's stated factors:** text relevance (title, subtitle, keywords, primary category) and user behaviour (downloads, ratings and reviews). Apple publishes no weights. [Apple Search](https://developer.apple.com/app-store/search/)
- **Field weight:** vendors agree on title, then subtitle, then keyword field, with no numbers. [AppTweak](https://www.apptweak.com/en/aso-blog/app-store-ranking-factors), [Appfigures](https://appfigures.com/resources/keyword-teardowns/50-maps)
- **Ratings:** count and recency correlate with rank. AppTweak reports reduced visibility under 3.5 stars and better rankings above 4.0. The velocity weighting is vendor inference. Apple allows 3 rating prompts per 365 days. [Apple Ratings](https://developer.apple.com/app-store/ratings-and-reviews/)
- **Conversion and retention:** vendors assert these as signals without quantified evidence. Treat as unconfirmed.
- **Cross-localisation:** the US storefront supports en-US plus es-MX, fr, pt-BR, ko, zh-Hans, zh-Hant, ru, ar and vi. Most other storefronts add en-GB. Keyword indexing across these is industry observation, and phrases only combine within one locale. [Apple localisations](https://developer.apple.com/help/app-store-connect/reference/app-store-localizations/), [MobileAction](https://www.mobileaction.co/blog/app-store-cross-localization/)
- **Custom product pages:** since WWDC25 they can appear in organic search for keywords assigned from the keyword field. The cap is 70. No organic uplift data has been published. [MobileAction](https://www.mobileaction.co/blog/custom-product-pages-meet-organic-search/)
- **In-app events:** they show in search results. The event name (and probably the short description) is indexed, and the lift is short-lived per Phiture. [Phiture](https://phiture.com/asostack/in-app-events/)
- **Screenshot captions:** Appfigures claims they have been indexed since June 2025. Apple has not confirmed it and independent tests are weak. [Appfigures](https://appfigures.com/resources/guides/app-store-algorithm-update-2025)
- **Featuring:** App Store Connect → Featuring → Nominations. Apple asks for at least 2 to 3 weeks' notice, and up to 3 months for wider featuring. It judges UX, UI, innovation, uniqueness, accessibility, localisation and the product page. [Apple Featuring](https://developer.apple.com/app-store/getting-featured/)

## (b) Recommended metadata

**en-GB, plus a new en-US locale.** The supplied locale list has no en-US, so the US storefront is presumably served by the en-GB fallback; verify in App Store Connect.

- **Title:** `Catchline: Bar Path Tracker` (27 characters). Keep it; it is an exact match for the head term.
- **Subtitle:** `Weightlifting Video Analysis` (28). It removes the duplicated words and targets "weightlifting analysis" (US 126 today), "video analysis" and "weightlifting tracker" (an autocomplete suggestion).
- **Keywords (98):** `barbell,olympic,snatch,clean,jerk,squat,deadlift,velocity,based,training,vbt,speed,form,check,lift`
  - Adds the missing words for "velocity based training", "form check", "olympic weightlifting" and "lift analysis".
  - Drops "wod", "technique", "lifting" and the repeated "weightlifting".
  - Trade-off: "speed" moves from subtitle to keywords, so "bar speed" (US 43) may soften.
  - Whether "lift" also covers "lifting" is unverified.

**es-MX, as the second US keyword set.** Its title and subtitle stay Spanish because Mexico and Latin America see them.

- **Title:** `Catchline: Halterofilia` (23). Mexico currently ranks 32 of 45 for "halterofilia", and "rastreador de barra" competes with barcode and inventory apps.
- **Subtitle:** `Trayectoria y velocidad barra` (29).
- **Keywords (99):** `arrancada,envion,sentadilla,pesas,levantamiento,powerlifting,crossfit,wod,slow,motion,coach,gym,1rm`
  - Spanish lift names serve Latin America.
  - The English words add US vocabulary that did not fit in the main field. They will not combine with en-US words.

## (c) Localisation priorities

1. **US:** largest rating pools; Catchline is 9th for "bar path".
2. **China:** the strongest demand signal measured (Arcus 202, WL Analysis 169, Qwik 100, Metric 82 ratings). Put 举重, 杠铃 and 轨迹 in the title and subtitle; Catchline is 20/31 for 杠铃轨迹 and unranked for 举重.
3. **Japan:** Qwik has 65 ratings. Add バーパス, ウエイトリフティング, 重量挙げ and VBT.
4. **UK, Australia, Canada:** low thresholds (5, 3 and 10 ratings at #1). Canada is the weakest English market, and adding en-CA and fr-CA would give it its own sets.
5. **Germany, France, Italy, Spain, Brazil, Korea:** put the sport's head word (gewichtheben, haltérophilie, sollevamento pesi, halterofilia, levantamento de peso, 역도) in the title or subtitle. Catchline is in the bottom half or unranked on all of them.

## (d) Ratings plan

- **Target by day 90:** 60 US and 25 UK ratings at 4.7 or better, about 150 worldwide.
- **Prompt:** call the system review prompt after a successfully analysed lift (for example the third tracked lift, or a PR), never on launch.
- **Reviews:** reply to every review.
- **Seeding:** ask US and UK lifters, coaches and beta users directly, since storefront counts are separate.
- **Not measured:** Catchline's install volume and prompt-to-rating conversion. Check App Store Connect before committing to the date.

## (e) Five highest-leverage actions, in order

1. Ship the rating prompt and seed US and UK ratings. The gap is 0 against 46.
2. Rewrite the subtitle and keyword field as above, and add an en-US locale.
3. Rework zh-Hans and ja metadata around the head terms, and repurpose es-MX.
4. Put keyword captions on the first three screenshots, and create custom product pages linked to "vbt"/"velocity" and "squat"/"deadlift form".
5. Submit a Featuring Nomination 3 or more weeks before the next significant release, paired with an in-app event whose name carries a target keyword.

Raw data: `(private research folder) strategy-2026-11-19/aso/res.jsonl` (searches) and `lk_us.json`, `lk_gb.json`, `lk_sg.json` (lookups) in the same folder. The scratchpad is temporary.
