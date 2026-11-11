# Catchline 4.0: App Store listing draft (en-US)

Draft, 11 Nov 2026. Nothing here has been sent to App Store Connect. Product: tracking only (TASKS.md "4.0: tracking only"). Listing fields use US spelling, as the 3.x listing does. Character counts are computed, not estimated.

Rules carried over from the 3.x listing (`~/dev/liftcheck-research/launch/store-listing.md`): no "Olympic", "Oly" or "CrossFit" in the name, subtitle or keyword field (trademark, guideline 2.3.7); no "AI" as a selling word. New for 4.0: no cues, no injury or diagnosis language, no rep counts, no bar speed, no centimetres, no accuracy figures.

## 1. Name and subtitle: three options

| Option | App name | Count (30) | Subtitle | Count (30) | Reason |
|---|---|---|---|---|---|
| A (recommended) | `Catchline: Bar Path Tracker` | 27 | `Body lines & angles on video` | 28 | "Bar path" is the one search term in this niche with weak incumbents (research 06), and it now describes the product honestly. The subtitle carries the half nobody else has: the body, on the same video. |
| B | `Catchline: Lift Video Tracker` | 29 | `Bar path, body lines & angles` | 29 | Reads most plainly to someone who has never heard of a bar path, and covers gymnastics better. Costs the name-weight on "bar path" (it moves to the subtitle) and "lift tracker" searches are full of workout loggers. |
| C | `Catchline: Lift Form Check` | 26 | `Bar path & angles on video` | 26 | Keeps the live name, so nothing already ranking is reset. But "form check" promises a verdict the app no longer gives, which is a metadata accuracy risk (guideline 2.3) and a likely source of 1-star "it didn't tell me anything" reviews. |

**Recommendation: A.** The rest of this file (keywords especially) assumes A. If B or C is picked, remove from the keyword field any word that then appears in the name or subtitle (`lift` for B; `lift`, `form` for C) and put `tracker` back in.

## 2. Promotional text (160 of 170)

```
Add a video of any lift and see the bar path, body lines and joint angles on the real video, frame by frame. Tracked on your iPhone. Your video never leaves it.
```

## 3. Description (1198 of 4000)

```
Add a video of your lift. Get it back with the bar path, your body lines and your joint angles drawn on the real video.

WORKS ON
Snatch, clean and jerk, with hang, power and split variations. Squat and deadlift. Pull-ups, muscle-ups and other gymnastics movements.

WHAT YOU SEE
- The bar path over the whole lift
- A vertical start line and a floor line
- Body lines and joint angles on every frame
- Frame-by-frame stepping and slow motion
- Your own lines and angles, drawn on any frame
- A video to share, with the lines burned in
Turn any overlay on or off.

PRIVATE
Tracking runs on your iPhone. Your video never leaves it and is never used for training.

GOOD TO KNOW
Angles are estimates from video. Film side-on with the whole bar in frame. No rep counts, no bar speed.

PLANS
Free: 3 videos a week, with every overlay.
Catchline Pro: unlimited videos, $2.99/month or $19.99/year.

Prices in USD, vary by country. Subscriptions renew automatically unless canceled at least 24 hours before the period ends. Manage them in your App Store account settings.

Terms: https://yash-gadodia.github.io/catchline/legal/terms.html
Privacy: https://yash-gadodia.github.io/catchline/legal/privacy.html
```

## 4. Keywords (100 of 100)

```
weightlifting,snatch,clean,jerk,barbell,lift,form,squat,deadlift,gymnastics,calisthenics,slow,motion
```

## 5. What's New in 4.0 (399 characters, target under 500)

```
Catchline is now a simple tracker.

Add a video of any lift or gymnastics movement and see the bar path, a start line, a floor line, your body lines and your joint angles on the real video. Step through it frame by frame, draw your own lines and angles, and share a video with the lines burned in.

Cues are gone. Free is now 3 videos a week with every overlay. Everything still runs on your iPhone.
```

## 6. Screenshot captions (five, each under 40)

| # | Caption | Count | What the screenshot shows |
|---|---|---|---|
| 1 | `Bar path and body lines, together` | 33 | Hero. A snatch mid-pull on the real video with the bar path, start line, floor line, body lines and two or three joint angles all on. |
| 2 | `Every frame. Slow motion.` | 25 | The same lift at the catch, scrubber and frame-step buttons visible, speed set to 0.25x. |
| 3 | `Lifts and gymnastics` | 20 | A bar muscle-up or kipping pull-up with body lines and the hip path, to show it is not barbell-only. |
| 4 | `Draw your own lines and angles` | 30 | A frame with one hand-drawn line and one hand-drawn angle on top of the tracked overlay, draw tool open. |
| 5 | `Share it with the lines burned in` | 33 | The share step: the exported video with overlays, iOS share sheet half up. |

Screenshots 1 to 3 are what shows in search results, so the gap (bar and body on one video) leads. Use real clips tracked by the app (guideline 2.3.3), not design comps. The privacy line has no screenshot of its own; it can sit as a small second line on screenshot 1 ("On your iPhone. Your video never leaves it.").

## 7. Keyword reasoning

**No keyword-volume tool was available.** Apple does not publish search volume, and the Apple Search Ads popularity scores that research 06 asked for were never pulled (they need an ASA login). Every choice below rests on the competition read in `~/dev/liftcheck-research/06-growth.md` (iTunes Search API, US store, 11 Oct 2026) and on which words the audience uses. That read is a month old and was not re-run for this draft. Treat ranking expectations as unverified.

How the three indexed fields are split (Apple indexes name, subtitle and keywords together, so no word is repeated):

- **Name: `bar path`, `tracker`.** "Bar path" had the weakest incumbents of any on-topic term (one app with 46 ratings from 2020, the rest near zero). Research 06 judged that an app with 50+ ratings and the phrase in a prominent field could own it. Catchline has 0 ratings today, so this is a medium-term bet, not an immediate rank.
- **Subtitle: `body`, `lines`, `angles`, `video`.** Covers "joint angles", "angle video", "body lines" and "video tracker" style searches. Volume for these is unknown; they are there mainly because they say what is different.
- **Keyword field:**
  - `weightlifting`, `barbell`, `lift`: the head terms are unwinnable alone (Hevy, Strong), but they combine with the name into "weightlifting bar path", "barbell tracker", "lift tracker", "barbell path".
  - `snatch`, `clean`, `jerk`: movement words. "Snatch" alone is polluted by non-fitness apps and "clean and jerk" returned restaurants, so nobody competes; they are cheap and match intent when someone does type them.
  - `squat`, `deadlift`: new for 4.0, since any lift is now tracked. These open the much larger powerlifting and general gym audience. Whether the app is good enough on those lifts to deserve that traffic is a product question, not a keyword one.
  - `form`: pairs with the name and other keywords into "lift form", "squat form", "form tracker". `check` was dropped for space and because "form check" promises a verdict.
  - `gymnastics`, `calisthenics`: the second audience. Competition there is score-and-text apps with almost no ratings (research 39, 43).
  - `slow`, `motion`: "slow motion video" is how people look for a frame-by-frame player. Likely crowded by general camera apps; unverified.
- **Left out on purpose:** `olympic`, `oly`, `crossfit` (trademark); every competitor brand; `ai`, `coach`, `cue`, `velocity`, `speed`, `reps` (the app does none of these now); `app`, `free` (no ranking value); `muscleup`, `pullup`, `technique`, `analysis`, `powerlifting` (next in line if a slot opens; they did not fit in 100).

## 8. Open points before this goes to App Store Connect

1. **Share video with burned-in lines is not built yet** (TASKS.md Phase 3, unchecked). It is in the description, What's New and screenshot 5. If it slips, remove all three mentions.
2. **Drawing angles.** TASKS.md lists "draw" as done and "circle in the draw tool" as open; this draft did not check in code that a hand-drawn angle (with a number) exists, only lines. Confirm before keeping "lines and angles".
3. **"Catchline Pro" vs the live products.** PRODUCTS.md still names the $2.99/$19.99 plan "Pull" (`catchline_pull_*`) and lists Hook, Platform and Founding. The subscription display names in App Store Connect and the paywall must say "Catchline Pro" for this copy to match, and the listing says nothing about existing Founding members.
4. **"Other gymnastics movements" and squat/deadlift** are claimed on the strength of "any clip tracked the same way". TASKS.md notes a crowded gymnastics clip may pick the wrong person, and the phone test of the tracker is still open.
5. **Legal links** are the 3.x GitHub Pages URLs. The privacy policy text still describes cue sync and needs a 4.0 pass.
6. **`asc_replace.py` reads the old `~/dev/liftcheck-research/launch/store-listing.md`**, not this file, and its What's New and product list are still 3.0. It needs pointing at the approved 4.0 copy before any run.
