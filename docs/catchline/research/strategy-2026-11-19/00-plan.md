# The plan: first-choice bar path tracker (written 19 November 2026)

Built from the twelve reports in this folder. Each claim names the report it comes from; numbers are as found that day.

## Where we stand

- **iPhone has no incumbent.** In the US the top results for "bar path" have 46, 0, 5 and 0 ratings; in the UK the
  leader has 5. Catchline ranks 9th (US) and 7th (UK) with no US ratings. Iron Path and BarSense have left the stores.
  (01, 02)
- **The leader is an Android app.** WL Analysis has about 185K Android installs and a free tier lifters praise; on
  iPhone it is small. Android is about 72% of phones worldwide and 75 to 90% in most traditional weightlifting
  countries. (01, 08)
- **The App Store sends almost nobody yet.** Search impressions are in the hundreds over four months; installs so far
  came from people who were told the name. (private store analytics)
- **The first session decides everything.** Two in three new phones open the app once. Fixes shipped over the air never
  reach a first launch, so they need a store build (4.0.6 carries them). (10)
- **Consumer subscriptions alone do not reach the revenue goal.** Roughly 0.3 to 0.6 million iPhone lifters film their
  lifts; the price is 30% of the category median. A coach tier is the lever. (04, 11)

## The goal, stated so it can be measured

1. **By the end of February 2027: first on iPhone.** Rank 1 for "bar path" and "bar path tracker" in the US, UK,
   Australia and Canada, with more ratings than any other bar path app in each (targets: 60 US, 25 UK, 150 in all).
2. **By mid 2027: paid by coaches.** Five coaches paying for a roster before any coach code is written, then the tier.
3. **During 2027: Android**, as a reduced first version, decided after a two-week speed test on a mid-range phone.

## What to do, in order

### Now to mid December: make the first lift land, and be findable
1. **Release 4.0.6** when approved, then read the first-launch funnel for a week. (10)
2. **Store listing:** subtitle "Weightlifting Video Analysis", the keyword field rewritten to add the missing words
   (olympic, velocity based training, form check, lift), an en-US locale, and es-MX used as a second US keyword set.
   Needs a new version submission. (02)
3. **Ratings:** ask after a lift that got a bar path (already built), and ask lifters in the US and UK directly:
   ratings count per country. (02)
4. **First-run fixes from the code audit**, all JavaScript: say the real cause when no bar path is found; name the
   plate step's dead end; show the weekly limit before the picker, not after three screens; a Monday "your free video
   is back" reminder; cancel first-lift reminders only when a path was drawn; make the sample lift a real button. (10)
5. **The free tier is the most likely source of one-star reviews.** Competitors are praised for a usable free tier.
   Test 3 free videos in the first week against 1, watching conversion and four-week return together. Owner's call.
   (05, 12, 04)

### Mid December to February: distribution
6. **One account, one repeatable format, every day** on Instagram and TikTok, with a comment-to-message link to the
   App Store. No bar path app has an audience there (the leader's account has under 1,000 followers). Formats that need
   no famous footage come first: same lifter at three weights, missed against made, a follower's lift. (03, 07)
7. **Footage:** own lifts, users' lifts with consent, athletes' own posts with permission as a collaboration post.
   Broadcast footage only rarely, never in an advert, and never the Olympics. (07)
8. **Twenty coach conversations** before building anything for coaches: do the review by hand for two weeks, then ask
   for payment. Pass mark: five of twenty pay. (11, 03)
9. **Time it to the calendar:** CrossFit Open workouts on 18 and 25 February and 4 March 2027; USA Weightlifting
   Nationals 4 to 7 March. Ask Apple for featuring three weeks ahead with an in-app event. (03, 02)
10. **Japan and Korea** are localised, iPhone-heavy and have no local competitor: native review of lift terms, then
    local keywords. Add Traditional Chinese for Taiwan and Hong Kong. Leave mainland China listed as it is. (08, 02)

### In parallel: trust and return
11. **Publish an accuracy check.** One day with a borrowed GymAware, 150 to 200 reps from three lifters, data published.
    The claim it supports is "agreement with a named device", never "validated". Peak speed on Olympic lifts is barely
    validated by anyone, which is an opening. (06)
12. **Give lifters a reason to come back:** ask the weight and the kind on the result, then records per lift and
    weight, "compare to your best", a weekly digest. Not a training log. (12)
13. **Coach tier v1**, only after step 8 passes: invite, "send to coach" per lift, the coach opens it in the same
    player and replies with a drawing and a note. About two weeks of work, then one store build. Sharing is opt-in per
    lift, and the listing's privacy line changes with it. (11)
14. **Pricing**, owner's call: Pro at $4.99 a month and $29.99 a year is still below every comparable; the lifetime
    offer then needs to end or rise. (04)

### Android
15. A reduced first version (import, tracking, path, body lines, bar speed, one share video) is scoped at 22 to 30
    working days; full parity at 45 to 65. The first two weeks answer the only open question, speed on a mid-range
    phone. Start after the coach test, not before. (09)

## What not to do yet
- Paid adverts, until one post spreads on its own and installs convert better.
- Live in-gym tracking, Apple Watch, load suggestions: large, and coaches advise against watching every set. (12)
- Marketing accuracy before step 11.
- Arabic, Persian, Thai, Indonesian, until there is an Android app. (08)

## The loop that keeps it moving
The tester and fixer on the Mac Mini now work on the shipping code. The fixer merges and ships its own low-risk fixes
(to 10% of phones, to everyone a day later) and leaves anything touching prices, privacy, native code, the database or
the App Store for the owner. New feedback arrives on Telegram. Still to add: the weekly funnel read and feedback filed
as issues, so the loop works on what lifters do, not only on what breaks.
