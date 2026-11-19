# What would bring lifters back to Catchline weekly

**Research limits.** I used 12 search calls; one failed because Reddit blocks the crawler, so point 3 rests on coach blogs with no Reddit quotes. I did not reach the primary Adjust, AppsFlyer, Mixpanel or Amplitude reports (Adjust returned 429), and I read only the RevenueCat preview page. Anything marked *unconfirmed* is secondary or from memory.

## 1. Benchmarks
- **Health and fitness retention:** secondary sources conflict. Day 1 is 20-28%, day 7 is 7-18%, day 30 is 3-9% ([Phiture](https://phiture.com/mobilegrowthstack/managing-retention-rate-benchmarks-and-expectations/), [Engagelab](https://www.engagelab.com/blog/increase-app-retention), [Adjust](https://www.adjust.com/blog/what-makes-a-good-retention-rate/), which gives day 1 at 27%). *Unconfirmed against primary tables.*
- **Weekly active share and top quartile:** I found no verifiable figure for niche training tools. Blog claims of 15-28% DAU/MAU are unsourced.
- **Subscriptions ([RevenueCat 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)):** health and fitness trial-to-paid is 39.9% at the median and 68.3% for the top 10%. Year-one retention across categories is 44.1% on yearly plans and 17.0% on monthly.
- **Catchline in November:** 29 of 123 phones (24%) were active on two or more days, and 4 (3%) on five or more. The category's day-30 figure counts daily-use apps, so weeks with a tracked lift is the fairer measure for Catchline.

## 2. How comparable tools create a return habit

| Tool | Mechanism | Evidence | Fit for a few filmed lifts per session |
|---|---|---|---|
| Strava | Kudos, clubs, segments | A Radboud study found runners who got more kudos ran more (observational). Strava's own data says early social users were over twice as likely to stay ([Running Magazine](https://runningmagazine.ca/?p=91520)). | Weak without a feed. The gym chat and the coach are the lifter's kudos, so the story export already covers this. |
| Hevy, Strong | Log every set, PR badges | No retention data found. | Per-lift records fit. Catchline should not become a logger. |
| WHOOP, Oura | Daily score | No data found. | Poor: there is no daily signal. |
| SwingVision | Session stats and weekly goals ([App Store](https://apps.apple.com/us/app/swingvision-tennis-pickleball/id989461317)) | Feature claims only. | Good: a weekly goal of tracked lifts. |
| Metric VBT | Speed, power and estimated 1RM "on every set", with a live readout ([metric.coach](https://www.metric.coach/)) | Independent validation is mixed (see point 4). | Closest model, since it is used in the session itself. |
| OnForm, CoachNow | Coach voice-over and reply loop ([CoachNow](https://coachnow.io/blog/remote-coaching-engagement)) | Vendor claims only. | Strong: the coach creates the weekly pull, and coach codes already exist. |

## 3. What lifters do with video today
- **Review happens after the session.** Catalyst says "avoid the temptation to watch your videos between each set" and "save the analysis for after the session" ([Catalyst Athletics](https://catalystathletics.com/article/2254/Using-Video-in-Training-Most-Effectively)).
- **Coaches see only a few clips.** Catalyst advises to "only send a couple videos of your top set(s)". An elitefts coach asks for the worst and best set (search summary, not verified on the page).
- **Filming is rationed.** British Weightlifting suggests "limiting the number of lifts filmed in a session" to avoid "getting stuck in your head" ([BWL](https://britishweightlifting.org/article/good-or-bad-filming-your-lifts-in-training)).
- **A London weightlifting coach films little and sends by WhatsApp.** "Now my approach is to film only PB attempts"; "A lot of the time I just use WhatsApp"; and watching back in the moment "can be useful" ([StandFast](https://star-lanternfish.squarespace.com/articles/2021/2/27/when-to-film-your-lifts-and-when-to-put-your-effing-phone-away)).

The real weekly workflow is: film top sets and PB attempts, glance once, review after, and send two clips to a coach on WhatsApp. The step Catchline can own is that after-session review and coach send. Analysing every set is not the opening.

## 4. Turning one analysis into a tracked skill

| Feature | Value to the lifter | Data needed | Risk of misleading numbers |
|---|---|---|---|
| Trend per lift kind and weight band (peak speed, horizontal deviation) | Shows whether technique is improving | All held, but weight is optional, so it must be asked for | High: camera angle and distance change between sessions. |
| Record detection (fastest at a weight, heaviest with a clean path) | A reason to film the top set | Kind, weight, peak speed | High: needs a noise floor. |
| Consistency score across reps or sessions | Suits technique-focused lifters | Three or more lifts at the same kind and band | Medium: needs a minimum sample, shown as locked until then. |
| Compare to your best | One tap, uses the existing compare screen | Already held | Low. |
| Session summary and weekly digest | A reason to return with no new clip | Local data | Low. |
| Catch height, time to fixation | Specific to weightlifting | Joint positions; fixation is hard to detect | High: unvalidated. |
| Velocity-based load suggestions, estimated 1RM | High perceived value | Mean propulsive velocity across several loads | Very high: this is prescription. |

- **The numbers are not yet repeatable.** Catchline's backlog records one lift reading 2.50 m/s in the player and 2.65 m/s in the story, a 6% gap. The local note's sample record is a 0.06 m/s improvement, which is smaller than that disagreement.
- **Independent validation of camera apps is mixed.** A PeerJ study found Metric detected over 95% of reps but had "poor to moderate agreement" with Vicon on mean velocity ([PeerJ](https://peerj.com/articles/17789)).
- **What follows.** Fix the disagreement and measure repeat-lift variance before any record ships. Only call a record when the gain exceeds that variance, keep the "AI estimate" label, and leave load suggestions out.

## 5. Use between sets
- **Feedback helps performance.** A 2023 meta-analysis of 20 studies found feedback during resistance training improved performance and adaptation. Visual feedback (g = 1.11) beat verbal (g = 0.47) ([Weakley et al.](https://e-space.mmu.ac.uk/632028/8/s40279-023-01877-2.pdf)).
- **No retention evidence.** I found nothing linking live feedback to app retention. The motivation benefit is asserted in reviews and was not measured.
- **What it would take.** In-app capture, a result in about 10 seconds (the median first track is 60 s), rep auto-detection in a long clip, and a hands-free start. Competitors already claim live readouts and Apple Watch support ([Lift App](https://apps.apple.com/us/app/lift-app-ai-barbell-tracker/id6756862700), vendor claim).
- **Tension with coaches.** They advise against watching every set, so aim at one top set per lift.

## 6. Notifications and widgets
- **Guideline 4.5.4, verbatim from [Apple](https://developer.apple.com/app-store/review/guidelines/):** push "should not be used for promotions or direct marketing purposes unless customers have explicitly opted in… via consent language displayed in your app's UI", with an in-app opt-out.
- **Related rules.** 2.5.16 says widgets and notifications must relate to app content. 2.5.18 bans display advertising in widgets and notifications.
- **What this means for Catchline.** "Your free video is back" and a weekly digest are functional. "Upgrade to Pro" and referral pushes need the separate opt-in.
- **Provisional authorisation.** It delivers quietly to Notification Center with Keep and Turn Off buttons and no prompt. *This is from memory; the Apple documentation page did not load.* It suits a first digest sent before the full ask.
- **Cadence.** I found no public data for comparable apps. The local note's weekly, training-day pattern is the defensible choice: one on the lifter's first lifting day and one digest.

## 7. One free video a week and habit
- **The only direct test found.** A travel app compared 3 free actions with 30. The tight cap converted 26% against 22%, but four-week retention was 67% against 71%, and they kept the generous tier ([Fairytrail](https://fairytrail-web.pages.dev/blog/monetization-experiment-fairytrail-travel-buddy-app-for-nomads.html)). No sample size was given.
- **Paywall type.** Hard paywalls convert 12.11% of downloads against 2.18% for freemium, with higher refunds (5.8% against 3.4%) ([RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2025/)).
- **The specific problem.** Lifters train a lift two or three times a week, and trends need at least three data points. A free lifter needs three weeks to reach that, and most are gone by then.
- **An option to test (Yash's call).** Keep one full analysis a week, but record every extra lift as a number-only data point with no overlay or export. The habit then builds on free and the visuals stay paid. This is a hypothesis; measure conversion and four-week retention together.

## Ranked: 8 retention features

| # | Feature | Habit it creates | Metric it should move | Size |
|---|---|---|---|---|
| 1 | One agreed peak-speed number, plus a measured noise floor (prerequisite) | Trust in every number that follows | Player and story disagreement falls to zero | Small |
| 2 | Ask kind and weight on the result, then records per lift and weight band, with "compare to your best" | Film the top set to beat a number | Share of lifters with a second lift within 14 days | Medium |
| 3 | Training-day reminder and weekly digest (functional copy, provisional first) | Open on snatch day | Weeks with one or more tracked lifts; phones active on two or more days (24% now) | Small |
| 4 | Weeks-in-a-row count and weekly goal (in the local note) | One lift a week at minimum | Four-week retention | Small |
| 5 | Free number-only tracking beyond the weekly video (experiment) | Log every key lift | Lifts per active week; conversion as the guardrail | Medium |
| 6 | Coach send: one link with the overlay and numbers, and the coach's reply attached to the lift | Catchline replaces the WhatsApp clip | Lifts shared to a coach; coach-code retention | Large |
| 7 | In-app capture with rep auto-detection and a path within about 10 seconds | Use in the session, on the top set | Median time to result; lifts per session | Large |
| 8 | Trend and consistency per lift, locked until three lifts | Review progress after the session | Opens with no new clip | Medium |

Widgets and load suggestions are left out. Widgets need items 2 to 4 first, and load suggestions carry the highest risk of misleading numbers.

**Local files read (nothing edited):** `/Users/yash/dev/catchline-wt-referral/TASKS-referrals.md`, and `README.md` plus `09-library-progress-and-return.md` in `/Users/yash/dev/catchline-wt-referral/docs/catchline/research/mobbin-2026-11-17/`. Notes 03, 07 and 08 were only skimmed.
