# Catchline 4.0: go-to-market plan, starting 12 Nov 2026

Written 11 Nov 2026; channel decision added 12 Nov (section 0), which overrides the sections below where they differ. Marks: **[V]** checked on a live page, **[S]** secondary source or mirror, **[I]** inference, **[U]** could not verify.

## 0. Channel decision (12 Nov): social, paid or creators?

**None of them is the main channel. The exported video is.** Each shared lift with the lines and the wordmark is the advert. Coaches and small creators start it, your own social account holds the proof, and paid comes last and narrow.

**Paid installs lose money at today's price [I, rough].** A payer is worth about $2.54 a month after Apple's 15%, so about $10 to $17 over a typical 4 to 6 month subscription. Installs cost $2 to $7 (GainFrame: $6.86 on Apple Search Ads; a $200 TikTok boost got none). Freemium fitness apps convert 2 to 5% of installs to paid, likely less here since 3 free a week rarely hits the paywall. That is about $70 to $300 to win a $15 payer. The one exception after 4.0 is live: about $5 a day of Apple Search Ads on exact high-intent searches ("bar path", "barbell tracker") to learn the real install-to-paid rate.

**Coaches and creators beat your own account:**
1. The audience is small and gathers around a few accounts (@torokhtiy 722K, @hookgrip 644K, @catalystathletics 368K). One coach filming 10 lifters a day makes 10 exports a day; a new account starts at zero.
2. The app makes what these accounts already post (lift breakdowns with a bar path) without the work, so the offer is a trade, not a paid post.
3. Testers analyse other people's lifts first. Huilong (12 Nov) screen-recorded a pro snatch from Instagram rather than filming their own. Breaking down others' lifts is the creator use case. It is also the hardest footage (far, off-angle, ads spliced in), and reposting someone's lift needs their yes.
4. A creator post spikes for a week and fades; a coach uses it every class and brings their lifters. **Coaches first.**

**Your own account** is proof a coach checks before replying, a test bench for hooks ("what app is that?" per post), and a library to send people. One post a day from the 180 clips; do not expect reach from it.

**Before going loud:**
- The bar path passes 8 of 10 gate clips by eye. Add 2 or 3 competition-style clips (Huilong-type footage) to the 10, since that is what testers try first.
- **Known gap:** the export wordmark sits fixed bottom-right, inside the area Reels and TikTok cover (`TrackRenderer.swift`; TASKS.md Phase 3). Moving it needs a store build, so it goes in build 43 with `expo-store-review`. Until then the loop's attribution is weak on Reels and TikTok.
- `share_exported` and `share_completed` are already logged to PostHog, so the metric works from day 1.

**Changes to the plan below:**

| The plan said | Now |
|---|---|
| Coaches in week 2 (day 8) | Coaches from day 1, beside the gym. Offer: Pro free for life, and their lifters' clips sent back with lines |
| Creators: message D to 5 on day 13 | 10 small coaches and analysis accounts (1K to 50K) in week 1 once the gate passes; open with one of their own lifts already tracked |
| Own account as loop 2 | Kept, as proof rather than reach |
| No paid installs | Same, except about $5 a day of Apple Search Ads on "bar path" after launch |
| (new) | A "pro lift breakdown" format: competition footage with lines, only with the lifter's or account's permission |

**Read at day 14:** exporters other than you (target 20), and whether coach-led exporters outnumber those from your own posts. If neither moves, fix the output, not the channel.

**Owner decisions open (12 Nov):** the first 5 coaches by name; Pro free for life for coaches (recommended yes); competition clips in the gate set (recommended yes).

## 1. The one page

**The bet.** A lift video with the bar path and body lines drawn on it is something lifters already want to post, so every shared video is the advert and the small "catchline" wordmark is the attribution. The first users are people you can stand next to: your gym, then coaches who film lifters all day. Loud promotion waits until the new bar path passes a fixed test; until then you collect testers, clips and reactions quietly.

**The one metric for 14 days (12 to 25 Nov):** lifters other than you who export a Catchline video. **Target: 20.** Secondary, counted by hand: 8 of them post it publicly.

**The three loops, in priority order**

| # | Loop | How it turns | Why first |
|---|---|---|---|
| 1 | Gym floor | You film a member's lift, send it back with lines, they post it, the next member asks | Warm audience, no accuracy risk you cannot see, feedback in person |
| 2 | Your own clips | One post a day from your 180 videos; "what app is that?" becomes a tester | Costs one batch session a week |
| 3 | "Send me your lift" | Someone sends a clip, you return it with lines, they post it | Turns comments and DMs into exports; becomes the Reddit and coach approach later |

**The gate for going loud.** Pick 10 of your own clips (3 filmed close, bar end towards the camera). A build passes when the bar path is right on 8 of 10, by your eye. Launch day needs a pass and 4.0 released.

## 2. What the evidence says

| Comparable | What spread it | Transferable to you |
|---|---|---|
| Kapwing (video tool) | A visible watermark on every free export; almost no ad spend for 22 months. When removal cost $1, over 99% did not pay. People register a mark only after many sightings [S, founder account](https://www.producthunt.com/stories/how-we-used-watermarks-to-grow-our-startup) | Keep the mark on, do not sell removal, and build density in one community first: the gym |
| Strava | Users made their own transparent overlays for Instagram, so Strava built the sticker in [S](https://nogood.io/blog/strava-marketing-strategy), [V feature](https://support.strava.com/en-us/articles/17718841-how-do-i-share-my-strava-activity-to-instagram-stories-as-a-transparent-sticker). No published share-to-install rate [U] | The output must look better than the raw clip, on the user's own footage |
| Runna | A recap published right after the London Marathon, flattering to users, nothing private on it [S](https://growth-dives.kit.com/posts/how-runna-turned-the-london-marathon-into-a-content-loop) | Time shares to emotional moments: a PR, a competition, a first muscle-up |
| Hevy | Friends and family, then store traffic; 2M downloads in four years on about $15k of ads [V](https://www.revenuecat.com/blog/growth/guillem-ros-hevy-podcast), [V](https://www.hevyapp.com/how-we-built-hevy/) | Starting with people you know is normal, not small |
| GainFrame (solo fitness app) | Progress screenshots showing the app name in niche subreddits; people asked what it was: about 150 sign-ups, 100 TestFlight installs. Replies with a link were downvoted. $200 TikTok boost: zero conversions. Apple Search Ads CPA $6.86 [S, founder blog](https://gainframe.app/blog/two-months-launching-second-app/) | Show the output, let people ask. No paid installs at $2.99 a month |
| Bar path rivals | OlyPro's Instagram: 1,018 followers, 21 posts [V today]. WL Analysis: 46 US ratings after six years [carried from 43]. Nobody here runs a share loop | The channel is empty |

Not covered: no reliable source found for CapCut's watermark as a growth driver; Whoop, Oura, Strong, MacroFactor, Gentler Streak, Ladder and Metric not researched [U].

**Where lifters are.** Instagram is the centre: @torokhtiy 722K, @hookgrip 644K, @catalystathletics 368K, @weightlifting_house 307K, @sikastrength 123K [V today, logged-out profile counts]. Reddit: r/weightlifting about 330k, r/formcheck 151k, r/crossfit about 1.8M [S, carried from 06]. Instagram's head has named watch time, likes and sends as the top Reels signals [S, via secondary blogs](https://later.com/blog/how-instagram-algorithm-works/). So: lift starts in the first second, 7 to 12 seconds total, and worth sending to a training partner [I].

**Reddit rules: I could not read the live pages** (Reddit blocks my tools, including the browser). From mirrors: r/weightlifting runs a weekly Self Promotional Saturday thread that accepts any self-promotion [S, Feb 2025 mirror](https://lr.psf.lt/r/weightlifting/comments/1ipwpsd/self_promotional_saturday); an older copy of the r/crossfit sidebar says self-promotion posts "may be deleted" and asks for regular participation first [S](https://lr.in.psf.lt/r/crossfit/wiki/config/sidebar); r/formcheck rules not found [U]. Reading the three live rule pages is a task tomorrow.

**One warning for the wording.** Greg Everett (Catalyst) argues that tracking a bar end from the side is distorted by rotation and that only the bar's centre matters; he recommends slow motion from an oblique angle [V](https://www.catalystathletics.com/video/1635/Bar-Path-Tracking-Useful-or-a-Waste-of-Time). Never claim precision; show bar and body together. Close, off-angle tracking answers his complaint once it works.

## 3. Pricing and paywall: recommendation

- **Keep 3 free videos a week.** Your gym data showed 1 to 2 uploads per active user a month (SYNTHESIS), so almost nobody meets the paywall. Fine for now: the goal is exports, not revenue.
- **Keep the wordmark on every export, Pro included. Do not sell removal.** Removal earns little and costs reach (Kapwing).
- **No referral scheme yet.** Extra free videos are worthless to people who never hit the cap.
- **Do not touch price for 14 days.**

## 4. Tomorrow, Thursday 12 Nov

**45-minute block**

| Min | Task |
|---|---|
| 0 to 10 | Register `@catchlineapp` on Instagram, TikTok and YouTube. `@catchline` on Instagram is taken by an empty account [V today]; `catchlineapp` looked free logged out [U]. Bio: `bar path and body lines on your own lift video. on your iPhone. testing now, dm for access`. No store link until 4.0 is live. Connect all three to your scheduler |
| 10 to 20 | Read the live rules of r/weightlifting, r/crossfit and r/formcheck; paste them into a note. Check your Reddit account has real comment history there |
| 20 to 30 | Pick the 10 gate clips. Run them on the current build. Write down the score out of 10 |
| 30 to 45 | Send the 10 messages below |

**Ten people to message**

| # | Who | Message |
|---|---|---|
| 1 to 3 | Three training partners who film their lifts | A |
| 4 | Your weightlifting coach | B |
| 5 | The gym owner | C |
| 6 | The member who posts lifts to stories most | A |
| 7 | A friend who competes in CrossFit | A |
| 8 | A lifter friend overseas | A |
| 9 | A coach at another Singapore barbell club | B |
| 10 | One small Singapore lifting creator (5k to 50k) | D |

- **A:** `hey, building a thing that draws the bar path + body lines on ur lift vids, all on the phone. can u send me one clip? ill send it back with the lines in 2 min. if u like it ill add u to the testflight`
- **B:** `coach, qn. i built an app that draws bar path and joint angles on a lift video. can i show u on my snatch tmr and u tell me whats wrong or useless about it? want a coach's eye before i show anyone else`
- **C:** `can i post in the members app asking for 10 ppl to test my lift tracking app? free, no sign up. ill film their lifts myself this week so no extra work for the coaches`
- **D:** `hi, i lift at [gym] in sg and built an app that draws bar path and body lines on lift videos. one of mine attached. if u send me any clip of urs ill send it back with the lines, no strings. keen to hear where it looks wrong`

**Members app post (after the owner says can):** `testing my lift tracking app this week. film any lift (snatch, clean, squat, pull-up) and send me the clip, or grab me at the gym, and ill send it back with ur bar path and body lines drawn on. looking for 10 ppl, iphone only for now`

**Two-hour block**

| Min | Task |
|---|---|
| 0 to 40 | Run 15 of your clips through the app. Choose five where the output is right |
| 40 to 100 | Export and schedule one a day, Fri to Tue, on all three accounts |
| 100 to 120 | At the gym: film two members' lifts, track them on your phone, AirDrop the result |

**The five clips and their copy** (on-screen hook in the first second; no link, no logo beyond the wordmark)

| # | Clip | Hook on screen | Caption |
|---|---|---|---|
| 1 | Your cleanest side-on snatch, path drawing as the bar moves | `every snatch draws a line` | `this is mine at [kg]. filmed on a phone leaning on a water bottle.` |
| 2 | Make and miss at the same weight, side by side | `same weight. one make. one miss.` | `watch where the two lines split.` |
| 3 | A squat or clean with body lines and joint angles (works today) | `my hip angle at the bottom` | `lines and angles drawn on the phone. the video never leaves it.` |
| 4 | Pull-up or muscle-up with body lines | `not just barbells` | `body lines on a kip. still testing this one.` |
| 5 | Your heaviest lift on film | `[kg]. the line doesn't lie` | `building this for lifters who film everything. dm if u want to test it.` |

When someone asks what app it is: `something im building, called catchline. dm me and ill add u to the test`.

## 5. Days 2 to 14

If the gate passes and 4.0 is released on any day, do the launch-day list in section 7 instead.

| Day | 45-minute task | Output | Number to check |
|---|---|---|---|
| 2 Fri 13 | Reply to every message and comment. Film 3 members | 3 videos sent | Replies to the 10 messages (target 5) |
| 3 Sat 14 | Add testers to TestFlight. Three helpful form-check comments on Reddit, no app mention | 10 invites | Testers installed |
| 4 Sun 15 | Batch next week's 7 posts (section 8) | 7 scheduled | Posts scheduled |
| 5 Mon 16 | Message each tester: `what did u try it on? send me the worst result` | Failure clips to the builder | Testers with 1+ tracked video |
| 6 Tue 17 | Story: `send me a lift, ill draw the lines`. Return every clip | Clips returned | Clips received (target 5) |
| 7 Wed 18 | Week review. Gate test on the newest build | Top hook re-cut | Gate score; exporters so far (target 8) |
| 8 Thu 19 | Message B to 5 Singapore coaches or clubs | 5 sent | Replies |
| 9 Fri 20 | Film 5 members; ask each to post and tag `@catchlineapp` | 5 videos | Public posts by others |
| 10 Sat 21 | Gate passed: Saturday thread comment (section 7). Not passed: three more form-check comments | 1 comment | Replies, DMs |
| 11 Sun 22 | Batch 7 posts, including tester clips with consent | 7 scheduled | Sends per post |
| 12 Mon 23 | Ask your 5 happiest testers for one line you can quote | Quotes | Quotes in hand |
| 13 Tue 24 | Message D to 5 small creators | 5 sent | Clips sent back |
| 14 Wed 25 | Readout against section 9 | Decision | Exporters (target 20), public posts (8) |

## 6. In-app changes that make sharing spread (for the builder, ranked)

| # | Change | Size |
|---|---|---|
| 1 | Log an event on every export with the share target, and confirm it reaches PostHog. The 14-day metric depends on it | Small |
| 2 | Wordmark legible at Reels size, outside the bottom 20% and right 12% (platform UI), never over the lifter | Small |
| 3 | Rating prompt after the first successful export, never after a failed track. Apple shows it at most three times a year [U, from memory; check the live page](https://developer.apple.com/documentation/storekit/requesting-app-store-reviews) | Small |
| 4 | Default share text for WhatsApp, Telegram and iMessage: `bar path + body lines by Catchline, free on the App Store [link]`. Instagram ignores prefilled captions | Small |
| 5 | One App Store campaign link per channel (bio, gym QR, Reddit) so App Store Connect shows where installs come from | Small |
| 6 | Export style where the path draws as the bar moves, slowing at the turnover: the look of the big analysis accounts [I] | Medium |
| 7 | Optional 1.5-second end card: `made with Catchline. free on the App Store` | Medium |
| 8 | Referral, and hosted pages for shared videos: not now (hosting clips breaks the privacy promise) | Large |

## 7. Launch sequence, gated on the product

**Quiet (until the gate passes and 4.0 is live).** Gym, friends, 20 TestFlight testers. Public posts use only clips where the output is right, no store link. Collect failure clips, consent and reactions.

**Launch day.**
1. Release 4.0. Message every tester: `its live, pls update. if u like it a rating helps a lot`.
2. Post your best close-up clip with the bar end towards the camera. Hook: `filmed from 2 metres. it still found the bar.`
3. Put the campaign link in all bios; post in the members app; print a QR for the gym wall if the owner says can.
4. One honest LinkedIn post and one newsletter note: what it does, what it does not do yet.

**Week two.**
- **Reddit.** r/weightlifting: one comment in the Saturday thread: what it is, 3 free videos a week, what it gets wrong, and a request to tear it apart. Elsewhere, comment usefully on form checks and mention the app only if asked. r/crossfit and r/formcheck: no post until you have read the live rules and commented there for two weeks.
- **Coaches.** A coach who films ten lifters is ten exports. Pro free for any coach who uses it in class.
- **Product Hunt.** Optional, one afternoon, backlink only. One fitness founder got about zero active users from a week on it [S](https://www.indiehackers.com/post/what-6-weeks-of-shipping-fitforge-in-public-actually-looked-like-9b610d316f).
- **Hacker News.** Only as a technical write-up of on-phone tracking [I].

## 8. A content system you can keep up

| Format | Template | Hook pattern |
|---|---|---|
| The line | One lift, path draws live, 7 to 10 s | `every [lift] draws a line` |
| Two lifts | Make vs miss, or last month vs today, side by side | `same weight. what changed?` |
| Someone else's lift | A member's or follower's clip, with consent | `[name] sent me this clean` |

**Weekly rhythm.** Sunday: one 45-minute batch. Daily: one post, ten minutes of replies. Wednesday: check sends and "what app" comments.

**Batching from 180 clips.** Tag each once: lift, kg, make or miss, angle, "tracks right" yes or no. Each Sunday take seven "yes" clips: three of format 1, two of format 2, two of format 3. Export, add the hook, schedule.

## 9. What to measure, and the decision rules

| Where | What |
|---|---|
| PostHog | Exporters who are not you (the metric); tracked videos per user; exports per tracked video; who came back within 7 days |
| App Store Connect | Product page views, conversion, first-time downloads by campaign link, ratings |
| A note on your phone | Public posts by others carrying the wordmark; "what app is that" comments and DMs |

After 14 days:

| Result | Meaning | Do |
|---|---|---|
| 20+ exporters, 8+ public posts | The loop works in one gym | Double down: a second gym, coaches, then Reddit |
| Views, but under 5 "what app" comments or DMs | The clip does not make people curious | Change the hook and the first second, not the product |
| Testers track once and do not export or return | The output is not good enough to show anyone | Change the product before any more promotion |
| Gate still failing | Bar path is not ready | Stay quiet; lead with body lines and angles |

## 10. Risks and what not to do

- No loud promotion and no store links before the gate passes and 4.0 is live. A wrong line on a stranger's PR is the screenshot that sticks.
- No paid installs, no boosted posts, no bulk influencer messages (section 2). The only paid test is the narrow Apple Search Ads one in section 0, after launch.
- No one else's lift in public without a yes in writing; ask before showing faces.
- No accuracy claims, no "AI coach", no injury language.
- No link drops on Reddit; no Discord of your own.

## Sources

- Kapwing watermark story: https://www.producthunt.com/stories/how-we-used-watermarks-to-grow-our-startup
- GainFrame, two months after launch: https://gainframe.app/blog/two-months-launching-second-app/
- Hevy: https://www.revenuecat.com/blog/growth/guillem-ros-hevy-podcast and https://www.hevyapp.com/how-we-built-hevy/
- Runna content loop: https://growth-dives.kit.com/posts/how-runna-turned-the-london-marathon-into-a-content-loop
- Strava: https://nogood.io/blog/strava-marketing-strategy and https://support.strava.com/en-us/articles/17718841-how-do-i-share-my-strava-activity-to-instagram-stories-as-a-transparent-sticker
- Catalyst Athletics on bar path apps: https://www.catalystathletics.com/video/1635/Bar-Path-Tracking-Useful-or-a-Waste-of-Time
- Reddit mirrors (not live): https://lr.psf.lt/r/weightlifting/comments/1ipwpsd/self_promotional_saturday and https://lr.in.psf.lt/r/crossfit/wiki/config/sidebar
- Reels ranking signals (secondary): https://later.com/blog/how-instagram-algorithm-works/
- FitForge on Product Hunt: https://www.indiehackers.com/post/what-6-weeks-of-shipping-fitforge-in-public-actually-looked-like-9b610d316f
- Instagram follower counts: logged-out profile pages, 11 Nov 2026
- Earlier research: `~/dev/liftcheck-research/` SYNTHESIS.md, 06, 39, 43, launch/content-kit.md, launch/38-aso-review.md
