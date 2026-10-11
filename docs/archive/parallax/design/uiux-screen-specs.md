# ONE SIDE — Screen-level UI specification v1: Capture, Working, Result (bridge), No-bridge result, Tier-1 safety stop

# ONE SIDE — Screen-Level Specs (v1)

Four surfaces + the safety stop. Editorial identity (warm paper, ink, hairlines, serif display) holds everywhere; system behaviour (native sheets, safe areas, Dynamic Type ramps, keyboard physics, real haptic semantics) is adopted underneath it. Min target iOS 16.4 — the solid, glass-free build IS the design, not a fallback.

---

## 0. Shared foundations (all screens build on these)

### 0.1 Color tokens (hosted in `DynamicColorIOS` so theme flips happen at the UIKit layer)

| Token | Light (#FBF7F3 ground) | Dark (#15111B ground) | Rule |
|---|---|---|---|
| `bg` | #FBF7F3 | #15111B | full-bleed, painted under status bar + home indicator; never letterboxed |
| `surface` | #FFFFFF | #1E1827 | cards |
| `surfaceElevated` | #FFFFFF | #251E31 | formSheets/modals only |
| `ink` | #3A3340 | #EDE7E2 (display serif at 100%; body at rgba(237,231,226,0.87)) | never #FFFFFF or raw #FBF7F3 on dark |
| `soft` | #6F6880 | #A79FB5 | secondary text, 7.3:1 dark |
| `mute` | #B7B0C2 | #8E8699 | DECORATIVE ONLY in light (1.97:1) — hairlines, ghost glyphs, volatile transcript tail. Words in mute-register use `muteReadable` |
| `muteReadable` | #8F87A0 | #8E8699 | eyebrows/metadata that carry meaning |
| `hairline` | #B7B0C2 @ 24% | rgba(237,231,226,0.08); 0.12 on `surfaceElevated` | 1px, the only depth system; no shadows |
| `coralFill` | #FF8E7A→#EF6A53 gradient | #EF6A53 (fill only, never text) | the user / Speak pill |
| `coralText` | #BE452C (4.83:1) | #F09C8B (8.7:1) | coral when it carries words ≤24pt |
| `violetFill` | #9D95F5/#7064E6 | fills/rings only | partner / AI |
| `violetText` | #5F53D6 (5.33:1) | #A79FF0 (7.9:1) | |
| `greenText` | #1F7D62 (4.73:1) | #5FBF9F (8.4:1) | agreement ONLY, never decoration |

Semantic-color law: coral only ever means *you*, violet only *partner/AI*, green only *agreement*. Never two accents on one element; never any accent as decoration. Color-code containers (3pt left rule, eyebrow, hairline) — body prose stays ink; inside AI-written cards, tint only the payload feeling-words (`coralText` in the user's card, `violetText` in the partner's card), sentence frame in ink.

Dark washes: single vertical gradient top stop #1A1322 (coral-leaning results: #1D141A) → #15111B by 45% of screen height; nothing on the dark screen above HSL L14 except text, hairlines, and the pill fill. Follow system appearance; no in-app toggle; never swap theme mid-capture (apply on next screen).

### 0.2 Type roles (one `<AppText role>` component; serif floor 20pt is a hard rule)

| Role | Font | pt / lineHeight px / letterSpacing pt | Ramp / cap |
|---|---|---|---|
| display-q ("What happened?") | InstrumentSerif-Regular | 34 / 38 / −0.41 | largeTitle / 1.3 |
| display-verdict ("There is no bridge here.") | InstrumentSerif-Regular | 30 / 34 / −0.36 | title1 / 1.3 |
| bridge-sentence | InstrumentSerif-Italic (own family name, never synthesized) | 26 / 32 / −0.31; hung open-quote `marginLeft:-10` | title1 / 1.3 |
| card-head | InstrumentSerif-Regular | 22 / 26 / −0.26 | title2 / 1.3 |
| ui-body (vent text, card bodies, let-go line) | HankenGrotesk-Regular | 17 / 24 / 0 | body / UNCAPPED |
| ui-secondary | HankenGrotesk-Regular | 15 / 21 / 0, soft | subheadline / 1.5 |
| btn-primary | HankenGrotesk-SemiBold | 17 / 22 / +0.2 | 1.35; pill uses `minHeight`, never fixed height |
| btn-quiet | HankenGrotesk-Medium | 15 / 20 / +0.1 | 1.35 |
| chip | HankenGrotesk-Medium | 14 / 18 / +0.1 | 1.2 |
| eyebrow | SpaceMono-Regular | 11 / 16 / +0.88, UPPERCASE, muteReadable | caption2 / 1.35 |
| privacy/footnote | HankenGrotesk-Regular | 12 / 16 / +0.1, SOFT never mute | 1.35 |

Fonts embedded via the expo-font **config plugin** (6 static TTFs; Hanken as extracted statics, not the VF) so the 34pt question exists at first frame. Fixed display strings get widow control: ` ` joining the last two words ("bridge here."); post-process AI headings the same way. Never animate scale on serif display text (translateY/opacity only; 0.97→1.0 max if unavoidable). All display sizes integral.

### 0.3 Spacing & shape
- 4pt base grid; **20pt screen gutters**; **28pt between cards**; whitespace, not hairlines, separates content inside a card.
- All radii ≥12 get `borderCurve:'continuous'` via a `squircle(radius)` base style.
- Concentric rule as a tokens helper: `concentric(parentRadius, inset) = parentRadius − inset`. Card 28 → inset-12 button 16 → inset-8 chip 8. Speak pill is a stadium (radius = height/2 = 32) — always concentric-safe.
- Hit targets: every tappable ≥44×44pt (visible chip may be 32pt tall; pad the Pressable / hitSlop, never the glyph). The inline '+' = 20pt glyph + hitSlop 12 all sides.

### 0.4 Motion tokens (the only springs in the app; Reanimated duration/dampingRatio mode)
- `spring.smooth` = {duration: 500, dampingRatio: 1} — layout/appearance
- `spring.snappy` = {duration: 350, dampingRatio: 0.85} — small elements
- `spring.gentle` = {duration: 700, dampingRatio: 1}
- Sole sub-0.85 exception: Copy-unlock tick {duration: 300, dampingRatio: 0.7}, scale 1.0→1.02→1.0.
- Fades: `withTiming` 200ms `Easing.out(Easing.quad)`; emphasis fades 250–350ms; **exits always faster than enters** (150–200ms).
- Entering presets: only `FadeIn`/`FadeOut`/`FadeInDown.withInitialValues({transform:[{translateY:8}]})` (travel capped 8–12px). BANNED: BounceIn, Zoom, Flip, LightSpeed, Stretch, Pinwheel, Roll; dampingRatio <0.7 anywhere; bounce on serif type ever.
- Leave `reduceMotion: ReduceMotion.System` default everywhere; plus a live a11y zustand store (reduceMotion, reduceTransparency, boldText, screenReader — fed by AccessibilityInfo events, since `useReducedMotion()` is start-time-only). Under RM: every enter → FadeIn 200ms zero translate; staggers collapse to two groups (hero at 0, rest at 200ms); all loops (dot breathing, waveform, caret) render static; expo-router transitions → `animation:'fade'`.

### 0.5 Haptic budget (one helper `haptic(name)`, gated by one Settings switch, default on; **zero sound assets in the entire app** — the record audio-session category bypasses the silent switch, so any app sound could betray the user in the room)

| Event | Call | Note |
|---|---|---|
| Speak start | `impactAsync(Rigid)` | fired **onPressIn**, ~80ms BEFORE the audio session opens (Taptic Engine is inert during recording; the mic would record the buzz) |
| Speak stop | `impactAsync(Soft)` | AFTER session teardown — the exhale to Rigid's inhale |
| Submit → "Read it" | `impactAsync(Light)` | the handing-over |
| Just save | `impactAsync(Soft)` | the phone-going-down path |
| Bridge headline lands | `impactAsync(Light)` | once, as the reveal starts |
| Copy success (after hold) | `notificationAsync(Success)` | the app's ONLY Success — documented meaning "task completed" |
| Tier-1 safety stop presents | `notificationAsync(Warning)` | the app's ONLY Warning; once |

Contractually haptic-FREE: stem chips and '+', Copy-unlock, streaming/working stage changes, **the entire no-bridge reveal**, every navigation/sheet/scroll. Every haptic pairs with a visible change (haptics can silently no-op in Low Power Mode — exactly this audience at 2am).

### 0.6 System adoption (from the HIG track — do once, applies everywhere)
- Modals ("Read it", Settings, safety resources detail) = expo-router `presentation:'formSheet'`, `sheetAllowedDetents:[0.55, 0.95]` (or `['fitToContents']` with explicit content height — never flex inside fitToContents), `sheetInitialDetentIndex:0`, `sheetGrabberVisible:true`, `sheetCornerRadius` UNSET (let iOS 26 supply the concentric value). System sheet chrome outside, paper `surfaceElevated` inside.
- Long-press on a saved entry → zeego real UIMenu: 'Copy bridge' (doc.on.doc), 'Read again' (book), 'Delete' destructive (trash). Free Liquid Glass fidelity, zero identity cost.
- **No in-app glass in v1.** No GlassView, no BlurView washes on cards. The keyboard accessory bar is opaque paper with a 1px top hairline — the seam against the iOS 26 system-glass keyboard is the honest OS/identity boundary. (Decision recorded below; the pressed-pill glass flourish is deferred.)
- SF Symbols (`expo-symbols` SymbolView, weight 'medium') for system verbs only: mic.fill, doc.on.doc, square.and.arrow.up, checkmark. Custom SVG for brand nouns. Never mixed in one row.
- Icon: layered Icon Composer `.icon` (paper ground + overlapping coral/violet mark), `ios.icon` in app.json; verify tinted/clear variants survive on silhouette.
- Every ScrollView: `contentInsetAdjustmentBehavior="automatic"`, `keyboardDismissMode="interactive"`, `keyboardShouldPersistTaps="handled"`, default decelerationRate. Scroll-edge legibility = 72pt paper LinearGradient fade (bg→transparent), never a blur bar.
- Splash: bare `bg` color (dark variant set), tiny wordmark ≤96w, `setOptions({fade:true, duration:220})`, `hideAsync` gated on fonts. `CADisableMinimumFrameDurationOnPhone=true` for 120Hz keyboard tracking.
- Do NOT set `UIDesignRequiresCompatibility`. No tab bar, ever (single-flow app).

---

## 1. CAPTURE (the launch screen)

### 1.1 Layout (portrait, light)
- Root: full-bleed `bg` View, no SafeAreaView wrapper; `StatusBar style` theme-driven.
- **Question**: "What happened?" display-q 34pt ink, `paddingTop: insets.top + 24`, left-aligned at 20pt gutter, max width = screen − 40.
- First-launch only, 12pt below the question: "Say it or type it. It stays yours." ui-secondary 15pt soft. Gone forever after first capture (`hasCaptured` flag). This is the entire onboarding.
- **TextInput** (multiline): starts 16pt below the question block, fills to the accessory bar; ui-body 17/24 ink, UNCAPPED Dynamic Type, `autoFocus` (keyboard-up on frame one — the keyboard slide IS the launch animation; zero entrance animation anywhere on this screen, the Raycast rule), placeholder empty (the serif question is the prompt), caret `coralFill` deep, selection color coral @ 30%.
- **Speak pill**: full-width minus gutters, `minHeight:64` (grows to ~74 under Dynamic Type), radius 32 stadium, coral gradient #FF8E7A→#EF6A53, label "Speak" btn-primary 17pt SemiBold **white on light / #FBF7F3 on dark** with `mic.fill` SymbolView 20pt leading (gap 8). Sits directly above the accessory bar with 12pt gap. ⚠ White-on-#EF6A53 measured 3.06:1 — ship the label at 17pt SemiBold (large-text 3:1 passes) and verify a darkened fill (#C24429-family) before any smaller label ever lands on coral.
- **Accessory bar** = `KeyboardStickyView` (react-native-keyboard-controller; `KeyboardProvider` at root; `DISABLE_COMMIT_PAUSING_MECHANISM` flag on — the screen updates state per keystroke). NOT InputAccessoryView, NOT useAnimatedKeyboard (deprecated, iOS 26 bugs). Offset `{closed: -insets.bottom, opened: 0}` so it rests at the home indicator when the keyboard is down and rides the exact UIKit spring — never approximate with withTiming.
  - Bar: `bg` paper, 1px top hairline, height 52 (contents 44pt-tappable). Row: horizontally scrolling **sentence-stem chips** (chip 14pt Medium ink, visible pill 32pt tall / hairline border / radius 8 per concentric rule, paddingH 12, gap 8, Pressable padded to 44pt; insert text instantly — no animation, no haptic) + inline '+' (20pt glyph soft, hitSlop 12) at the row end. First-ever tap of '+': single anchored popover, one sentence "Add a starter of your own." + one button — never a tour.
  - Second row inside the same sticky group when the keyboard is CLOSED (or trailing when open): "**Just save**" and "**Read it**" btn-quiet 15pt soft, 44pt frames.
- AX sizes: chips wrap to two rows rather than shrink.

### 1.2 States

**A. Default / typing (discreet path).** Keyboard up, cursor live. The moment the user types a character while idle, the Speak pill **demotes** over 250ms (`spring.snappy` on layout, crossfade 200ms) to a 44pt `mic.fill` glyph button at the right end of the accessory chip row; promotes back if the field empties. Typing must never feel like the fallback. `keyboardDismissMode="interactive"` lets the user drag the keyboard away with the page.

**B. First Speak tap (permission choreography).** No primer screen, ever (user-triggered asks measured ~100% acceptance; an interstitial between an upset person and speaking betrays the premise).
1. Tap → pill compresses to pressed (scale 0.97, 110ms ease-out) and HOLDS; one line fades in beneath over 200ms: "iOS will ask twice — once to hear you, once to turn it into text. Only you ever see this." (privacy 13pt soft, centered). This line is the whole priming budget and the ONLY standing privacy copy on the capture screen (assurances at low-salience moments suppress disclosure — it appears here, in Settings, nowhere else).
2. `requestMicrophonePermissionsAsync()` → system alert shows purpose string: **"One Side listens while you say what happened, so you don't have to type it."**
3. On grant, `requestSpeechRecognizerPermissionsAsync()` → **"Your words are turned into text on this phone so the app can work with what you said."**
4. On grant, recording starts in the SAME gesture's intent — no re-tap; the inline line fades out (200ms).
Both strings via the expo-speech-recognition config plugin keys. Branch on `getPermissionsAsync()` before EVERY start; never call start() blind; never re-request when `canAskAgain:false`.

**C. Listening / dictating.** engine: expo-speech-recognition, `{interimResults:true, continuous:true, requiresOnDeviceRecognition:true, volumeChangeEventOptions:{enabled:true, intervalMillis:100}}`. Only the mic permission is requested (on-device recognition skips the network speech permission where the OS allows).
- Pill goes **quiet, not loud**: coral fill crossfades 200ms to `surface` + 1px hairline; content becomes **33 mirrored bars**, 3px wide / 3px gap (~195px centered cluster), coral #EF6A53 (dark: #EF6A53 fill is allowed — fill, not text), minHeight 4 / maxHeight 32; each bar springs toward `level·maxHeight` with `withSpring {damping:18, stiffness:240, mass:0.6}`, target per volumechange, per-bar ±15% jitter. Level map with low-end boost for whispering: `level = clamp(((v+2)/12)^0.75, 0, 1)`. Left of bars: 6px coral dot pulsing opacity 1→0.4 @1.2s ease-in-out.
- Eyebrow above pill: "LISTENING · 0:32" eyebrow 11pt muteReadable; right-aligned "ON THIS PHONE" shown ONLY when `requiresOnDeviceRecognition` is actually active.
- **Two-tone live transcript** in the same TextInput area: finalized words ink, volatile tail `mute` (#B7B0C2 — the one legitimate mute-as-text use: it is provisional by definition); each new word FadeIn 120ms opacity-only, zero translation; tail→ink is a 180ms color-only interpolation; never-finalized tail promotes to ink 400ms after stop. Type-and-talk: the field stays editable mid-dictation; typing interleaves, never cancels.
- Top-right of transcript: "ｘ Discard" 13pt Hanken soft — one tap, wipes the session's words, no confirmation, no trace.
- **Stop** = tap the pill itself (whole 64pt pill is the target; no second button). Press-and-hold ≥400ms = push-to-talk (release = stop) for near-silent whispered use.
- **Silence policy** (deliberately slower than the platform): at 6s of `speechend` with session open, eyebrow crossfades (400ms) to "Take your time" and bars settle to 4px flatline — an acknowledgment, not a warning; at 20s, auto-stop that KEEPS everything and returns to editable state. No modal, no sound, ever.
- No haptic while the mic is open (see 0.5 ordering).

**D. Permission denied.** Never an error, never red, never blocks capture. Pill exhales to rest (spring.smooth), keyboard stays up. Inline quiet card (surface, hairline, radius 28, padding 20): card-head 22pt serif "The mic is off." + ui-secondary "You can type everything — or turn the mic on in Settings." + one text action "Open Settings" (btn-quiet, `coralText`) → `Linking.openSettings()`. Shown once per session on Speak tap while `.denied`.

**E. Just save.** One `impactAsync(Soft)`, silent save, screen resets to empty capture with a 200ms crossfade. No toast, no confirmation dialog (calm-tech: zero modals in the loop). VoiceOver: announce "Saved."

### 1.3 VoiceOver (capture)
Reading order = visual order: question → first-launch line → text field ("What happened. Text field.") → Speak pill → chips → Just save → Read it.
- Speak pill: `accessibilityRole:'togglebutton'`, label "Speak", state `{checked:false}`; recording → `{checked:true}`, `accessibilityValue:{text:'Recording'}`, announce "Recording. Double-tap to stop." via `announceForAccessibilityWithOptions(…, {queue:true})`; on stop announce "Stopped. N seconds captured." (iOS has no live regions in RN — `accessibilityLiveRegion` is Android-only; announcements are the mechanism.)
- Chips: role 'button', hint "Inserts this phrase."
- Discard: label "Discard recording", hint "Removes everything you just said."

### 1.4 Dark variant
Ground #15111B (never #000000), question #EDE7E2, vent body rgba(237,231,226,0.87), accessory bar #15111B + hairline rgba(237,231,226,0.08), chips hairline-bordered surface #1E1827, pill fill #EF6A53 with #FBF7F3 label, transcript volatile tail #8E8699. Optional wash: top stop #1A1322 → ground by 45% height. Verify under Night Shift max warmth (coral/violet hue distance shrinks — position + typography, not hue, carry the you/AI split).

---

## 2. WORKING (submit → response)

Not a spinner, not a skeleton (skeletons tested WORST for novel layouts at 5–25s), not token streaming. **Buffer the complete response; stage the work.**

### 2.1 Sequence (single Reanimated timeline; two clocks — elapsed time and response arrival)
- **t=0 (submit / "Read it")**: `impactAsync(Light)`. Capture text scales to 0.96 + dims ink→mute over 200ms (the user's words visibly become the material being worked on — one travelling composition, not a screen swap); working surface complete in <100ms.
- Layout: user's last ~2 lines in mute 17pt at top (20pt gutters, `insets.top+24`); centered vertically below: one **breathing violet dot** 10px, scale 1→1.15, 1600ms/leg, `Easing.inOut(Easing.sin)` (violetFill — the AI is present); stage eyebrow 24pt below the dot.
- **t=0.6s**: eyebrow "HEARING YOU" (eyebrow 11pt muteReadable) + dot mount, FadeIn 300ms. (Mounted late so a fast response never flashes it.)
- **t=3s**: nothing changes — the calm is the message.
- **t=8s**: crossfade 400ms `Easing.inOut(Easing.quad)` → "FINDING WHAT'S UNDERNEATH".
- **t=15s**: crossfade → "LOOKING FOR A BRIDGE"; below it, ui-secondary soft line fades in: "A considered answer, not a fast one."
- **t=25s**: line swaps to "Almost there."
- **t=40s (escape hatch)**: two quiet text actions fade in: "Keep waiting" · "Save what you wrote" (btn-quiet 15pt, 44pt frames). Save = same silent-save behaviour as Just save.
- **On response**: complete the current stage's **800ms minimum hold**, then a **250ms blank beat** (a breath, not a glitch), then branch to REVEAL_BRIDGE or REVEAL_NO_BRIDGE — selectable only because the response is buffered; streaming would leak the verdict mid-sentence.
- Stage timings live in one const. Never fake-sync stage lines to backend milestones you can't observe; never a percent bar or numeric estimate.

### 2.2 Haptics / sound
Submit Light only. Stage changes silent. No sound.

### 2.3 VoiceOver
On submit: one announcement, queued: "Listening to what you wrote. Your read is on its way." Stage lines are NOT announced individually (would spam). Escape-hatch buttons are reachable; announce "Still thinking." when the 40s hatch appears.

### 2.4 Reduce Motion
Dot renders static at scale 1.0 (a repeating loop that 'jumps to endpoint' can strobe); stage crossfades stay (opacity-only is RM-safe).

### 2.5 Dark
Ground #15111B, mute'd user text #8E8699, dot #9D95F5 fill, eyebrows #8E8699. No wash brighter than L14.

---

## 3. RESULT — the bridge reveal

### 3.1 Layout (top → bottom, 20pt gutters, 28pt between cards, ScrollView with 72pt paper-gradient scroll-edge fades top and bottom)
1. Eyebrow: "ONE SENTENCE YOU COULD SEND" (eyebrow 11pt muteReadable), `insets.top+24`.
2. **Bridge card** (surface, hairline, radius 28, padding 20, 3pt left rule `coralText`→ none; keep the card accent-free — the sentence is the hero): the bridge sentence, bridge-sentence 26pt InstrumentSerif-Italic ink, hung open-quote `marginLeft:-10`. **Editable**: tap → in-place edit (Hanken 17pt while editing, returns to italic serif on blur); when the user edits, the AI's superseded phrase shows struck-through in mute for one beat (300ms fade) — honesty as a visual pattern, never silent replacement.
3. Actions row under the bridge card (12pt gap): **Copy** — a pill inset 12 inside nothing (standalone, radius 16 per concentric grammar if ever nested), btn-primary sized 50pt tall. **Copy is gated on edit**: renders disabled-quiet (label mute-Readable, hairline) until the first edit or an explicit "Use it as is" text link (btn-quiet soft, 44pt) beside it — the person, not the AI, must own the words. Unlock moment: label color withTiming 250ms muteReadable→ink, one scale tick 1.0→1.02→1.0 spring{300, 0.7} (the app's only sub-0.85 damping), NO haptic.
4. **Copy is press-and-hold** (~450ms) — the app's ONE layered moment: a quiet coral fill sweeps the pill left→right over the hold, reversing if released early (a big action needs a wind-up: sending a sentence to the person you fought with IS a big action); on completion `notificationAsync(Success)`, label morphs Copy→Copied (crossfade 200ms, checkmark SymbolView with a single `animationSpec bounce` — the entire celebration budget), clipboard set.
5. Card (a) — "Underneath it for you": card-head 22pt serif ink; body ui-body 17 ink with ONLY the payload feeling-words in `coralText`.
6. Card (b) — "What they're probably not wrong about": card-head 22pt; body ink with payload words in `violetText`. Where the cards agree on something, that clause may take `greenText` — the only green in the app.
7. Bottom row: "Done" (btn-quiet) + share (square.and.arrow.up SymbolView) — 44pt frames, above `insets.bottom`.

### 3.2 Reveal choreography (starts after the 800ms hold + 250ms beat; bridge FIRST — the answer before the analysis)
- t=0: `impactAsync(Light)` once. Bridge card: opacity 0→1 over 350ms `Easing.out(Easing.cubic)` + translateY 12→0 on `spring.smooth` {500, dampingRatio 1} — no bounce on serif, ever. The one sanctioned breath of physicality: the card container may use {500, dampingRatio ≈0.87} (bounce ~0.13); the text inside never overshoots.
- t=+550ms: card (a), same curves.
- t=+730ms: card (b) (180ms stagger).
- t=+1130ms: actions row FadeIn 300ms.
- Total settled ≈1.6s. No autoscroll; the bridge sits at top. Stagger law: 80–180ms steps, ≤4 elements, total ≤1.6s.
- Reduce Motion: all enters → FadeIn 200ms zero translate; two groups (bridge 0ms, rest 200ms); Copy-unlock keeps color timing, drops the scale tick.

### 3.3 VoiceOver
JSX order = bridge first (visual order = reading order; no `experimental_accessibilityOrder`). On reveal, queue three announcements via `announceForAccessibilityWithOptions({queue:true})`: "One sentence you could send: …" → "Underneath it for you: …" → "What they're probably not wrong about: …", then `sendAccessibilityEvent` focus to the bridge sentence. Bridge card: role 'button' while gated, hint "Edit this sentence to make it yours, then hold Copy." Copy: hint "Hold to copy."

### 3.4 Dark
Surface #1E1827 cards, hairline 0.08, serif heads #EDE7E2, bodies 0.87 alpha, payload tints #F09C8B / #A79FF0 / #5FBF9F. Coral wash variant top stop #1D141A if used.

---

## 4. NO-BRIDGE RESULT (its own quieter preset — deflation carried entirely by REMOVED motion, color, and haptic)

Same working state precedes it (the wait must never telegraph the outcome — the strongest argument for buffering).

### 4.1 Reveal (REVEAL_NO_BRIDGE)
- Pre-reveal gap lengthened 250→**600ms** of blank paper. **No haptic at any point.**
- Headline "There is no bridge here." display-verdict 30pt serif ink — FadeIn **opacity-only over 600ms, ZERO translateY** (no rise = no lift; stillness is the message).
- Two cards at +700ms, 260ms stagger, FadeIn only, no rise: plain surface + hairline, card-heads 22pt ink, bodies ink — **no coral/violet payload tint at full strength, absolutely no green anywhere on this screen**.
- Let-go line +500ms after card 2: ui-body 17 soft #6F6880, centered, max 26ch, FadeIn 600ms after a real beat (`.delay(1100)` from the second card's start).
- Single action: "**Done**" btn-quiet, 44pt, above `insets.bottom`. No Copy, no share.

### 4.2 Layout
Headline at `insets.top+32` (4pt more air than the result screen — the extra space is part of the register), 20pt gutters, cards 28pt apart, let-go line 32pt below card 2, Done pinned bottom.

### 4.3 VoiceOver
Announce once, queued: "There is no bridge here." Then queue each card's text, then the let-go line. Focus moves to the headline. Done: label "Done", hint "Closes this."

### 4.4 Dark
Identical structure; ink #EDE7E2 headline, cards #1E1827; **no wash at all** on this screen in dark — flat ground. Total physical silence: no haptic, no sound, no loops.

---

## 5. TIER-1 SAFETY STOP (the app declines to mediate: signals of abuse, danger to self or others — per the DARVO safety constraint)

The one screen allowed to claim attention physically — and it does so once, then goes still.

### 5.1 Presentation
Full-screen takeover (replaces Working; never a sheet the user can swipe away accidentally, but exit is always visible). `notificationAsync(Warning)` fires ONCE as it presents — the app's only Warning (attention must be physically claimed; Warning not Error: the app didn't fail). Enter: FadeIn 350ms opacity-only, zero translation. No loops, nothing animated after settle.

### 5.2 Layout (light: `bg` paper — deliberately NOT a new dark/red world; no red anywhere; no accent colors on anything about the relationship)
1. `insets.top+32`: headline, display-verdict 30pt serif ink: "This is bigger than one fight." (exact copy = product owner sign-off).
2. +16pt: ui-body 17 ink, max 30ch: "What you described sounds heavier than something one sentence can bridge. One Side isn't the right help for this — but help exists."
3. +28pt: ONE resources card (surface, hairline, radius 28, padding 20): 2–3 region-appropriate lines — each a 44pt-tall tappable row, ui-body ink, with the actionable part in `violetText` (the app speaking, not the partner — the sole accent on this screen): a talk/text line, and "See more options" opening a formSheet with the fuller list. Rows call `Linking.openURL('tel:…'/'sms:…')` directly.
4. Bottom, always visible, max 2 actions (crisis-UX: reduce choices): "**Save what you wrote**" (btn-quiet — their words are still theirs) and "**Done**". Never a guilt-tripped exit, never a forced acknowledgment, no "Are you sure?".
5. What the screen does NOT do: no verdict on the user, no analysis cards, no bridge, no "we detected" language, no logging indicator, no red, no modal stacking.

### 5.3 VoiceOver
Focus moves to the headline on present (`sendAccessibilityEvent`). Announce: "This is bigger than one fight. Support options are on screen." Resource rows: role 'link'/'button', labels read the full line + number. Done and Save always reachable.

### 5.4 Dark
Ground #15111B flat (no wash), headline #EDE7E2, body 0.87, card #1E1827 hairline 0.12? No — 0.08 (not elevated). Resource action text #A79FF0.

---

## 6. Definition of done for implementation
`npx tsc --noEmit` 0 · `npx jest` green · `npx expo export -p ios` bundles · screenshots of every state above on iOS 26 sim AND an iOS 16.4-class device profile · the a11y matrix: VoiceOver full loop, Reduce Motion, Reduce Transparency, Dynamic Type AX3, Night Shift max warmth, Low Power Mode (haptics dead — app must feel complete). Verify Instrument Serif PostScript family names once via `Font.getLoadedFonts()` and pin in tokens; verify RN 0.85 lineHeight behaviour at AX font scales on-device before trusting the fixed px lineHeights.

## Decisions taken
Where tracks conflicted, the calls made: (1) STREAM vs BUFFER — the settled screens said "Working: streaming, not a spinner" and the motion track spec'd a streaming renderer, but the reveal track's argument wins: the full response is buffered and revealed staged (streaming leaks the no-bridge verdict mid-sentence and saves nothing on a ~120-word output); "streaming, not a spinner" is honored as staged work-lines + breathing dot, never a spinner. The motion track's streaming-renderer spec is shelved. (2) HAPTIC MAP — four tracks gave four maps; the dedicated haptics track's six-haptic budget is the authority (Rigid start / Soft stop / Light submit / Soft just-save / Success copy / Warning safety), extended with ONE Light impact as the bridge headline lands (reveal + motion tracks both specified it; the haptics track's objection targeted end-of-reading buzzes, which don't exist under buffered reveal). Chip-tap selection haptic (best-in-class track) rejected per the haptics track's frequency argument. Copy keeps notificationAsync(Success) per documented meaning, with impactAsync(Medium) as the tested fallback. (3) SPEAK-PILL GLASS — the HIG track licensed a pressed/recording GlassView; the voice track's listening state (coral fill crossfades to quiet hairline surface + waveform) is incompatible and emotionally righter (receiving, not broadcasting). In-app glass is cut entirely for v1; system-drawn glass (formSheets, zeego menus, keyboard, layered icon) is adopted instead. (4) REVEAL TIMINGS — motion track (≤900ms, 120ms steps) vs reveal track (~1.6s, 550/730ms) disagreed; reveal track wins as the dedicated spec, using the motion track's spring tokens for the curves; the 0.13-bounce breath lives on the bridge card container only, never the type. (5) DARK SOFT token — night track's #A79FB5 (7.33:1) over a11y track's #948DA8. (6) Start haptic style — Rigid (haptics track) over Medium (voice track) / Light (motion track); fired onPressIn before the audio session per both the haptics and a11y tracks. (7) Privacy line — Strangers-on-a-Plane evidence wins over the 'ON THIS PHONE' persistent eyebrow ambivalence: the on-device eyebrow shows only during active listening; standing privacy copy exists only in the first-tap line, first-launch line, and Settings. (8) Mute #B7B0C2 as text is banned (1.97:1) except the volatile transcript tail, which is provisional by definition; readable-mute #8F87A0 introduced. (9) Copy gating — kept as press-and-hold + gated-on-edit with an explicit "Use it as is" escape so an unedited-but-owned send is still possible without weakening the ownership gate.

## Open for owner
1) Copy-success haptic register: notificationAsync(Success) is spec'd per Apple's documented meaning, but two tracks flagged its tri-tap as faintly celebratory — decide in user testing; fallback is impactAsync(Medium), never silence. 2) Speak-pill label contrast: white on #EF6A53 measures 3.06:1 (passes only as large text at 17pt SemiBold) — approve either keeping it or darkening the light-mode fill toward #C24429-family; the darker fill was not contrast-verified this session. 3) Tier-1 safety copy and resource list ("This is bigger than one fight.", which hotlines per region, tel/sms targets) need product + possibly legal sign-off — the layout and behaviour are spec'd, the content is placeholder-register. 4) In-app Liquid Glass cut entirely for v1 (including the HIG track's pressed-pill flourish) — confirm, or schedule the gated GlassView moment as a v1.1 experiment. 5) "Use it as is" link alongside the edit-gated Copy slightly relaxes the settled "Copy gated on edit" law — confirm the escape hatch is wanted. 6) Two on-device verifications before build: RN 0.85 fixed-px lineHeight behaviour at AX Dynamic Type scales, and Instrument Serif / Hanken PostScript family names via Font.getLoadedFonts(). 7) Bridge-card left rule: spec ships it accent-free; decide whether the coral 3pt rule (you-voice marker) belongs on the bridge card or only on the two analysis cards.
