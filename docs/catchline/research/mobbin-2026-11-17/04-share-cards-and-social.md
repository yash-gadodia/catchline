# 04. Share cards and share flows (Mobbin, 17 Nov 2026)

The most useful thing: the apps that get shared put the share card on the first screen after the result, already rendered, with one-tap named destinations under it (Hevy, Runbuds, Locket). Nobody asks the user to go and find a share button.
Second: no app seen prints an invite code on the card itself. The brand mark and the user's handle go on the card; the invite travels as a link button beside it (Future Pro) or in the copied text (Hevy).

Earlier notes (`27-mobbin-fitness.md`, section 1.12) already cover Runna's carousel, Future Pro's Guest Pass Link, Garmin's Share / Save / Copy, Hevy's first-workout card, NRC's badge and pushr. Those are cited again here only where a new detail was seen.

## Patterns

### 1. The share card is the completion screen
The finished card appears straight after the activity, with the destinations under it and a plain "Done" to leave. Sharing is the default next step, leaving is the second.

- Hevy: headline "Nice work!", sub-line "This is your 1st workout", a photo card with Duration, Volume and Sets, then "Share workout - Tag @hevyapp" and a row of Background, Stories, More, Workout Link, Copy Text. One blue "Done" at the bottom. https://mobbin.com/screens/db9dd20e-1263-4da0-88ef-4fdca528cc6a
- Centr: full-bleed photo, "Today's goals? Smashed, Alex!", workout name and time, two buttons "ADD SELFIE" and "SHARE". https://mobbin.com/screens/4b426134-f377-41f6-acc4-056a9e95092d
- Locket: "Your Rollcall was posted" with a tick, "Share with friends!", card carousel, then Messages, IG Story, Snapchat, More. https://mobbin.com/screens/059e218b-4570-43e1-984e-43c3ffdcd850
- Any Distance: the activity summary has an "Add to Story" button with the Instagram glyph in the top right corner, above the stats. https://mobbin.com/screens/35c88531-76a2-45d5-8b8f-1f2a919f199b

Why it works: the user is proudest in the first seconds after the result. The card is already made, so sharing costs one tap.

### 2. Named destinations, not the system sheet
A short row of app icons with labels (Story, Messages, TikTok), and the generic share sheet demoted to "More".

- Runbuds: three round buttons "Share", "Story", "Messages" under the card, a save icon top left. https://mobbin.com/screens/fe94dfd4-f381-45d1-9022-eb6c9b3fc813
- Locket "Time Travel" (a video): Instagram, TikTok, Messages, Snapchat in a row, then two wide buttons "Edit" and "Save". This is the closest match to Catchline's case because the thing shared is a video. https://mobbin.com/screens/9d8eed83-a829-4620-8d3c-d607c3491691
- Slopes: Save, Messages, IG Story, More. https://mobbin.com/screens/0332e3fd-e522-4239-a236-79b4f44f9ccf
- Runna: Story, Community, iMessage, Messenger, More, with "Save to device" as the wide primary and a "Saved image to device" toast. https://mobbin.com/screens/5e9a9149-03be-4f87-85e4-ea2baaee23e3

Why it works: the label tells the user where the piece will land and in what shape. "IG Story" is a promise that the format is right.

### 3. A swipeable set of ready-made card variants
Three to seven finished layouts in a carousel with page dots. The user picks by swiping, not by building.

- Runna: a route-line card, a big-numbers card with the plan tag "New To Running Plan | Week 2", a detailed card. "Tap card to edit" under the carousel. https://mobbin.com/screens/0d8088e6-2e9f-4bc7-8cbe-7ab42a1b9e4d and https://mobbin.com/screens/38619877-9e58-4538-bd66-d914c01021bc
- Hevy: seven dots; the second card is the exercise list "Leg day" with set counts and a muscle diagram. https://mobbin.com/screens/f20968aa-1f43-4ea1-8462-077041f2cf53
- pliability: a card carousel titled "Activity" with "Share your personalized stats and show how consistent you've been." and a row of background swatches plus an add-photo tile. https://mobbin.com/screens/056b480b-e560-468d-ba84-a01ba2e18055
- Strava "Month in Sport": a story-style recap ends on "Customize & share" with "Replay" under it, then a sheet with two card variants and Message, Strava Post, Save, More. https://mobbin.com/flows/38aaf14f-cd60-4348-bc6c-4caddcb33ac8
- WHOOP "SHARE DATA": a grid of thumbnails to pick from (Daily overview, Day strain, Weekly strain, Recovery, Weekly recovery, Sleep). https://mobbin.com/screens/efac5dc3-8695-4229-b61d-deb422ea33a5

Why it works: choosing between finished things is quick and feels like control. The default first card is good enough for people who do not swipe.

### 4. Transparent sticker as one of the variants
One variant is the stats on a transparent background, shown on a checkerboard, meant to be pasted over the user's own photo or video in Instagram.

- Bevel: "Share" with "Tag us @bevel.health", tabs for Overview, Nutrition, Summary, Stress, the card on a checkerboard labelled "TRANSPARENT", a "Customize" button, then Save image, Copy image, Share. Dark and light versions of the sticker. https://mobbin.com/screens/c32b800e-ddee-434f-a596-1ac206119e4f and https://mobbin.com/screens/b45b3515-f24a-45c6-873b-cdfdd20cd46c
- Slopes: the neighbouring card in the carousel sits on a checkerboard. https://mobbin.com/screens/0332e3fd-e522-4239-a236-79b4f44f9ccf
- Oura: the reverse approach. A background photo with "Add a sticker from below" and a tray of Readiness stickers. https://mobbin.com/screens/767c7e56-8c13-4ccf-baa0-d925fdbf8129
- Nike Training Club: "EDIT IMAGE" with a tray of brand stickers. https://mobbin.com/screens/1affa3b0-b600-4e7c-88a4-a5dd161e4a60

Why it works: "Copy image" plus a transparent sticker lets people keep their own edit and still carry the app's stats and mark. It serves the users who already have a posting style.

### 5. A small, fixed set of customise controls
Where editing exists it is three things at most: background, size or format, and which stat block.

- adidas Running: "CREATE IMAGE", a two-way toggle "Stories" / "Square", three source tabs (own photo, map, stock photos), "SHARE" top right. https://mobbin.com/screens/4204e224-d0c5-4197-a375-f47413fc1c66 and https://mobbin.com/screens/147d181e-3b8d-4054-a147-3d297499a159
- Ultrahuman: three tabs under the preview, Background, Size, Sticker; "Share Now" top right. https://mobbin.com/screens/73129ed6-ff84-46c7-8f4c-b87267292297
- Runbuds: the user's photo, a row of three stat-layout thumbnails to pick from, six colour dots, "Done". https://mobbin.com/screens/2ff2053e-7f98-4723-98eb-71725ab8a6ed
- Gentler Streak: two tiles only, "Add Photo" and "Default". https://mobbin.com/screens/845111bc-c398-4136-9a1e-4578b9eb1d38
- Perplexity: one toggle, "Show prev. close", then Copy Image and Download Image. https://mobbin.com/screens/bf6f870b-1e78-404c-944b-0769c8ee0606

Why it works: every control is a pick between previews. Nothing is typed, nothing is dragged.

### 6. Brand mark in a corner, user identity opposite, tag request off the card
The logo is small and fixed. The user's handle or name is on the card too. The "tag us" request is on the screen, not on the image.

- Hevy: logo bottom left, "@mobbin_samlee" bottom right, "Tag @hevyapp" in the line above the buttons. https://mobbin.com/screens/db9dd20e-1263-4da0-88ef-4fdca528cc6a
- Tonal: logo top left, "Free Lift", "430 lbs" volume and "3:27" duration bottom left, username and date in small caps under them. Buttons "Share" and "SAVE IMAGE". https://mobbin.com/screens/e5f5f99b-0d40-4ea2-930f-100fe66ee11f
- Slopes: "Made with Slopes" bottom right of the card; "@SlopesApp" as a chip above the card. https://mobbin.com/screens/0332e3fd-e522-4239-a236-79b4f44f9ccf
- Alma: a switch "Overlay Alma logo", off by default in the capture. https://mobbin.com/screens/83210b9f-9a77-4595-ab47-b10ec7d6e6f2

Why it works: the card reads as the user's post, with the app as a signature. A small mark is not cropped out; a large one is.

### 7. The invite rides beside the card, not on it
No screen seen prints a referral code on the shared image. The link is a second action on the same sheet.

- Future Pro: under the card and the Instagram, Facebook and More icons, one wide button "Guest Pass Link", which turns to "Link Copied". https://mobbin.com/screens/bf2ae115-910c-4564-8758-e3860b24459c and https://mobbin.com/screens/cd43ee2a-c5a6-4c1f-93c1-2d6f29224ef5
- Hevy: "Workout Link" and "Copy Text" sit in the same row as Stories. https://mobbin.com/screens/db9dd20e-1263-4da0-88ef-4fdca528cc6a
- Phantom: a "Follow on Phantom" line under the card. https://mobbin.com/screens/62a61315-b1ba-4d5f-921b-cad3810c516c

Why it works: a code on a picture cannot be tapped. A copied link or caption can go in the story's link sticker, the post caption or a message.

### 8. Milestones prompt the share, in the first person
Streaks, badges and personal records get their own share moment, worded as the user's sentence.

- WHOOP: day streak page with "8 more days to unlock your next milestone." and a wide outline button "SHARE DAY STREAK". https://mobbin.com/screens/f38f622f-5abd-4432-b5de-cf3fbc93b17a
- 5 Minute Journal: card text "I've journaled for 1 days in a row." and "SHARE". https://mobbin.com/screens/5e9256bc-653e-4a0a-ad0b-e23050997c56
- Cal AI: "Badge Unlocked", "First Drop", "Share Your Badge", "View All Badges", and a quiet opt-out "Not enjoying badge celebrations?". https://mobbin.com/screens/a4916474-2ab6-4e3c-8ccb-adf81735c3b7
- Strava: the You tab shows "Congrats! You just set your PR in the 1K." and a small "Share" button on the month block. https://mobbin.com/screens/d54eb1e6-1e9d-463e-9450-3e77f2b04136
- Garmin: an inline bar "Share this activity?" with a "Share" link and a tooltip "See our new sharing options." https://mobbin.com/screens/468fd306-e528-4ba3-9179-68e86d657607

Why it works: a record is a reason to post that an ordinary session is not.

## What Catchline should do

Catchline 4.0.5 already has a story preview with Instagram, TikTok and Save and a copied caption. These build on that. Check each against the current share screen first.

1. **Put the share preview at the end of the first-lift reveal (pattern 1).** After the first track finishes, the result screen shows the looping 9:16 clip with the bar path, then under it: `INSTAGRAM` `TIKTOK` `SAVE` and a text link "Open the player". Headline: "YOUR FIRST BAR PATH". Sub-line: "Lift 1. Tracked on your phone." On later lifts the player opens first and Share stays a button. This is the reveal the owner asked for and the share prompt in one screen.
2. **Add an "Invite link" button on the share sheet (pattern 7).** A full-width outline button under the three destinations: "COPY INVITE LINK". On tap it reads "COPIED" for two seconds. One line under it: "They get a month of Pro. So do you." Do not print the code on the video.
3. **Offer three ready variants, swiped (pattern 3).** Card 1: the video with path and speed (default). Card 2: the video with the path only and no numbers. Card 3: a still of the full bar path on black with load and lift name. Page dots, no editor. Caption under the carousel: "Swipe for other layouts".
4. **Add a transparent bar-path sticker (pattern 4).** A fourth variant on a checkerboard labelled "TRANSPARENT": the bar path line, peak speed and the Catchline mark, as a PNG. Buttons: "COPY IMAGE", "SAVE". For lifters who edit their own reels.
5. **Sign the piece like Tonal and Hevy (pattern 6).** Catchline wordmark small in one bottom corner; lift name and load ("SNATCH 80 KG") opposite; "AI estimate" stays wherever a number is shown. On the screen, not on the video: "Tag @catchline" (use the real handle).
6. **Two controls only (pattern 5).** A row of two toggles above the destinations: "Speed" on or off, "Joints" on or off. No colour pickers, no backgrounds; the design system has one look.
7. **Share prompt on a personal best (pattern 8).** When a tracked lift has the highest load for that movement, the lift row and the player show one line: "Heaviest snatch you have tracked." with a "SHARE" button. Wording stays factual; no badge art.
8. **Confirm where it went (pattern 2).** After Save: toast "Saved to Photos. Caption copied." After Instagram or TikTok returns: nothing more. The Runna toast is the model.

## What to avoid

- **A full sticker and text editor** (Oura's sticker tray, NTC's brand stickers, Instagram's own tools). Catchline's value is the overlay it already drew. An editor delays the post and Instagram has a better one.
- **Background swatches and gradients** (pliability, Ultrahuman, Runbuds colour dots). They break the black, bone and red system and make shared lifts look unlike each other, which weakens recognition.
- **Stock photo backgrounds** (adidas Running). The lifter's own video is the content.
- **Confetti and badge art** (Hevy's confetti, Cal AI's medal). Seen often, wrong for this brand. The bar path drawing itself on is the celebration.

## Searches run

1. `fitness app share workout summary card customise before sharing` (deep, 16)
2. `share to Instagram Stories sticker overlay with stats on photo` (deep, 16). Returned only Instagram's own story editor. Not useful.
3. `running app share screen with transparent sticker layout options and stat toggles` (deep, 14)
4. `year in review recap share card` (standard, 12)
5. Flow: `Strava sharing an activity to Instagram story` (4 flows). Only "Share month in sport" was relevant; the others are in-app posts and chat shares.
6. `export video with overlay, choose aspect ratio 9:16 and share to TikTok or Instagram Reels` (deep, 14). Returned only TikTok and Instagram composer screens. Nothing from a third-party app handing a video to them.
7. `health app customize share image: choose size, background, sticker, toggle which stats show` (deep, 12)
8. `workout tracker personal record achieved share screen` (standard, 12)

Not found: any Peloton, Strong or Nike Run Club share-card editor in these results; any app printing a referral code on the shared image; any third-party screen showing a direct "Share to TikTok" for a video other than Locket.

## Saved images

In the private research folder, prefix `share-`:

- `share-hevy-1.jpg`, `share-hevy-2.jpg`: patterns 1, 3, 6, 7
- `share-locket-1.jpg`: pattern 2 (video with Instagram and TikTok buttons)
- `share-runbuds-1.jpg`: pattern 2; `share-runbuds-2.jpg`: pattern 5
- `share-runna-1.jpg`, `share-runna-2.jpg`: patterns 2, 3
- `share-slopes-1.jpg`: patterns 2, 4, 6
- `share-bevel-1.jpg`, `share-bevel-2.jpg`: pattern 4
- `share-oura-1.jpg`: pattern 4 (and the editor to avoid)
- `share-adidasrunning-1.jpg`, `share-adidasrunning-2.jpg`: pattern 5
- `share-ultrahuman-1.jpg`: pattern 5
- `share-strava-1.jpg`, `share-strava-2.jpg`: pattern 3
- `share-whoop-1.jpg`: pattern 3
- `share-anydistance-1.jpg`: pattern 1
- `share-tonal-1.jpg`: pattern 6
- `share-futurepro-1.jpg`: pattern 7
- `share-garmin-1.jpg`, `share-calai-1.jpg`: pattern 8
