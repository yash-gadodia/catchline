# Catchline accuracy validation: research report

Only a borrowed-transducer day with the data published (design A) is cheap enough to do now. It supports an "agreement with GymAware" claim, not "validated". All 15 searches and fetches are used, and several items below could not be confirmed.

## 1. What the studies did

| Study | Criterion | Lifts / loads | n | Camera | Stats and result |
|---|---|---|---|---|---|
| [Renner, Mitter & Baca 2024](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0313919) | Vicon, 12 cameras, 200 Hz; RepOne transducer as comparator | Squat, bench, deadlift; 1 rep at each of 45–90% | 20 powerlifters, 589 reps | Phone 1 m high, 3 m lateral to bar end; Qwik at 1080p/60 fps | Bayesian mixed models, RMSE, standardised bias. Qwik RMSE 0.01–0.04 m/s; Metric and MyLift 0.04–0.14 m/s. Mean velocity only (0.11–1.04 m/s). No fixed threshold. |
| [Puppyn & Brughelli 2026](https://openrepository.aut.ac.nz/items/c6d7478c-2152-4f7e-a7d4-abb112e5287e) | Review | 18 studies, 6 apps | n/a | n/a | "Acceptable" = r ≥ 0.70, CV ≤ 10%, ES ≤ 0.60. Apps fell below research-grade thresholds (ICC ≥ 0.997, CV ≤ 3.5%). |
| [Balsalobre-Fernández et al. 2020](https://lida.sport-iat.de/twm/Record/4060178?lng=en) | 3D motion capture | Snatch, 40–80% 1RM, 2 reps per load | 10 NCAA D1 athletes | Sagittal, plate-shape tracking; fps not in abstract | r = 0.73–0.90; peak vertical velocity bias ES −0.10 (ns); bar-path displacement biases small but significant. First author built the app. |
| [Taber et al. 2023](https://doaj.org/article/887ae648a0a24632bb23dcb29a32fcee) | 3D motion capture | Squat, bench, deadlift | 800+ reps (per Metric) | Not retrieved | r = 0.67–0.95; ICC 0.79–0.98. |
| [Trowell et al. 2024, PeerJ](https://doaj.org/article/426d2074cb27453f96495e10851f987b) | Vicon | Squat, bench | Not retrieved | Not retrieved | Poor to moderate agreement for mean velocity. |
| Li et al. 2024; Šagovac 2024 (via [Metric](https://www.metric.coach/validation), not read at source) | GymAware; Vitruve | Bench, 45–75% | 75 and 150 reps | Not stated | r 0.93–0.94, ICC 0.89–0.97, SEE 0.017 m/s, CV < 10%. |

- **Silva et al. 2021 was not read.** MDPI returned 403 and PMC a captcha, so the heavier-load bias finding is unverified.
- **Peak velocity is barely validated anywhere.** Renner reports mean velocity only, and the only Olympic-lift evidence is the 10-athlete snatch study.
- **No clean-and-jerk study was found.**

## 2. Error sources

Renner names bar tilt, lens distortion, coronal-plane movement, resolution and frame rate as error sources but gives no sizes. I found no source that quantifies any of them for barbells. The sizes below are my own geometry from Catchline's method, not measured values.

| Source | Size (my estimate) | Why |
|---|---|---|
| Plate-radius error | 1% speed error per 1% radius error | Speed scales with 0.225 / radius; at a 100 px radius, 1 px is 1%. |
| Non-450 mm plate | A 400 mm plate reads +12.5% | Same scaling. Renner used 2.5 kg technique plates below 65 kg. |
| Plate tilt or yaw | Up to 1.5% at 10°, 6% at 20° | Only if the radius is taken from the shortened axis of the ellipse. |
| Out-of-plane drift | About 3% per 10 cm at 3 m | Scale goes as 1/depth; per-frame calibration mostly cancels it. [Out-of-plane error is a known 2D problem](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi.dedup.....94faa59052705b9c724b07173cbb09eb). |
| Motion blur | 42 mm smear at 2.5 m/s and 1/60 s exposure | Mainly degrades the radius fit. |
| Rolling shutter | Roughly 1–2% on fast lifts | Assumes about 16 ms readout; not confirmed for any iPhone. |
| Frame timing | 1 ms jitter is about 0.75%; a dropped frame is about 25% on that sample | The differencing window is 133 ms; only matters if nominal fps is assumed. |
| Smoothing | Peak reads low on Olympic lifts | Metric's own GymAware test showed a −0.088 m/s peak error. |

## 3. Three designs

| | A. One-day transducer protocol | B. University study | C. Open dataset |
|---|---|---|---|
| Criterion | GymAware or Vitruve | Vicon or Qualisys 3D capture | Whatever A or B produced |
| Sample | 150–200 reps, 3+ lifters | About 20 lifters, 500+ reps (Renner scale) | Starts with A's reps and grows |
| Time | 1 day plus 2 days of analysis | 6–18 months to publication | A plus 1–2 days of packaging |
| Cost | Vitruve [$447](https://store.simplifaster.com/product/vitruve-encoder); GymAware [$1,995](https://store.simplifaster.com/product/gymaware-1-unit-kit) to [$2,299](https://sorinex.com/products/gym-aware); borrowing is free | Near zero cash | Hosting only |
| Claim it supports | Agreement with a named transducer | "Independently validated against 3D motion capture" | "Verify it yourself" |

- **A is agreement, not validity.** A [2025 review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12416690/) argues a non-gold-standard criterion shows only agreement between devices. Secondary sources say Weakley 2021 treats 3D capture as the criterion and GymAware as the usable field substitute; I did not read Weakley.
- **Rental prices were not found.** Borrowing from a gym or coach is the realistic route.
- **Sample size for A is my calculation.** By the standard Bland-Altman approximation (from memory), about 200 reps puts each limit of agreement within roughly ±0.24 SD. Reps within one lifter are not independent, so report the lifter count.
- **Wording for A:** "Across N reps from K lifters, Catchline's mean velocity differed from a GymAware by X ± Y m/s (limits of agreement A to B). Bumper plates, side-on at 3 m, 60 fps, app version V. Data here."
- **Labs for B, confirmed from papers read:** Vienna (Baca, Mitter), AUT (Brughelli), Balsalobre-Fernández with Kipp at Marquette, and Taber at Sacred Heart. From memory only: Weakley at ACU, García-Ramos and Pérez-Castilla at Granada.
- **Route for B:** email the corresponding author offering a ready-made MSc project. They need free licences, a version freeze, per-rep CSV export and a written no-influence statement; Metric says it gave [guidance and export support but no input](https://www.metric.coach/validation).
- **Wording for B:** cite the paper, the version tested and the lifts.
- **C costs little beyond A.** Publish clips, criterion CSVs, app outputs and the analysis script on OSF or Zenodo, with lifter consent.

## 4. How competitors use validation

- **Metric** runs a [dedicated validation page](https://www.metric.coach/validation) headlined "Lab-grade accuracy. From your phone." and "Ranked #1 against a GymAware tether". It lists unfavourable findings and version caveats, including its own test of 95 reps from one lifter in one session.
- **Qwik** says "the most accurate VBT app. Scientifically validated." on its [App Store listing](https://apps.apple.com/us/app/qwik-vbt/id1660094818) without naming a study. The tested version was v0.94.
- **My Jump Lab** marketing was not checked.
- **Whether a badge matters is unconfirmed.** I found no survey or conversion data; the only evidence is that both competitors lead with it.

## 5. Regulatory and App Store risk

- **Apple:** [guideline 1.4.1](https://developer.apple.com/forums/thread/807889), as quoted by developers, requires disclosed data and methodology for health-measurement accuracy claims. Bar speed is a performance metric, so it probably falls outside; that is my inference, and I did not read Apple's own page.
- **FTC:** [advertisers need substantiation](https://www.wsgr.com/en/insights/ftc-releases-health-products-compliance-guidance.html) for express and implied claims. "Scientifically validated" implies scientific evidence; a published agreement figure with stated conditions is defensible.
- **Singapore** advertising rules were not checked.

## Recommendation: design A, with the data published

It is the only design cheap enough to do now, and it leaves a dataset a lab can extend into B.

### One-page protocol

1. **Criterion:** borrow a GymAware. I recall, unconfirmed, that it corrects for cable angle and Vitruve does not, which matters on Olympic lifts. Attach it to the sleeve opposite the camera, as Renner did.
2. **Camera:** iPhone on a tripod, 1 m high, 3 m lateral to the bar end, bar centred, 60 fps. Repeat one block at 30 fps.
3. **Plates:** 450 mm bumpers for the main set; label one block with change plates as out of scope.
4. **Lifts:** squat, bench and deadlift at 45–90% in 5% steps, plus snatch and clean at 40–80% with 2 reps per load.
5. **Target:** at least 3 lifters and 150–200 reps, with at least 40 Olympic reps.
6. **Sync:** match reps by set and rep order, and log every missed or ghost rep.
7. **Freeze:** fix the app version and export per-rep mean and peak velocity.
8. **Stats:** Bland-Altman bias and limits of agreement, r, SEE and CV, per lift and per metric, each plotted against velocity to expose proportional bias. Compare with the review's bar of r ≥ 0.70, CV ≤ 10%, ES ≤ 0.60.
9. **Publish:** clips, CSVs and the script, including failures and the conditions tested.
10. **Claim:** use the agreement wording in section 3, never "validated" or "most accurate".
