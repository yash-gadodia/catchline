# Catchline first-run audit: launch to second lift

Read-only; nothing was run. One caveat governs every "JS" label below: `app.json:103-104` (`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`) means an OTA only applies from the second launch. Because 39 of 58 phones open once, a JS fix reaches a new phone's first session only once it is embedded in a store build.

## 1. Taps and screens to a bar path on your own lift

Pick path, best case (short clip, plate found): **4 taps, 5 screens, 2 waits** (5 taps with the Photos prompt).

1. Welcome: tap "Pick one of your lifts" (`app/onboarding/index.tsx:31-35`).
2. System picker: tap a video. A blank dark screen with no spinner follows while the file is copied (`app/capture/import.tsx:55`).
3. Trim: tap "Track" (`TrimScreen.tsx:96`).
4. "Finding the plate" spinner, up to 3 native calls (`app/capture/plate.tsx:18,39-45`).
5. Check the plate: tap "Track" (`MarkScreen.tsx:204`).
6. Tracking wait (`app/analysis/processing.tsx:114`).
7. Player first look auto-plays at 0.5x, then the result card (`TrackerScreen.tsx:97,146`).

Film path: 6 taps (welcome, camera Allow, record, stop, Track, Track) plus a 5 s countdown (`session.ts:4`).

## 2. Permission prompts

- **Notifications, provisional (no dialog):** at launch (`app/_layout.tsx:80-85`, `nudges.ts:33`) and after a track (`feedback/ask.ts:57`).
- **Camera:** on "Film a lift now" (`app/onboarding/index.tsx:39`).
- **Photos full access after the pick (known issue):** no JS call requests it. The only candidate is `shouldDownloadFromNetwork: true` (`pick.ts:5`), with the matching purpose string at `app.json:38`. Not confirmed, since the native behaviour of expo-image-picker could not be read.
- **Photos add-only:** on save or Instagram share (`share/exporter.ts:65,73`).
- **Real notification prompt:** unreachable. `maybeReaskForPush` (`processing.tsx:187`) needs `analysis` set, which only happens for `status==='done'` with a failure (`processing.tsx:154`), and the pipeline never produces that (`devicePipeline.ts:263-271`).
- **Sign in with Apple:** forced before any purchase (`paywall/hooks.ts:35-45`).

## 3. Ways tracking ends without a bar path

- **Trim over 82 s:** Track is disabled. "Too long to track. Trim to {max} s or less." (`TrimScreen.tsx:88-96`)
- **Encoder says too long:** "Too long to track" / "Trim it to just the lift, under {max} s, and try again. The original stays on your phone." (`processing.tsx:161`)
- **Models missing:** "Getting the tracking ready" / "The tracking needs a one-time download that did not finish…" (`processing.tsx:162`)
- **Cancel:** goes to the Lifts tab with no message (`processing.tsx:178-182`).
- **Any native or JS error, including `interrupted`:** all map to `clip_unreadable` (`devicePipeline.ts:57-59,278`). "Couldn't read that video… The file isn't a video I can decode." The raw native string is also shown (`app/failure/[id].tsx:22`).
- **No person or no path** (`analysis/device/tracking.ts:48,50`): "Couldn't follow this clip. I need one person with their whole body in frame…"
- **Other job errors:** "Something broke on our side… leave it and we'll retry in the background" (`processing.tsx:146`). No background retry exists; the `later` action just goes back (`failure/[id].tsx:30`).
- **Tracked, no path:** "No bar path on this one. The plate was not clear in this video. Three things fix it:" plus three fixed tips (`FirstLook.tsx:47-58`). The real cause is already on the analysis as `noCueReason.gate` (`analysis/device/pipeline.ts:441-447,549`) and is ignored.
- **Plate skipped:** "No plate? Skip" (`MarkScreen.tsx:208`) leads to the same card.
- **Weekly cap:** paywall instead of tracking (`submit.ts:81`).
- **App killed mid-track:** neither the job nor the draft is persisted (`data/pipeline.ts` has no persist; `capture/store.ts:58`). I did not trace what the lifter sees on relaunch.

## 4. Paywall in the first session

- **Only automatic trigger:** `submitClip` returns `cap` (`submit.ts:77-81`) once one lift with a path was counted this week (`devicePipeline.ts:259`, `FREE_PER_WEEK = 1` at `entitlements.ts:6`).
- **When it fires:** after picker, trim and plate check, because `captureHref` is a no-op (`hooks.ts:89-91`).
- **Before value?** Not for a genuinely new phone. Yes for a reinstall in the same week: the Keychain count survives (`freeLifts.ts:3-4`) while the analytics id is new (`analytics.ts:81-96`), so a "new phone" can hit the paywall on lift 1.
- **Dismissal:** "Not now" returns to Trim, where Track loops back to plate and paywall (`app/paywall/index.tsx:26`).
- **Copy:** "Your video is saved and goes first" (`paywall.ts:24`), but the draft is memory-only.
- **Funnel fit:** the result card offers "Track another lift" (`FirstLook.tsx:86-90`) with no hint the video is used. This matches 18 paywall views against 24 bar paths.

## 5. Bad-fit videos

- **Front-on / too dark:** I found no `too_dark` gate in the device code and the result card shows no specific copy. Expect the generic "plate was not clear" card or a skipped plate. The failure copy for these reasons exists (`library.ts:76-81`) but I found no 4.0 path that reaches it.
- **Landscape:** preview uses `contain` (`MarkScreen.tsx:158`). Tracker behaviour not determined.
- **4K 60 fps:** scaled to 1080 with fps kept up to 120 (`compress.ts:6-7,44`), so twice the frames of a 30 fps clip and no warning. That it doubles the wait is my inference. Blank screen during the picker copy.
- **2 minutes:** the whole clip is selected by default (`store.ts:27`), Track is disabled with red text, and the lifter must trim by hand. 20-82 s gets only a grey hint (`trim.ts:9`).
- **No barbell:** hint overlay with Track disabled until a circle is drawn (`MarkScreen.tsx:174,204`). After Skip, a clip with no bar path is told "the plate was not clear".

## 6. What brings a one-time user back

| Mechanism | Fires for an open-once phone? |
|---|---|
| Nudges at 1/3/7 days (`nudges.ts:13`) | Yes, but quiet (provisional). Cancelled by any non-failed result, including body-only (`devicePipeline.ts:267`). The tap lands wherever the app opens. |
| Feedback notification at 3 days (`devicePipeline.ts:261`) | Only if they tracked. Quiet; opens a form. |
| Lift-ready notification (`notifications/index.ts:84`) | Only if backgrounded mid-track. Quiet. |
| Server push (`_layout.tsx:104-108`) | No. Needs an account. |
| "Free video is back" on Monday | Does not exist. |
| Feedback sheet, last-lift overlay | Need a return or a second lift first. |

## 7. Analytics gaps

- **No events:** trim viewed, Track tapped, too-long hit; camera recordings (`app/capture/index.tsx:62-66`); permission outcomes; picker failure alert (`import.tsx:34-37`); failure screen views and actions; paywall dismissal.
- **Retracks inflate "second lift":** they emit `TRACK_STARTED` with `source:'adjust'` (`devicePipeline.ts:303`).
- **No cause on `TRACK_COMPLETED`:** no `gate`, clip fps, resolution, duration or lift ordinal (`devicePipeline.ts:268`).
- **`RESULT_VIEWED` is skipped** when the lifter touches the player during the first look (`TrackerScreen.tsx:129-133`).
- **Events are lost offline:** fire-and-forget fetch with no queue (`analytics.ts:198-204`).
- **`FRAMING_CHECKED` is never sent.**

## Top 12, ranked

| # | Finding | Fix | Ships | Effort |
|---|---|---|---|---|
| 1 | The weekly cap blocks the second lift, and is revealed only after pick, trim and plate. This bounds second-lift share: 18 hit it, 2 bought. | Gate on "Track another" and the Import tab before the picker; show "next free video Monday" on the result card. Decision for Yash: 2-3 free videos in the first week. | JS | S-M |
| 2 | No-path card is generic (`FirstLook.tsx:47-58`). 8 of 32 finishers got no path. | Map `noCueReason.gate` and "skipped plate" to one specific cause and one fix. | JS | M |
| 3 | Plate not found gives a dead-ish end: Track disabled, and "No plate? Skip" guarantees no path (`MarkScreen.tsx:204-209`). | Say "We couldn't find your plate; circle it"; rename Skip to "My lift has no barbell". | JS | S |
| 4 | Full Photos prompt after the pick (`pick.ts:5`). | Drop `shouldDownloadFromNetwork` and test on a device with an iCloud clip. | JS if the flag is the cause | S |
| 5 | Every notification is quiet, and the real prompt is unreachable (`processing.tsx:154,187`). | Ask on the wait screen ("tell me when it's done") and after the first bar path. | JS | S |
| 6 | Nothing brings back a lifter who succeeded; 4 of 58 returned. | Local notification on Monday when the free video returns, plus one after the first path. | JS | S |
| 7 | Nudges are cancelled for body-only results (`devicePipeline.ts:267`). | Cancel only when a path was drawn. | JS | S |
| 8 | Long or 60 fps clips: manual trim, long waits, hard stop at 82 s (`store.ts:27`, `compress.ts:44`). | Pre-select a window of about 15 s; cap analysis at 30 fps. | JS for the window; fps cap may be native | M-L |
| 9 | Blank screens after the pick and while finding the plate. 38 started, 32 finished. | Spinner with text on import; merge plate finding into Trim. | JS | S |
| 10 | Wrong failure copy: interrupted runs read "can't decode", a false "retry in the background", raw native strings. | Separate `interrupted` and unknown copy; hide the native detail. | JS | S |
| 11 | Sample link is the smallest control and returns to welcome (`WelcomeScreen.tsx:45`, `app/analysis/sample.tsx:27`). | Make it a secondary button; "Now try your own" opens the picker with consent accepted. | JS | S |
| 12 | Forced Apple sign-in before purchase, and "Not now" loops back to the paywall (`hooks.ts:35-45`). | Buy first and link the account after; send "Not now" to Lifts. | JS | M |

Also confirmed from the known list:
- **HDR preview:** the plate check and trim both use a live `VideoView` (`MarkScreen.tsx:158`, `ClipPlayer.tsx:58`). A still from `generateThumbnailsAsync` would avoid it; JS, S. Not verifiable on a device from here.
- **Kind of lift not asked:** the movement is hard-coded to `'snatch'` (`submit.ts:39`).

## Could not determine

- Whether `shouldDownloadFromNetwork` is what triggers the Photos prompt.
- How iOS presents provisional notifications for this app.
- What 4.0 tracking returns for front-on, dark and landscape clips (heuristics in `tracking.ts` not traced).
- Real wait time per clip length and device.
- Whether the "14 second lifts" figure includes retracks.
