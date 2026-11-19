# Catchline: market sizing and monetisation benchmarks

34 of 35 searches/fetches used. Figures come from search summaries and page extracts, not full-text reads, unless noted.

## 1. Market size

| Segment | Figure | Source |
|---|---|---|
| USA Weightlifting | 20,522 members (2024 scorecard); 23,010 (2023); 23,828 (2022) | [USAW scorecard PDFs](https://assets.contentstack.io/v3/assets/blt9e58afd92a18a0fc/blt08986e4d6f9aa684/667ea939abc5133fb15d1240/Scorecard_Weightlifting_2023_1.pdf) |
| British Weight Lifting | About 4,600 competition participants, 105 competitions a year; total membership not found | [BWL 2024 AGM minutes](https://britishweightlifting.org/resources/2024-agm-minutes-24-october-191125152555.pdf) |
| CrossFit Open | 323,014 (2023); 343,496 (2024); 233,815 (2025, lowest since 2014); 2026 about 254,690 (estimate, unconfirmed) | [Morning Chalk Up](https://morningchalkup.com/2025/03/04/2025-crossfit-open-registrations-down-32-percent/), [TuffWraps](https://www.tuffwraps.com/blogs/news/crossfit-statistics) |
| CrossFit affiliates | 11,366 (Mar 2024) to 9,899 (Mar 2025), down 13% | same search; 2026 count not found |
| IWF | 193 member federations (IWF's own pages also say 195) | [iwf.sport](https://iwf.sport/weightlifting_/history/) |
| Powerlifting | 1,033,852 athletes with a recorded competition entry, all-time and global (secondary source, unconfirmed) | [FitnessVolt](https://fitnessvolt.com/powerlifting/state-of-powerlifting/) |
| US gym base | 77M members in 2024; 32.1% use dumbbells or free weights (secondary citation) | [HFA](https://www.healthandfitness.org/how-77-million-fitness-members-work-out-new-hfa-data-reveals-shifting-equipment-training-and-membership-trends/) |

Not found: USA Powerlifting and British Powerlifting totals, an SFIA barbell count, and any survey on filming lifts.

**Addressable base (iPhone lifters who film).** Every multiplier below is my assumption, not a sourced figure.

- **Core:** 9,899 affiliates × about 150 members ≈ 1.5M CrossFitters, plus about 0.25M registered weightlifters and 0.2M active powerlifters, less overlap ≈ 1.7M. At 40% filming and 45% on iPhone, that is about 300k.
- **Broad:** 77M × 32.1% ≈ 24.7M US free-weight users. If 10% train barbell lifts seriously (2.5M) and the global figure is 3× that (about 7M), then 10% filming and 45% iPhone gives about 315k.
- **Total:** roughly 0.3M to 0.6M people.

At the Health & Fitness median of 2.9% download-to-paid, 5,000 payers needs about 170k installs. That is 30 to 55% of the whole base, which backs the earlier conclusion that consumer-only at $2.99 will not reach $10k.

## 2. VBT market

**Buyers:** hardware is sold mainly to teams and colleges (Perch custom annual per-rack contracts, GymAware, Vitruve Hub up to $7,800 a year). Individuals buy the cheaper sensors and phone apps.

| Product | Price | Source |
|---|---|---|
| Vitruve encoder | $447, plus software from free to $95–$7,800 a year | [SimpliFaster](https://store.simplifaster.com/product/vitruve-vbt-encoder/) |
| Enode sensor | $329, plus licence $399–$1,599 | [SimpliFaster](https://store.simplifaster.com/product/vmaxpro/) |
| GymAware PowerTool | From $1,995 (third-party comparison) | [SimpliFaster](https://simplifaster.com/?p=39877) |
| Perch | Custom annual quote, no public price | [perch.fit](https://perch.fit/pricing) |
| Output V2 sensor | $999 (reseller listing, unreliable) | [Perform Better](https://sandbox.performbetter.com/Output-Sports-V2-Sensor) |
| RepOne | Not found | |
| Metric | Free basic; Ultra Solo $89.99/yr; Ultra Coach $199/yr for 5 athletes, $529/yr for 25 | [metric.coach](https://www.metric.coach/pricing) |
| Spleeft | PRO $2.99 and $22.99/yr; Coach $8.99/mo; Elite Coach $69.99/yr (US store) | [App Store](https://apps.apple.com/us/app/spleeft/id1606893985) |
| Qwik VBT | Free with in-app purchases; prices not found | [App Store](https://apps.apple.com/us/app/id1660094818) |
| MyLift / My Jump Lab | Price not found | |

**Accuracy evidence:**
- **Renner, Mitter and Baca, PLOS ONE 2024:** 20 powerlifters, Vicon as criterion. Phone apps "can be as valid as a linear transducer" for mean concentric velocity. Qwik VBT was best; MyLift and Metric fell short of RepOne except Metric on bench. [DOI 10.1371/journal.pone.0313919](https://doi.org/10.1371/journal.pone.0313919) (abstract only; PMC blocked the fetch).
- **Puppyn and Brughelli, Int J Sports Sci Coaching 2026:** systematic review of 18 studies and six apps. iLoad, Metric, My Jump Lab and WL Analysis had acceptable validity; only Metric and My Jump Lab had acceptable reliability. All were below research-grade devices. Verdict: fine for recreational and field use. [Abstract](https://openrepository.aut.ac.nz/items/c6d7478c-2152-4f7e-a7d4-abb112e5287e)
- **Silva et al., Sensors 2021:** apps valid, but with systematic bias at heavier loads. [MDPI](https://www.mdpi.com/1424-8220/21/8/2623)

Catchline has no published validation, so any m/s accuracy claim is unsupported for now.

## 3. Subscription benchmarks

**RevenueCat, State of Subscription Apps 2026, Health & Fitness** ([report](https://www.revenuecat.com/state-of-subscription-apps-2026/)):

| Metric | Median | Top quartile |
|---|---|---|
| Download-to-trial (D30) | 6.9% | top performers over 23% |
| Trial-to-paid | 37.7% | above 51.4% |
| Download-to-paid (D35) | 2.9% | above 6.2% |
| Realised LTV per payer, year 1 | $35.64 | not given |

- Median prices: $4.99 weekly, $9.99 monthly, $39.94 yearly.
- 82.1% of trial starts happen on Day 0.
- Across all categories, hard paywalls convert 10.7% download-to-paid against 2.1% for freemium (freemium top quartile above 4.5%).
- Plan mix is contradictory on the page (68% annual in one section, 68% monthly in another). Lifetime share is lowest in this category; no figure given.

**Adapty, State of In-App Subscriptions 2026** ([report](https://adapty.io/state-of-in-app-subscriptions-2026)):
- Install-to-trial 10.9% and trial-to-paid 25.6% globally; Health & Fitness trial-to-paid 35.0%.
- Annual plans are 60.6% of Health & Fitness revenue.
- Medians: $12.99 a month, $38.42 a year.
- One-time purchases are 10.32% of revenue; the top 10% of apps take 94.5%.

Superwall: nothing found.

**Catchline against this:** trial starts sit at about the category median; trial-to-paid is about half the median on a very small sample. The $2.99 price is 30% of the category median monthly price. (Our own counts are kept out of this public repo.)

## 4. Pricing teardown

| App | Consumer | Coach / team | Model |
|---|---|---|---|
| [OnForm](https://www.onform.com/pricing) | Free; $9.99/mo; $14.99/mo | $19.99, $39.99, $59.99 per month, per coach | Athletes get Standard free under a Standard or Pro coach |
| [CoachNow](https://coachnow.com/pricing) | Analyze $9.99/mo or $59/yr | PRO $49.99/mo; Academy $89.99/mo | Limits on Spaces and Groups, not seats |
| [Metric](https://www.metric.coach/pricing) | $89.99/yr | $199/yr (5 athletes) to $529/yr (25) | Athlete seats; one coach seat per 10 athletes |
| Spleeft | $2.99; $22.99/yr | $8.99/mo; $69.99–$119.99/yr | Tiered coach plans |
| [SwingVision](https://apps.apple.com/us/app/id989461317) | Plus $14.99/mo or $95.99/yr; Pro $24.99 or $179.99; Max $39.99 or $299.99 | 100+ college teams | 4.7 stars, 5K ratings |
| V1 Golf | $9.99/mo; $59.99–$69.99/yr (undated) | V1 Coach, price not found | |
| myDartfish Express | $79.99/yr; Plus $149.99/yr (third-party) | not found | |
| [WL Analysis](https://apps.apple.com/us/app/wl-analysis/id1541855037) | One-time $8.99 unlock | None | 4.3 stars, 46 US iOS ratings |
| Coach's Eye | Retired by TechSmith in 2022 (sources say March or September) | | |
| Hudl Technique | Status unconfirmed | | |

**SwingVision:** founded 2019; $6M Series A in October 2023; total raised about $10M (Dealroom, CB Insights). The company claimed 15,000 subscribers in 2023 and "$4m+ ARR, 20k+ paying subscribers" on its 2025 Wefunder listing (from the search snippet; the page returned 403). It won a 2023 Apple Design Award. Sources: [PRWeb](https://www.prweb.com/releases/swingvision-scores-6-million-series-a-to-bring-ai-to-athletes-301960272.html), [Wefunder](https://wefunder.com/swingvision-cf-2025). That implies roughly $200 per subscriber per year in a 23.6M-player US sport.

## 5. What coaches pay for

- **$20 tier:** capped video library, drawing tools, messaging, about 20 voice-overs a month (OnForm Basic).
- **$40–$50 tier:** unlimited athletes and videos, shared collections, bulk invites, staff management, skeleton tracking, templates, read receipts, post scheduling (OnForm Standard, CoachNow PRO).
- **$60–$90 tier:** multi-camera, admin portal, scheduling, invoicing.
- **VBT-specific:** Metric bundles athlete Pro into coach seats, with a dashboard, programme sharing, leaderboards and remote coaching, at about $1.80 to $3.30 per athlete per month.

## 6. Free-tier limits and paywall timing

- No controlled experiment on usage caps such as "1 video a week" was found (RevenueCat, Adapty, Superwall and vendor blogs searched).
- The 10.7% against 2.1% gap is observational, and hard paywalls carry higher refunds (5.8% against 3.4%, [Airbridge](https://www.airbridge.io/en/blog/hard-paywall-vs-freemium-2026)).
- Adapty reports hard paywalls give 21% higher LTV per subscriber, while onboarding paywalls without trials convert well but have the lowest long-term value.
- Anecdotes cut both ways: one app lost 40% of conversions moving its paywall upfront; another made 5× with a dismissible upfront paywall.
- The firm finding is that 82 to 89% of trials start on Day 0, so the offer must be seen in the first session.

## 7. Routes to "#1"

- No source gave install volumes or timelines for winning a niche keyword; Appfigures calls it "somewhat of an art".
- Apple names text relevance, downloads, and rating count and quality as ranking inputs; the app name carries most weight, then the subtitle ([AppFollow](https://appfollow.io/blog/apple-aso)).
- A measurable definition: rank 1 in the US for "bar path" and "bar path tracker", plus more ratings than the incumbent.
- WL Analysis has only 46 US iOS ratings. AppWisp estimates 5,000+ iOS installs and its Android listing has 990 reviews, so the 166K figure is probably Android-heavy (my inference). On iOS the ratings lead is within reach in months.
- Metric and Qwik rating counts were not checked.

## Recommendation

1. **Price:** raise Pro to $4.99 a month and $29.99 a year. That is still below the category medians ($9.99 and about $39) and every comparable except Spleeft. At $29.99, lifetime equals one year of the new annual plan, so end it at 100 seats or move it to $79.99 or more.
2. **Free tier:** keep freemium, since ratings and installs matter more than early revenue. Show a dismissible trial paywall straight after the first analysed video. A/B test the weekly cap against gating features (speed, angles, history, export); no evidence says which wins.
3. **Coach tier:** launch it, priced like Metric rather than OnForm. Suggested: $19.99 a month or $199 a year for 10 athletes, and $39.99 a month or $399 a year for 30, with athlete Pro included. Start with roster, shared library, drawing and voice-over comments, and side-by-side comparison. It needs cloud sync, which breaks the "all on-device" promise, so make sharing opt-in.
4. **Credibility:** commission or invite a validation study before marketing m/s accuracy. Qwik and Metric already cite theirs.
