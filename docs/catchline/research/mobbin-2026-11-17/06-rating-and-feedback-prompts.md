# 06. Rating and feedback prompts (Mobbin, 17 Nov 2026)

The most useful thing: a two-button pre-prompt ("are you enjoying push?" / "not really" / "yes") shown after a good result, where "yes" leads to the system rating sheet and "not really" leads to a short feedback form. It costs one small sheet and keeps unhappy users out of the App Store.
Second: Alta's one sentence, "We are a small team of 7 trying to build the best closet app, so a rating goes a really long way!", is the best "why" seen. Catchline can say the same thing more truthfully.

## Patterns

### 1. A yes or no question before any stars
A small sheet asks whether the user likes the app, with two buttons of near-equal weight. No stars yet.

- pushr (a fitness app with a similar plain look): bottom sheet "are you enjoying push?", "your feedback is important to us.", buttons "not really" and "yes". https://mobbin.com/screens/e5c427f1-95af-4e4b-a365-810a18760d01
- ElevenLabs: "Enjoying ElevenLabs?", five stars as decoration, "Your feedback means a lot to us. Let us know what you think!", buttons "Yes, I love it" and "Not really". https://mobbin.com/screens/3618714a-f02b-4f50-9bc1-fa604e548d82
- Preply: full screen "Are you loving Preply?", "We value your thoughts. Tell us how you feel about the Preply app", buttons "It's great!" and "It could be better", with "Skip" top right. https://mobbin.com/screens/bb6607f5-7c59-44c9-b76e-a07e474ec463
- Revolut Business: "Like the Revolut Business mobile app?", buttons "Not really" and "I like it" with thumb icons. https://mobbin.com/screens/55397a32-02d7-44b8-b375-c2af81e9fe09
- pillowtalk: a compact card "enjoying pillowtalk?", "not yet" and "yes", with "ask me later" under them. https://mobbin.com/screens/5b614370-d056-4ee2-bb15-41c14f4778bd

Why it works: iOS allows the system rating sheet only a few times a year per user. The pre-prompt spends that allowance on people who have just said yes.

### 2. Two doors on one sheet: rate, or tell us
The sheet offers the App Store and a feedback route as two labelled buttons, so there is no second step.

- BitePal: "Enjoying BitePal?", "Rate us or share your feedback and help us make it even better!", buttons "Give us 5 stars on App Store" and "Share your feedback". Shown over a logged meal. https://mobbin.com/screens/e49f10a3-690d-4d1f-a4e2-506835847060
- Wispr Flow: "Enjoying Flow?", "Please support Flow by rating us on the App Store or sharing feedback.", buttons "Rate us 5 stars" and "Leave feedback". https://mobbin.com/screens/9e316788-339b-4380-9fa9-6ad6f25c138a
- Coinbase: "Thank you! Show some love by rating us on App store.", "Tap to rate" with five stars, "Rate us on App store" and "Maybe later". https://mobbin.com/screens/65aeecb7-9257-4f0e-9565-8a6652430e57

Why it works: the unhappy user has somewhere to go that is not a one-star review. Note the wording risk under "What to avoid".

### 3. In-app stars that route by score
The user taps a star count inside the app. High scores are sent on to the store; low scores open a text box.

- Fabric: an inline card in the home feed, "Enjoying Fabric?", "Tap a star to let us know how we're doing :)", five grey stars, "Maybe later". The card disappears after rating. https://mobbin.com/flows/2df9c732-8ac9-4748-8495-7957293f88f0
- DICE: after five stars, "Ace - anything to add?" with a "Let us know" box and "DONE", then a sheet "Thanks Jane. Keep telling it like it is and stay tuned for improvements." Entry is from settings rows "Rate the app" and "Give us your feedback". https://mobbin.com/flows/2aa9ef71-e418-42c1-b787-38bece0fc1ab
- Alta: modal "How are we doing?" with five stars and "Submit". https://mobbin.com/screens/9439f0c3-5f40-47a2-87f1-b3aa9a29dfad
- Headway: stars on a result card ("How was this summary? Rate it to get better recommendations"), then reason chips "Thanks! Why did you like it?", then a full screen "Do you like us as much as we like you?" asking for a store review. https://mobbin.com/flows/2e3a1ab3-8985-4f60-84df-3a1d382d4797

Why it works: a star tap is quicker than reading two buttons, and the score itself decides the route.

### 4. One honest sentence on why it matters
The prompt says who is asking and what the rating does.

- Alta: "We are a small team of 7 trying to build the best closet app, so a rating goes a really long way!" between two laurel marks. https://mobbin.com/screens/9439f0c3-5f40-47a2-87f1-b3aa9a29dfad
- Lovi: a note with a photo and signature, "Love to see you here. Do you love us back?", "We care about what you think - not just how many stars you review us with. If you have a minute to leave some thoughts on Lovi, just tap below.", signed "Sofia, Lovi Support Team". Buttons "I'm in" and "Maybe later". https://mobbin.com/screens/4d2c3ed1-6eda-479a-886b-fca7b724b6cf
- Headway: "We'd love to get a detailed review from you on the App Store. Help others grow with Headway!" with two ticks, "It'll take less than a minute" and "1-3 sentences are enough". https://mobbin.com/flows/2e3a1ab3-8985-4f60-84df-3a1d382d4797

Why it works: a named, small team is easier to help than a brand. Saying how long it takes removes the main objection.

### 5. Ask at a completed moment
The prompt is tied to something the user just finished, not to a launch count.

- BitePal: over the result of a logged meal. https://mobbin.com/screens/e49f10a3-690d-4d1f-a4e2-506835847060
- Ahead: over the lesson map after a completed step, with a speech bubble "Great job!"; "How is it going, Sam? Enjoying your experience with Ahead?", buttons "Yes" and "Not sure yet". https://mobbin.com/screens/c53659e5-340a-467d-a312-cdd19285e38c
- stoic.: on the completion screen "Good job! You've completed the first Lesson", a card "Did you enjoy this journal?" with "No", "A little", "Yes" and "Skip & Finish". https://mobbin.com/screens/31bed567-c8fd-4a75-9a05-3a58109fc9cb
- Coinbase: the headline starts "Thank you!", following a completed action. https://mobbin.com/screens/65aeecb7-9257-4f0e-9565-8a6652430e57

Why it works: the answer reflects a real, recent experience, and the interruption lands when the task is over.

### 6. A soft exit that is not "no"
Every good prompt has a way out that does not record displeasure.

- pillowtalk: "ask me later". https://mobbin.com/screens/5b614370-d056-4ee2-bb15-41c14f4778bd
- Fabric and Coinbase: "Maybe later". Ahead: "Not sure yet". Preply: "Skip". Links as above.

Why it works: people who are busy are not unhappy. Without a third exit they either dismiss in annoyance or get routed to a feedback form they did not want.

### 7. Feedback forms: one text box, an optional screenshot, and a line on what is sent
The bug and feedback forms worth copying are one screen.

- ChatGPT: "Report bug", a text box with a counter ("49 / 2000"), a switch "Include screenshot in report" with the screenshot previewed, "Send". Line: "Any information you share may be reviewed to help improve ChatGPT." https://mobbin.com/screens/bf58c790-368b-4cfa-8e9d-cd8f6b11c5ff
- Bevel: "Report issue", "Please include the following details in your report: Brief detail about the issue, Additional photo (optional)", a text box, two photo slots, "Submit". https://mobbin.com/screens/d93983f1-268e-4656-ba9e-23a0885ced2e
- Edits: "Report technical problem", placeholder "Briefly explain what happened or what isn't working.", a screenshot thumbnail already attached, "Screenshot" and "Upload" above the keyboard. https://mobbin.com/screens/07654b5b-385e-4007-ac6c-0cbe599745d7
- The New York Times: "Report a Bug" with email, description, "Add a file", and "Some diagnostic information will be sent to The New York Times." https://mobbin.com/screens/18a1b158-a4e0-4d4e-a368-df56d80bc9f8

Why it works: the screenshot does the describing. Saying what diagnostic data goes with the report keeps trust, which matters for an app whose promise is that video stays on the phone.

### 8. Reason chips for a quick "what went wrong"
A handful of tappable reasons above the free text, so feedback can be given without typing.

- Vinted: five faces, then "What are the reasons for the rating you gave us?" with chips such as "Shorter upload process", "Faster loading form", "Uploading photos", "Other", then "Tell us more." https://mobbin.com/screens/bbc60f95-5b40-4bb6-a4dc-a29f677d3c33
- Meta AI: "Describe the problem", then "Select any issues that apply" with chips, "Provide screenshots", "Next". https://mobbin.com/screens/4e0750fe-294e-43e3-9096-ebc7dbea8208
- OpenTable: "Help us improve. Why was this a poor response?" with six chips and "Send feedback". https://mobbin.com/screens/e6d057f7-1278-4ccc-887a-9d0f7f6e23c2
- adidas Running: "HOW DO YOU LIKE THE FEATURE?" with five faces, then "TELL US HOW WE CAN IMPROVE" and the honest note "we can't directly respond to feedback given here". https://mobbin.com/screens/721ad342-29e9-4caf-8786-7811e6d2ddcc

Why it works: chips turn complaints into counts. For Catchline the chips can match the known failure points.

## What Catchline should do

1. **A two-button pre-prompt after a good track (patterns 1, 5, 6).** Trigger: the user's second or third lift that produced a bar path, a few seconds after they have played it back or just after a share completes. Never on the first lift, never after a failed track or a lift with no bar path. Bottom sheet, black, bone text: title "IS CATCHLINE WORKING FOR YOU?", buttons "YES" and "NOT REALLY", text link "Ask me later". Show at most once per app version.
2. **"Yes" explains, then calls the system sheet (pattern 4).** One more line before the system prompt: "Catchline is built by one person. A rating is the main way other lifters find it." Button "RATE CATCHLINE". Then the system rating sheet. If the copy says one person, it must be true at the time.
3. **"Not really" opens chips matched to the measured problems (pattern 8).** Title "WHAT WENT WRONG?" Chips: "No bar path", "Path was off", "Took too long", "Hard to film", "Confusing player", "Other". One optional text box "Anything else?" Button "SEND". Then "Thanks. This goes straight to the person who builds it." A quarter of finished lifts get no bar path and the first track takes about a minute, so these chips will produce numbers for the two known problems.
4. **Put the same chips on a weak first result (pattern 8).** When a track ends with no bar path, the result screen gets a quiet row "Tell us what happened" opening the same sheet. This catches the unhappy first-lift users at once and before any rating ask.
5. **A one-screen "Report a problem" on the You tab (pattern 7).** Text box "What happened?", a switch "Include a screenshot" (on, with preview), "SEND". Under it: "Sends your message, app version and phone model. Your video is not sent." Keep the existing "Send this clip" on failed lifts separate and opt-in.
6. **Standing rows on the You tab (pattern 3, DICE).** "Rate Catchline" (opens the App Store review page, which has no yearly limit) and "Send feedback". These serve people who go looking.
7. **Thank and close (DICE).** After any feedback: one sheet, "THANKS", "Read by a person. Fixes ship in updates.", "CLOSE". No follow-up ask.

## What to avoid

- **Buttons that ask for a score**: "Give us 5 stars on App Store" (BitePal), "Rate us 5 stars" (Wispr Flow). Asking for a specific rating is poor form and risks App Review trouble. Ask for a rating, not five stars.
- **In-app stars that only forward high scores to the store** (the routing in pattern 3). It works, but it is the pattern most likely to be read as review gating. The yes or no question in pattern 1 gets the same result with less risk, and the "Rate Catchline" row stays open to everyone.
- **A rating ask inside onboarding, before any value** (QUITTR: "Give us a rating", "This app was designed for people like you.", with testimonials, before the user has done anything: https://mobbin.com/screens/a5ee666c-6601-4e4d-a78b-9be633646cd7). For Catchline this would land before the first lift, where a third of installs already drop.
- **Long survey forms** (Realtor.com's multi-question form with dropdowns and required fields; Binance's three required dropdowns). One box and chips is the limit.

## Searches run

1. `"Enjoying the app?" prompt asking yes or no before the App Store rating` (deep, 16)
2. `screen explaining why a rating helps a small team, with a leave a review button` (deep, 14). Only Alta, Lovi and QUITTR matched the intent; the rest were order and feature rating forms.
3. Flow: `rating the app: enjoying prompt, then App Store rating or feedback form` (5 flows: Headway x2, Blinkist, DICE, Fabric)
4. `report a bug or send feedback form with category, message and screenshot attachment` (deep, 12)
5. `after tapping not really: sorry to hear that, what can we improve feedback sheet` (deep, 10). Did not return the follow-up to an "enjoying?" prompt. It returned cancel-reason and answer-feedback sheets, which were used for the chip pattern only.

Not found: the screen an app shows directly after "not really" on an enjoyment prompt; any capture of the iOS system rating sheet in context; a rating prompt in a strength or video-analysis app other than pushr. Timing rules (how many sessions before asking) cannot be read from screenshots; the trigger in recommendation 1 is a judgement.

## Saved images

In the private research folder, prefix `rating-`:

- `rating-pushr-1.jpg`, `rating-elevenlabs-1.jpg`, `rating-preply-1.jpg`, `rating-pillowtalk-1.jpg`: pattern 1 (pillowtalk also pattern 6)
- `rating-bitepal-1.jpg`, `rating-wisprflow-1.jpg`, `rating-coinbase-1.jpg`: pattern 2 (and the "5 stars" wording to avoid)
- `rating-fabric-1.jpg`, `rating-dice-1.jpg`, `rating-headway-1.jpg`: pattern 3 (Headway also pattern 4)
- `rating-alta-1.jpg`, `rating-lovi-1.jpg`: pattern 4
- `rating-ahead-1.jpg`, `rating-stoic-1.jpg`: pattern 5
- `rating-chatgpt-1.jpg`, `rating-bevel-1.jpg`, `rating-edits-1.jpg`: pattern 7
- `rating-vinted-1.jpg`, `rating-metaai-1.jpg`: pattern 8
- `rating-quittr-1.jpg`: what to avoid
