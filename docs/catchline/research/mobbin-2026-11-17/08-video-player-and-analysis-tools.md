# 08. Video player and analysis tools

The most useful thing: the apps that put many tools on a video keep the video bare and put the tools in a bottom sheet that starts collapsed (Future Pro, Slopes, TikTok's editor). Every tool in the sheet has a word under its icon, and the best ones show their current value in the label ("Speed (1x)").

Date: 17 November 2026. Source: Mobbin, iOS screens only. Round 2 notes (file 27 in the private research folder, sections 1.4, 1.7 and 1.8) already covered MasterClass and Google Photos speed controls, Lovi's step chips, the Premier League scrub thumbnail, Fabric's drawing tools, HBO Max key moments, and the Photoroom, Wise, Hers and Alta compare screens. Mobbin still has no golf, tennis, running-form or lifting analysis app: a direct search for them returned workout class videos and run charts only. So this file is built from workout players, video editors, photo editors and activity charts.

## Patterns

### 1. Bare video, tools in a sheet that starts collapsed

The video fills the screen. A short sheet at the bottom shows one line of context and a grabber. Pulling it up reveals a grid of labelled tools.

- Future Pro, collapsed: the workout video with a small sheet showing only the exercise name "Low Plank", a timer ":18" on a thin progress bar, a list icon and a next arrow. https://mobbin.com/screens/4049b162-20bf-43b2-9d7f-8fade0951778
- Future Pro, expanded: the same sheet pulled up. "Modified Plyo Push-Up", ":06", then two rows of square tiles, each an icon over a word: "Weight" (greyed out), "Reps", "Record", then "Flag", "Guide", "History", "Restart". https://mobbin.com/screens/b3d2fc50-f0cd-408c-a7b4-dcdd5f510c36
- Slopes: a 3D map of the day with a bottom card. The date as the headline, four tiles "Replay", "Compare", "AR" and a more button, then four stats in one row. https://mobbin.com/screens/b7165420-63a3-4e81-8acf-c830c7f330bf
- TikTok editor: a bottom row of labelled tools "Split", "Replace", "Delete", "Speed", "Crop" with a chevron at the left end that folds the row away. https://mobbin.com/screens/1ecb014f-e6e9-49bf-a562-57edc5c3074c

Why it works: the first thing seen is the footage, and the count of visible controls is two or three. The tools are one pull away and stay where they were left. A greyed tile (Future Pro's "Weight") shows a tool exists without making it work everywhere.

### 2. Tools that carry their own state in the label

A control's label says what it is set to, so the user does not have to open it to find out.

- Netflix: the bottom row reads "Clip", "Speed (1x)", "Episodes", "Audio & Subtitles", "Next Ep.". The speed tool states the current speed in brackets. https://mobbin.com/screens/e400c660-3c54-4a58-838e-1801aa1a1d3a
- Fabric: a "Playback" panel under the video with "Loop" and a switch, then "Speed" with "1.25x" at the right and a slider with slow and fast icons at its ends. https://mobbin.com/screens/1f1176ff-444e-472b-92af-2ac5901b711d
- Garmin Connect: each chart's title is a drop-down ("Pace" with a chevron, "Heart Rate" with a chevron), so the title is both the label and the picker. https://mobbin.com/screens/8d6c0d78-61c7-44b5-9e3f-d060c1bc1faf

Why it works: a row of bare icons has to be learned. A row of words with values can be read. On a result screen opened for the first time this is the difference between "a dozen controls" and "five facts about what I am looking at".

### 3. A layers list with an eye on each row

Things drawn on top of the image are listed by name, each with a show or hide toggle.

- Photoroom: a "Layers" sheet with rows "Person", "Shadow", "Graphics", "Graphics". Each row has a thumbnail, an eye icon and a drag handle. "Done" closes it. A single eye icon also sits in the top bar. https://mobbin.com/screens/5028f8e0-1b7d-4cbb-a4d4-30aa666d8598
- TikTok cutout tool: one eye icon at the right edge under the preview that shows or hides the effect while the tool row stays put. https://mobbin.com/screens/282712f5-77b2-41b7-a2ef-97fb57c119cd
- Fabric: four icons on the video's top edge, pen, comment, a struck-through eye that hides all annotations, and settings. https://mobbin.com/screens/1f1176ff-444e-472b-92af-2ac5901b711d

Why it works: an eye is understood without a legend, and a named list tells the user how many overlays exist. The single "hide everything" eye (TikTok, Fabric) answers the most common wish, to see the raw video for a moment.

### 4. Scrubbing shows what you are about to land on

While the thumb is dragged, the player shows frames, not only a time.

- Tubi: five thumbnails in a strip above the scrubber. The middle one is outlined and labelled "06:18". https://mobbin.com/screens/196b719f-f54e-49bb-b193-38d7dc6c4df4
- Premier League (cited in round 2, same screen): one thumbnail floats above the thumb. https://mobbin.com/screens/162580a8-b0c7-4cb9-805e-50fdb7b0edfd
- TikTok brush tool: while a finger draws on the frame, a magnified copy of the area under the finger appears in the top-left corner. https://mobbin.com/screens/1a1dcf21-6f28-4d0d-890f-9d096d1a1bbd
- MasterClass: a "MOMENTS" button sits beside the scrubber and opens named points to jump to. https://mobbin.com/screens/d7c39487-1fb8-4171-8efe-5dfc2a638d87

Why it works: a lift is two or three seconds long and the frame that matters is one of about a hundred. Neighbouring frames in a strip let the user pick it by eye. The loupe solves the finger covering the thing being looked at.

### 5. Speed as a short notched slider, with loop next to it

Speed is a slider with a handful of named stops, shown in a sheet over the paused video.

- Liven: sheet "Playback speed", "Select how quickly you'd like to listen to your content", six stops printed above a notched track: "0.5x 0.7x 1.0x 1.2x 1.5x 2.0x". https://mobbin.com/screens/faab3d56-ef50-43dd-8d40-d8605e526a4c
- Fabric: "Loop" switch directly above the speed slider. https://mobbin.com/screens/1f1176ff-444e-472b-92af-2ac5901b711d
- Runna: the system player, where a "..." button opens "Playback Speed", "Audio", "Subtitles". Speed is two taps deep. https://mobbin.com/screens/1b418704-bf93-40b6-a428-2dd3fab65f82

Why it works: named stops are quicker than a free slider and the whole range is visible at once. Loop belongs with speed, since slow motion on a short clip is watched several times. Runna's version shows the cost of using the system menu: the control is hidden and stops at 0.5x.

### 6. A chart tied to the position, with a bubble and two headline numbers

The chart sits under the main view. Dragging on it moves a line with a value bubble, and the main view follows.

- AllTrails: map on top, and in the bottom sheet a small elevation chart with a round handle. The handle's position is also a dot on the trail on the map. A play and pause slider sits under the chart. https://mobbin.com/screens/f2edfe2b-4ca2-4233-9ecf-3dbdf9fd8f58
- Oura: a heart-rate chart with a vertical scrub line and a bubble "162 bpm". Under it a collapsible card "HEART RATE SUMMARY, Most time in Zone 4". https://mobbin.com/screens/83208126-a5f9-440f-9005-de2b03211350
- Strava: "Pace" chart with a scrub line and a bubble "5:27 /km, 7.44 km", then plain rows "Avg Pace 6:28 /km", "Fastest Split 5:13 /km". https://mobbin.com/screens/f3cece08-a7ce-43b4-910b-7698f3cac1ee
- Garmin Connect: above each chart two numbers with labels, "12:36 /mi Average" and "7:45 /mi Best", and a "Time / Distance" switch for the x-axis. https://mobbin.com/screens/8d6c0d78-61c7-44b5-9e3f-d060c1bc1faf

Why it works: the two numbers give the answer before the chart is read. The bubble makes the chart a second scrubber. AllTrails shows the full version: one handle, two views that move together.

### 7. Gestures taught on the pause screen, modes taught on first entry

Hidden gestures are printed over the paused video. A new mode gets one card the first time it is opened.

- Ladder: the paused state dims the video and prints "Paused", a large play button, "PREVIOUS, Swipe" with arrows on the left, "NEXT, Swipe" on the right, and "Replay, Double Tap". https://mobbin.com/screens/4f7017d2-a805-4fcb-9024-23edfc6e4617
- Halide: a card on first entry to manual mode. "MANUAL MODE", "Welcome to Halide's powerful Manual Mode. In Manual Mode, you have full control over ISO and Shutter Speed.", then three rows each with a gesture drawing: "Shutter Speed, Swipe up or down to adjust shutter speed.", "ISO, Swipe left or right to adjust ISO.", "Zebra Stripes and more". Button "Continue". https://mobbin.com/screens/cbc14b12-f037-45fd-a259-99b63d6e44c8
- Gmail video call: a small tooltip pointing at the pin icon, "You can double-tap to pin up to 3 people at a time. This only affects what you see." https://mobbin.com/screens/90fc7df6-c312-4c3a-b514-f24422f5fc8a

Why it works: the lesson arrives when it can be used, not in onboarding. Ladder's legend costs no extra screen because pause already dims the video. Halide keeps its card for the advanced mode, so a beginner never sees it.

### 8. Trim with the length printed on the strip

The trim screen is a filmstrip with two handles. The selected length is shown as a number on or beside the strip.

- X: "Trim" with a filmstrip, chevron handles, and a "2.2s" badge on the selected range. https://mobbin.com/screens/ca938947-0905-4fa9-8790-0b9c6416ff8d
- Polarsteps: "Trim", the video above, a filmstrip with handles, and a tick scale under it labelled "0:00", "0:06", "0:12". "Done" top right. https://mobbin.com/screens/12c19481-4ca7-4f5a-9b65-ca4e2ca07069
- Snapchat: "Trim Snap" with "15.1s" printed above the strip, a yellow playhead, pause at the left and a tick button at the right. https://mobbin.com/screens/23530e7a-3190-42c7-8d52-6b203ab49c11
- Garmin Connect, "Trim Activity": rows "Total Time 7:07", "Trim Start 1:00", "Trim End 8:07", a pace chart with the cut parts shaded, the stats that will result ("11:41 /mi Avg Pace", "0.61 mi Distance"), then "Save" and "Reset". https://mobbin.com/screens/83b9b1e9-e59e-4946-975f-fe01ce823858

Why it works: the number tells the user when they have cut enough. Garmin goes further and shows the consequence of the trim before it is saved, which is the idea Catchline can use: a shorter clip is a shorter wait.

### 9. Compare as two labelled halves with one number each

Thin evidence in this round: no two-video compare screen was returned. The nearest are stills.

- Opal: "Before Opal" and "After Opal" side by side, each a small bar chart with one large figure above it, "6h 32m" and "1h 49m". https://mobbin.com/screens/aa59fc65-fff7-4fa0-8d67-32ede1ed2d85
- Noom: two photos side by side under small caps labels "TODAY" and "YOU IN 30 YEARS". https://mobbin.com/screens/04ff3e32-9b8a-4a80-b661-0235f0b65dcb

Why it works: the labels and the two figures carry the comparison. The pictures confirm it. This agrees with the round 2 finding (Hers): compare the number, not the pixels.

## What Catchline should do

Ordered by expected effect on the first lift.

1. **Open the result on the video with the bar path and nothing else to learn.** (Pattern 1.) On first open of a result: the clip loops at half speed with the bar path drawn, joint lines off. On screen: a close button, a share button, and a collapsed sheet at the bottom showing one line, "PEAK BAR SPEED 1.82 m/s · AI estimate", with a grabber above it. Play, pause and scrub are on the video itself (tap to pause, drag along the bottom edge). Everything else moves into the sheet. This takes the visible control count from about twelve to three.

2. **Put the dozen controls in the sheet as labelled tiles that state their value.** (Patterns 1 and 2.) Pulled up, the sheet shows two rows of square tiles, 4px radius, icon over word, in the Future Pro layout:
   - Row 1: "PATH · ON", "JOINTS · OFF", "SPEED · 0.5x", "LOOP · ON"
   - Row 2: "FRAME BY FRAME", "BAR SPEED CHART", "COMPARE", "SAVE VIDEO"
   A tile that cannot work on this lift is greyed with a reason under it ("COMPARE · needs 2 lifts"). The sheet remembers whether it was open.

3. **Replace separate overlay switches with one layers list and one hide-all eye.** (Pattern 3.) An eye icon on the video's top edge hides every overlay while held, and toggles on tap. Long-press or the "PATH" tile opens "Layers": rows "Bar path", "Joint lines", "Bar speed label", "Plate marker", each with an eye. The share video uses whatever is switched on.

4. **Make frame stepping a mode with a filmstrip.** (Pattern 4.) Tapping "FRAME BY FRAME" pauses and shows a strip of seven neighbouring frames above the scrubber, the middle one outlined in red with its time ("0.64 s"). Swiping the strip moves one frame per thumbnail. Two buttons at the ends step a single frame. While a finger drags the bar-path point (if marker editing stays), show the TikTok loupe in the top corner.

5. **Speed as four stops, slow by default.** (Pattern 5.) A notched slider in the sheet: "1x · 0.5x · 0.25x · 0.125x". The first result opens at 0.5x with loop on. The stops are printed above the track as in Liven. No stop faster than 1x.

6. **Tie the bar speed chart to the video.** (Pattern 6.) "BAR SPEED CHART" expands the sheet to half height. Above the chart two figures in the Garmin layout: "1.82 m/s Peak" and "0.64 s Time to peak". Dragging on the chart moves a vertical line with a bubble ("1.40 m/s") and the video follows frame for frame, with the current point marked on the bar path as AllTrails marks the trail.

7. **Teach gestures on pause, once.** (Pattern 7.) The first three times the video is paused, print over the dimmed frame: "Drag to scrub", "Tap left or right edge: one frame", "Pinch to zoom". After that, show nothing. No tutorial card before the first result.

8. **Print the length and the wait on the trim strip.** (Pattern 8.) On `/capture/trim`: a badge on the selected range ("4.2 s"), a tick scale under the strip, and one line under it that changes with the handles: "About 35 s to track" for a short range, "About 1 min 20 s to track. Trim to one lift to make it quicker." for a long one. The Track button stays where it is.

Later, not for the first lift: Compare as two halves labelled with the date and one figure each ("TODAY 1.82 m/s", "12 NOV 1.71 m/s"), per pattern 9 and the round 2 notes.

## What to avoid

- **A multi-track editor timeline.** Instagram's editor (https://mobbin.com/screens/6ce460c6-5aa8-4009-8f77-f968f4350732) and Edits (https://mobbin.com/screens/ef2b2a54-da61-4c0b-9d22-9c2b8d356541) stack video, audio, text and sticker tracks under the preview. Catchline has one clip and overlays that are computed, not placed. A track view would suggest the lifter has editing to do.
- **Speed hidden in the system menu.** Runna and Moonly use the iOS player's "..." menu, which lists 0.5x to 2x (https://mobbin.com/screens/7da9d94d-dc40-4f54-b78d-329263982cad). For a lift, 0.5x is the fastest useful slow speed, and the control must be visible.
- **Landscape-only chrome.** Netflix, Tubi and MasterClass lay their controls out for a phone held sideways. Lifts are filmed and shared upright. Borrow the labelled row and the filmstrip, not the layout.
- **A heavy skeleton.** Noom's body scan draws thick green bones and large white joints across the whole body with a tick in the middle (https://mobbin.com/screens/047026d6-2957-4053-b44b-a4cab362dfac). It suits a pass or fail check. On a lift it would cover the athlete and the bar, and green is outside Catchline's palette. Thin bone-white lines, red for the bar path only.

## Searches run

All `search_screens`, platform iOS.

1. "sports video analysis screen with skeleton or motion path overlay drawn on the video" (deep, 14). No analysis apps. Useful results were Future Pro, Ladder, Slopes and Noom's body scan.
2. "video player with frame-by-frame scrubber and slow motion playback speed control" (deep, 14). No true frame stepper found. Speed sheets and scrub previews only.
3. "video editor trim screen with filmstrip timeline and start and end handles" (standard, 12)
4. "side-by-side comparison of two videos or two photos with a before and after view" (standard, 12). Mostly off-topic. No two-video compare.
5. "workout or run detail with a chart under a map or video, where scrubbing the chart moves a marker" (deep, 12)
6. "video or photo editor with layer visibility toggles and a tools drawer that hides advanced controls" (deep, 12)
7. "golf swing, tennis or running form analysis video with lines and angles drawn on the athlete" (standard, 10). Nothing relevant. Confirms the round 2 note that these apps are not on Mobbin.
8. "first-time tooltip or coach mark explaining controls on a video player or camera screen" (deep, 12)

Not found: a frame-by-frame stepper with single-frame buttons, a drawing-on-video tool with angle measurement, or a chart placed directly under a playing video. Changes 4 and 6 combine seen parts (Tubi's strip, AllTrails' linked handle) and are not copies of one screen.

## Saved images

In the private research folder, under `img/`.

| File | Pattern |
|---|---|
| player-futurepro-1.jpg | 1. Expanded tool sheet with labelled tiles |
| player-slopes-1.jpg | 1. Bottom card with Replay, Compare, AR |
| player-tiktok-1.jpg | 1. Labelled tool row with a fold-away chevron |
| player-netflix-1.jpg | 2. "Speed (1x)" in the label |
| player-fabric-1.jpg | 2, 3 and 5. Loop switch, speed slider, hide-annotations eye |
| player-photoroom-1.jpg | 3. Layers list with eye toggles |
| player-tubi-1.jpg | 4. Filmstrip above the scrubber |
| player-masterclass-1.jpg | 4. "MOMENTS" beside the scrubber |
| player-liven-1.jpg | 5. Notched speed slider with printed stops |
| player-alltrails-1.jpg | 6. Chart handle linked to a marker on the map |
| player-oura-1.jpg | 6. Scrub line with value bubble |
| player-strava-1.jpg | 6. Scrub bubble and stat rows |
| player-ladder-1.jpg | 7. Gesture legend on the paused screen |
| player-halide-1.jpg | 7. First-entry card for an advanced mode |
| player-x-1.jpg | 8. Trim strip with a duration badge |
| player-polarsteps-1.jpg | 8. Trim strip with a time scale |
| player-garmin-1.jpg | 8. Trim that shows the resulting stats |
| player-noom-1.jpg | Avoid. Heavy skeleton overlay |
