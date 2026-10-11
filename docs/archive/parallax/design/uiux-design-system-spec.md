# One Side Design System Spec v1.0 — tokens, type, motion, haptics, sound, iOS 26 posture (ready to translate into src/design/tokens.ts)

# ONE SIDE — DESIGN SYSTEM SPEC v1.0

The single source of truth for `src/design/tokens.ts`. Every colour ships with a measured WCAG ratio (computed this research cycle via the sRGB relative-luminance formula). Every motion value is a Reanimated 4 config. Every haptic is an expo-haptics call. Nothing here is an adjective.

---

## 1. COLOUR TOKENS

Host every pair in `DynamicColorIOS({light, dark})` so theme flips happen at the UIKit layer (no JS re-render, correct app-switcher snapshots). Follow **system appearance, no in-app toggle** (HIG: an app-level setting "may seem broken"). Never swap theme mid-capture — apply a trait change on the next screen, not under the user's thumbs.

### 1.1 Ground & surfaces

| Token | Light | Dark | Notes |
|---|---|---|---|
| `bg` | `#FBF7F3` | `#15111B` | Full-bleed to every edge; paint under status bar + home indicator. Never `#000000` (halation; Calm precedent: tinted elevated dark). |
| `surface` | `#FFFFFF` | `#1E1827` | Cards. Dark surface vs ground = 1.08:1 — invisible without a hairline, by design. |
| `surfaceElevated` | `#F4EEE8` | `#251E31` | Sheets/modals over ground; also the opaque twin for any blur. |
| `hairline` | `rgba(58,51,64,0.12)` | `rgba(237,231,226,0.08)` | 1px only. Depth system IS hairlines — no shadows, no brightness-overlay elevation. |
| `hairlineElevated` | `rgba(58,51,64,0.16)` | `rgba(237,231,226,0.12)` | On `surfaceElevated`. |

### 1.2 Text

| Token | Light (ratio on `bg`) | Dark (ratio on `#15111B`) | Role |
|---|---|---|---|
| `ink` | `#3A3340` (11.40:1 AAA) | `#EDE7E2` (15.19:1) | Display serif at 100% only; warm off-white, never `#FBF7F3`/`#FFF` on dark (17.5:1 is harsh). |
| `inkBody` | `#3A3340` | `rgba(237,231,226,0.87)` | Body text (Material 87% rule). |
| `soft` | `#6F6880` (4.97:1 AA) | `#A79FB5` (7.33:1) | Secondary copy, the privacy line (never mute for words that carry meaning). |
| `mute` | `#B7B0C2` (1.97:1 — **decoration only**) | `#8E8699` (5.34:1) | Light-mode mute is FORBIDDEN as text (fails everything). Hairlines, ghost glyphs, volatile transcript tail only. |
| `muteReadable` | `#8F87A0` (3.21:1) | `#8E8699` | Space Mono eyebrows ≥11pt caps, metadata. Large-text/non-text legal. |

### 1.3 Accents — the colour grammar

Colour only ever means something: **coral = you, violet = partner/AI, green = agreement.** Never decorative, never two on one element. Saturated brand hexes are **fills-only**; whenever the colour carries words ≤24pt, use the text tier.

| Token | Light | Dark | Ratios |
|---|---|---|---|
| `coralFill` | `#FF8E7A → #EF6A53` gradient | `#EF6A53` (fill only, never text on dark: 6.08:1 < 7:1 target) | Speak pill, user-side fills |
| `coralText` | `#BE452C` | `#F09C8B` | Light 4.83:1; dark 8.72:1 ground / 8.09:1 surface |
| `violetFill` | `#9D95F5` / `#7064E6` | fills/rings only (`#7064E6` on dark = 4.13:1, text-illegal) | AI-side fills, working dot |
| `violetText` | `#5F53D6` | `#A79FF0` | Light 5.33:1; dark 7.86:1 / 7.29:1 |
| `greenText` | `#1F7D62` | `#5FBF9F` | Light 4.73:1; dark 8.37:1 / 7.77:1. Agreement ONLY. Never appears on the no-bridge screen. |

Rules: colour-code the **container** (3pt left rule, eyebrow, hairline tint in the readable variants), keep prose ink — except the How-We-Feel selective tint: inside AI-written cards, only the payload feeling-words may take `coralText`/`violetText`; the sentence frame stays ink. Never red/error styling on anything about the relationship.

Speak pill label: `#FFFFFF` on `#EF6A53` = 3.06:1 — passes WCAG AA **large-text** (17pt SemiBold ≈ 22.7px ≥ 18.66px bold threshold, 3:1). Marginal; see open questions.

### 1.4 Night wash caps (dark theme)

Nothing on the dark screen exceeds HSL lightness 14 except text, hairlines, and the pill fill. Wash = one vertical gradient, top stop `#1A1322` (violet-warm, L13) → `#15111B` by 45% of screen height; coral-leaning results swap top stop to `#1D141A` — never both hues in one gradient. Accent radial washes: desaturated accent at 6–8% opacity, radius ≥1.5× the element. Light-mode paper imagery shown in dark gets dimmed ~8%.

---

## 2. TYPE SCALE

Fonts embedded at build time via the **expo-font config plugin** (6 static TTFs: InstrumentSerif-Regular, InstrumentSerif-Italic, HankenGrotesk 400/500/600 extracted statics — never the VF, SpaceMono-Regular). No `useFonts`, no FOUT: `hideAsync` gated on fonts, splash = bare `bg` colour, fade 220ms. Register the Italic as its own family — never `fontStyle:'italic'` (iOS synthesizes an oblique).

**Hard rules:** Instrument Serif never below 20pt. `lineHeight` is always the literal px value. `letterSpacing` in points (`em × fontSize`). Every `<Text>` sets its own `color`. One `<AppText role="…">` component encodes this entire table so violations are unrepresentable.

| Role | Family/Weight | Size | lineHeight | letterSpacing | dynamicTypeRamp | maxFontSizeMultiplier | Colour |
|---|---|---|---|---|---|---|---|
| `display-q` ("What happened?") | InstrumentSerif-Regular | 34 | 38 | −0.41 | largeTitle | 1.3 | ink |
| `display-verdict` ("There is no bridge here.") | InstrumentSerif-Regular | 30 | 34 | −0.36 | title1 | 1.3 | ink |
| `bridge-sentence` | InstrumentSerif-**Italic** | 26 | 32 | −0.31 | title1 | 1.3 | ink; hung open-quote `marginLeft:-10` |
| `card-head` | InstrumentSerif-Regular | 22 | 26 | −0.26 | title2 | 1.3 | ink |
| `ui-body` (vent text, card bodies, let-go line) | HankenGrotesk-Regular | 17 | 24 | 0 | body | **0 (uncapped)** | inkBody |
| `ui-secondary` | HankenGrotesk-Regular | 15 | 21 | 0 | subheadline | 1.5 | soft |
| `btn-primary` (Speak) | HankenGrotesk-SemiBold | 17 | 22 | +0.2 | body | 1.35 | white on coralFill |
| `btn-quiet` (Just save / Read it) | HankenGrotesk-Medium | 15 | 20 | +0.1 | subheadline | 1.35 | ink |
| `chip` | HankenGrotesk-Medium | 14 | 18 | +0.1 | footnote | 1.2 | ink |
| `eyebrow` (LISTENING · 0:32, stage lines) | SpaceMono-Regular, uppercase | 11 | 16 | +0.88 | caption2 | 1.35 | muteReadable / soft |
| `privacy` | HankenGrotesk-Regular | 12 | 16 | +0.1 | caption1 | 1.35 | **soft, never mute** |

Serif = the app's voice (question, headings, bridge, verdict). Hanken = everything the user operates. Space Mono = metadata. The boundary is never blurred: no serif buttons, no grotesque headlines.

Widow control (RN has no `text-wrap`): join the last two words of every fixed display string with ` ` ("bridge here."); post-process AI headings the same way. Never animate `scale` on serif display text (rasterization shimmer) — translateY/opacity only; keep display sizes integral. Android (if ever): `includeFontPadding:false` on every serif Text.

**Dynamic Type:** the user's own words and everything they must read scale uncapped on the body ramp; display serif rides Apple's compressed largeTitle/title1 curves capped at 1.3; chrome caps 1.2–1.35. The Speak pill uses `minHeight:64`, never fixed height (grows ~74px at cap). Chips wrap to two accessory rows at AX sizes rather than shrink.

---

## 3. SPACING, RADIUS, SHAPE

**Spacing (4pt base):** `s1:4, s2:8, s3:12, s4:16, s5:20 (screen gutter), s6:24, s7:28 (between cards), s8:32, s9:48, s10:64`. Whitespace separates content inside a card — never extra hairlines.

**Radius scale:** `r-chip:12, r-field:16, r-card:22, r-sheetCard:28, r-pill: height/2 (Speak = 32)`. Every `borderRadius ≥ 12` ships with `borderCurve:'continuous'` — enforce via a `squircle(radius)` helper in tokens; circular corners are the #1 web-view tell.

**Concentricity (hand-rolled, the native APIs aren't bridged):** `concentric(parentRadius, inset) = max(parentRadius - inset, 8)`. A 28pt card with 12pt-inset button → 16pt button; a chip inset 8 more → 8pt. Use for the editable-bridge field inside its card and the Copy button. The Speak pill's stadium shape (r = h/2) is always concentric-safe near the display corner — don't chase `UIScreen` corner radius.

**Hit targets:** 44×44pt default, 28pt absolute floor (HIG 2025), padded frames not bigger glyphs: chips get `paddingVertical` to a 44pt frame even at a 32pt visible pill + 8pt gaps; the inline '+' gets a 44×44 Pressable (`hitSlop 12`). Invisible generosity is the tone.

**Pressed states (one Pressable atom):** onPressIn → scale `withTiming(0.97, {duration:110, easing:Easing.out(Easing.quad)})` + opacity 0.85; onPressOut → `withSpring(1, {damping:20, stiffness:300})`. Chips/small buttons: opacity-only to 0.7, no scale. Speak pill: 0.98 max — big elements move less. Never RN default TouchableOpacity.

---

## 4. MOTION LANGUAGE

### 4.1 Spring tokens (the only springs in the app)

Reanimated 4 duration/dampingRatio mode — the 1:1 analogue of SwiftUI `spring(duration:bounce:)` (dampingRatio = 1 − bounce).

| Token | Config | Use |
|---|---|---|
| `spring.smooth` | `{duration: 500, dampingRatio: 1}` | All layout/appearance |
| `spring.snappy` | `{duration: 350, dampingRatio: 0.85}` | Small elements: chips, chevrons, pill morphs |
| `spring.gentle` | `{duration: 700, dampingRatio: 1}` | Large calm settles |
| `spring.tick` | `{duration: 300, dampingRatio: 0.7}` | ONE exception: Copy-unlock scale tick 1.0→1.02→1.0 |

Global law: dampingRatio ≥ 0.85 everywhere, 1.0 on anything containing serif display type, the single 0.7 exception above. Nothing ever bounces harder — a deliberate divergence from iOS 26's playful system personality. Positional changes = springs (interruptible, velocity-preserving; never block input on an animation); fades = `withTiming` only.

### 4.2 Duration table

| Moment | Value |
|---|---|
| Fades (generic) | 200ms `Easing.out(Easing.quad)`, opacity/transform only |
| Exits, everywhere | FadeOut 150–200ms (exits always faster than enters) |
| Enters | 300–500ms |
| Capture screen entrance | **ZERO animation** (Raycast rule: keyboard-up, cursor ready <400ms cold; chips insert text instantly, no morph — keyboard-frequency action) |
| Launch | splash = bare paper, `setOptions({fade:true, duration:220})`, `autoFocus` input; the keyboard's own system slide IS the ready signal |
| Pill label morphs (Speak→Listening→Copy) | crossfade 200ms in place — morph the one pill, never swap buttons |
| Transcript word arrival | FadeIn 120ms, zero translation; volatile tail (`mute`) → ink colour interpolation 180ms; orphaned tail promotes after 400ms |
| Stage-line crossfades (working) | 400ms `Easing.inOut(Easing.quad)` |
| Stagger rule | 80–180ms steps, ≤4 elements, total ≤1s |
| Layout entering presets | ONLY FadeIn/FadeOut/FadeInDown with `.withInitialValues({transform:[{translateY:8}]})` (cap travel 8–12px). **Banned:** BounceIn, LightSpeed, Zoom, Flip, Stretch, Pinwheel, Roll |

### 4.3 Choreography presets

**WORKING (buffer, don't stream — the response is parsed whole before any reveal; streaming would leak the verdict mid-sentence):** submit t=0: capture text scales 0.96 + dims to mute, working surface <100ms. t=0.6s: eyebrow `HEARING YOU` + one breathing violet dot (scale 1→1.15, 1600ms/leg, `Easing.inOut(Easing.sin)`) fade in 300ms. t=8s: `FINDING WHAT'S UNDERNEATH`. t=15s: `LOOKING FOR A BRIDGE` + soft line "A considered answer, not a fast one." t=25s: "Almost there." t=40s: escape hatch (Keep waiting · Save what you wrote). No spinner, no skeleton (skeletons tested worst at 5–25s in novel layouts), no percent bar ever. On response: finish current stage's 800ms minimum hold, 250ms blank beat, then reveal.

**REVEAL_BRIDGE:** one `impactAsync(Light)` as the headline lands; bridge whole — opacity 350ms + translateY 12→0 over 450ms, both `Easing.out(Easing.cubic)`; card (a) +550ms, card (b) +730ms (180ms stagger, same curve); actions row +400ms after (b). Bridge sits at top, no autoscroll. Edited bridge shows the AI's superseded phrase struck-through in mute for one 300ms beat before it fades.

**REVEAL_NO_BRIDGE:** no haptic. Pre-reveal gap 600ms of stillness. "There is no bridge here." fades opacity-only 600ms, **zero translateY** — the deflation is carried by removed motion, removed colour, removed haptic. Cards +700ms, 260ms stagger, ink on plain surface, accents at container-level only, **no green anywhere**. Let-go line +500ms later in soft. Single `Done`.

**Listening (voice):** pill crossfades 200ms coral→surface+hairline (recording reads as receiving, not broadcasting); 33 mirrored bars 3px/3px gap, 4–32px, coral, per-bar `withSpring {damping:18, stiffness:240, mass:0.6}` toward `level = clamp(((v+2)/12)^0.75, 0, 1)` from `volumechange` (intervalMillis 100), ±15% per-bar jitter; 6px coral dot pulsing opacity 1→0.4 @1.2s. Silence: 6s → eyebrow "Take your time", bars flatline at 4px; 20s → auto-stop keeping everything. Never the platform's 3s cutoff.

**Keyboard:** react-native-keyboard-controller (`useAnimatedKeyboard` is deprecated for iOS 26 bugs). Accessory bar (stem chips + Just save/Read it) = `KeyboardStickyView`, offset `{closed: -insets.bottom, opened: 0}`, riding the system spring pixel-for-pixel; `DISABLE_COMMIT_PAUSING_MECHANISM` flag on (per-keystroke state updates); `CADisableMinimumFrameDurationOnPhone=true`; `keyboardDismissMode:'interactive'`, `keyboardShouldPersistTaps:'handled'`, `contentInsetAdjustmentBehavior:'automatic'` on every scroll view.

### 4.4 Reduce Motion table

Single a11y store (zustand): `reduceMotion`, `reduceTransparency`, `boldText`, `screenReader` — seeded from AccessibilityInfo, live-updated via `reduceMotionChanged`/`reduceTransparencyChanged`/`boldTextChanged`/`screenReaderChanged` (the `useReducedMotion` hook is start-time-only). Springs stay at default `ReduceMotion.System` (free end-state jumps); the branched cases:

| Element | Normal | Reduce Motion |
|---|---|---|
| Reveal enters | fade + 8–12px rise, staggered | `FadeIn 200ms`, no translateY; stagger collapses to two groups (bridge 0ms, rest 200ms) |
| Transcript word fades | 120ms opacity | unchanged (opacity-only is RM-safe) |
| Caret pulse / placeholder breathing / waveform loop | looping | **static** (fixed mid-height bars; a looped `withRepeat` snapping to endpoints strobes) |
| Copy-unlock | colour 250ms + `spring.tick` scale | colour only |
| expo-router transitions | default | `animation:'fade'` (navigators don't read Reanimated's flag) |
| Keyboard tracking | system-driven | untouched |
| `prefersCrossFadeTransitions` true | — | treat as RM for slides even without full RM |

Reduce Transparency: no BlurView ships without its opaque twin (`surfaceElevated` + hairline). The paper identity IS the fallback — identical with or without transparency.

---

## 5. HAPTIC MAP

One helper — `haptic('speakStart' | …)` — in one file, gated by a single Settings "Haptics" switch (default on). Every haptic pairs with a visible state change (Taptic Engine is silently dead in Low Power Mode / active recording — the app must feel complete with zero haptics).

| Moment | Call |
|---|---|
| Speak start | `impactAsync(Rigid)` — **onPressIn, ~80ms BEFORE the audio session opens** (fired mid-recording it's both suppressed and recorded) |
| Speak stop | `impactAsync(Soft)` — only AFTER session teardown (the exhale to Rigid's inhale) |
| Submit / "Read it" | `impactAsync(Light)` |
| Just save | `impactAsync(Soft)` — the phone-going-down-at-2am path |
| Bridge reveal (headline lands) | `impactAsync(Light)` — never `notificationAsync(Success)` (tri-tap reads as "you won") |
| Copy/hold-to-send complete | `impactAsync(Medium)` — after a ~450ms press-and-hold fill that reverses on early release; the app's one layered moment (visual + haptic, nothing more) |
| Tier-1 safety stop | `notificationAsync(Warning)` — the app's only notification haptic; attention physically claimed once |
| Stem chips, inline '+' | **NONE** (highest-frequency touch; Apple's own keyboard is silent by default) |
| Copy-unlock after edit | **NONE** (state change with no causal gesture = gratuitous) |
| No-bridge reveal | **NONE** — stillness is the message |
| Streaming/working stage changes, navigation, sheets, scroll | **NONE** |

Seven calls total. The silences are the design.

---

## 6. SOUND POSITION

**Zero sound, as policy not omission.** No bundled audio, no start/stop chirp, no send whoosh, no completion tone — ever. Three stacked reasons: (1) HIG silent-mode contract — all of these are "nonessential sounds"; (2) the Speak audio session is `.record`/`.playAndRecord`, which **bypasses the silent switch** — an app chirp cannot be muted, in the room with the partner; (3) the mic is open when a start-cue would play and would record its own beep. VoiceOver gets `announceForAccessibilityWithOptions` instead of earcons: "Recording. Double-tap to stop." / "Saved" / "Copied"; result flow announces once per completed section with `{queue:true}` (never per token — `accessibilityLiveRegion` is Android-only and no-ops on iOS), then moves focus to the bridge via `sendAccessibilityEvent`. Write this section into the repo so it survives future "add a little whoosh" impulses.

---

## 7. iOS 26 POSTURE — ADOPT / IGNORE

Apple's own doctrine resolves most of the "glass vs paper" conflict: Liquid Glass belongs to the functional/navigation layer and is **banned from the content layer** — and One Side is nearly all content layer.

**ADOPT (system physics & system-owned surfaces):**
- Native `formSheet` for every modal ("Read it", settings): `presentation:'formSheet'`, `sheetAllowedDetents:['fitToContents']` or `[0.55, 0.95]`, `sheetGrabberVisible:true`, **`sheetCornerRadius` unset** (iOS 26 supplies the concentric system value). System glass chrome outside, paper `surfaceElevated` inside. Explicit heights inside `fitToContents` (flex is broken there). Never a JS bottom sheet.
- zeego context menus (real UIMenu) on saved entries: Copy bridge / Read again / Delete `destructive:true` — free system glass, zero identity cost (verify peer ranges vs RN 0.85 before adding).
- Layered **Icon Composer `.icon`** app icon (paper ground + overlapping coral/violet mark; `ios.icon` in app.json) — the Home Screen is Apple's canvas; verify the tinted variant survives on silhouette alone.
- Concentric corner arithmetic (§3), `borderCurve:'continuous'`, 44/28pt targets, edge-to-edge paper with `useSafeAreaInsets`, Dynamic Type policy (§2), the system keyboard's own glass under a transparent, hairline-topped paper accessory bar (the honest OS/identity seam).
- SF Symbols via expo-symbols for system **verbs** only (mic.fill, doc.on.doc, square.and.arrow.up, checkmark; weight 'medium', token tints); custom SVG for meaning-bearing **nouns** (bridge motif, wordmark). Never mixed in one row.
- Do NOT set `UIDesignRequiresCompatibility`.

**IGNORE (inside surfaces we own):**
- No GlassView anywhere in-app v1, no BlurView card backgrounds, no `.glass` buttons, no translucent bars. Half-glass paper is the worst outcome.
- No tab bar at all (single-flow app; record the decision). If a surface ever earns top-level status: NativeTabs, never a custom JS bar.
- No system spinner / UIActivityIndicator in the flow; the breathing violet dot is the only working-state motion.
- Scroll-edge legibility re-expressed editorially: 72pt LinearGradient `bg→transparent` fade where content scrolls under the question or action row — never a blur bar.
- iOS 26's bounce budget (snappy 0.15 / bouncy 0.3 as personality): refused — dampingRatio ≥0.85, §4.1.

**Test matrix:** iOS 26 default · iOS 26 + Reduce Transparency · iOS 26 + Reduce Motion · Night Shift max warmth (hue distance coral↔violet shrinks — position and typography, never hue alone, carry the you-vs-AI split) · iOS 16.4 (no glass APIs — that build IS the design, not a degraded one).

---

## 8. tokens.ts SHAPE (translation contract)

```
export const color = { bg, surface, surfaceElevated, hairline, hairlineElevated,
  ink, inkBody, soft, mute, muteReadable,
  coralFill, coralText, violetFill, violetText, greenText }   // each: DynamicColorIOS({light, dark})
export const type = { displayQ, displayVerdict, bridgeSentence, cardHead, uiBody,
  uiSecondary, btnPrimary, btnQuiet, chip, eyebrow, privacy }  // §2 rows, consumed only via <AppText role>
export const space = { s1..s10 }        // §3
export const radius = { chip:12, field:16, card:22, sheetCard:28, pill:'h/2' }
export const squircle = (r) => ({ borderRadius: r, borderCurve: 'continuous' })
export const concentric = (parentR, inset) => Math.max(parentR - inset, 8)
export const spring = { smooth, snappy, gentle, tick }         // §4.1
export const timing = { fade:200, exit:200, chunk:180, stage:400, wordIn:120, tailToInk:180 }
export const haptic = (moment) => { /* §5 map, gated by settings + a11y store */ }
```


## Decisions taken
Where the research tracks conflicted, I ruled: (1) HAPTIC MAP — merged the dedicated haptics track's structure (Rigid start onPressIn / Soft stop after teardown, Light submit, Soft save, Warning safety-stop, silence on chips/no-bridge) but overruled its `notificationAsync(Success)` on Copy: two other tracks independently flagged Success's tri-tap as celebratory against the register, and the haptics track itself named `Medium` as its fallback — so Copy completes with `impactAsync(Medium)` and no Success exists anywhere. Also ruled NO haptic on copy-unlock (haptics track's causality rule beats the motion track's selectionAsync) and NO chip haptic (frequency argument beats best-in-class's selectionChanged). Bridge reveal keeps one Light impact (reveal track) — the buffered reveal is a choreographed event, not "streaming complete". (2) GLASS — the HIG track licensed a GlassView Speak pill while recording and the RN track a glass copy lozenge; the voice track's listening state (coral→hairline surface + bars, "receiving not broadcasting") is stronger and incompatible, so v1 ships ZERO in-app GlassView; glass appears only where the system draws it plus the Icon Composer icon. (3) BUFFER vs STREAM — the motion track spec'd a token-streaming renderer for the result; the reveal track's verdict-leak argument wins: buffer-then-stage for the synthesis; the streaming renderer values survive only in the live voice transcript, which is genuinely streaming. (4) REVEAL TIMINGS — reveal track's withTiming/cubic choreography (350/450ms, +550/+730) over the motion track's spring-based stagger; the motion track's spring tokens govern everything else. (5) DARK TOKENS — the 11pm track's computed set (ink #EDE7E2, soft #A79FB5 at 7.33:1) over the typography track's #F2EEF6 and the a11y track's #948DA8 (higher verified ratios win). (6) SPEAK PILL LABEL — white on #EF6A53 at 3.06:1 ruled passing via WCAG large-text (17pt SemiBold ≥ 18.66px bold, 3:1 threshold) rather than darkening the hero fill; flagged as marginal below. (7) Speak-start haptic style: Rigid (haptics track) over Medium (voice track) and Soft (a11y track) — the asymmetric Rigid/Soft pair argument was the only reasoned one.

## Open for owner
1) Speak pill label contrast is legal-but-marginal (3.06:1 large-text AA): if Dani wants headroom, the verified move is deepening the pill's lower gradient stop toward #BE452C (white on it ≈5.2:1, computed here, not lab-verified) — a visible brand change, her call. 2) Copy completion haptic: Medium impact chosen over the HIG-semantic Success; if user testing says Medium feels flat, the fallback ladder is Medium → Success, not silence. 3) The RN-0.85 peer ranges for zeego (react-native-ios-context-menu v3 + react-native-ios-utilities) and whether RN 0.85 scales hard px lineHeight correctly at AX Dynamic Type sizes are both UNVERIFIED — check on-device before the a11y sign-off. 4) The crisis-UX constraints (max-2-buttons, no red on the relationship) are synthesized from calm-tech sources; the Samaritans/#chatsafe primary guidelines were never actually read — don't cite them in docs until fetched. 5) Icon Composer tinted-variant legibility of the coral/violet mark needs a real render check in Xcode 26.


---

# iOS 27 addendum (researched 2026-09-16, release 2026-09-14)

**Headline: null result.** iOS 27 is a refinement/quality release ('Rave') — no new design language; Liquid Glass persists, now user-tunable (ultraclear→fully tinted slider). The iOS 26 hardening in this spec stands in full. Sources: Apple Newsroom 14 Sep 2026, MacRumors iOS 27 roundup, HN thread 49701004 (843 comments).

## Changes adopted

- **Design-system spec — 'System glass' section (formSheet / UIMenu / keyboard rules)** — Add a QA requirement: every system-drawn glass surface must be checked over warm paper #FBF7F3 at BOTH extremes of the new iOS 27 Settings translucency slider (ultraclear and fully tinted), and the spec must not describe or assume a fixed translucency for system chrome. Note the refined rendering (heavier content diffusion behind bars, darkened edges, brighter specular highlights) when eyeballing the formSheet edge against hairline cards. _(src: Apple Newsroom 14 Sep 2026 (user-adjustable Liquid Glass slider) + MacRumors iOS 27 roundup (diffusion/edge/highlight refinements))_
- **Design-system spec — Accessibility section** — Make Reduce Transparency, Reduce Motion, Dynamic Type (incl. the 2026 emphasized-weight specs), Increased Contrast, and Differentiate Without Color explicit, testable requirements across all 25 frames — blur moments degrade to opaque paper, animations to instant/cross-fade. Motion spec: easing stays snappy (~200-300ms), never 'drizzled' slow easing. _(src: HN WWDC-2026 + Liquid Glass threads (practitioners lean on Reduce Transparency/Motion; explicit resentment of slow easing); Apple 2026 ADA winner Guitar Wiz cited for exactly these accessibility APIs; HIG 2026 Dynamic Type emphasized-weight update)_
- **Design-system spec — App icon section** — Note that the existing layered Icon Composer icon picks up iOS 27's extra glass layers / sharper rendering for free; add a one-time check: open the icon in the Xcode 27 / Icon Composer toolchain and confirm all layers read correctly under the new treatment. No redesign. _(src: MacRumors iOS 27 roundup (icons 'sharper and more defined', layered Liquid Glass treatments))_
- **Design-system spec — Layout section (and any frame annotated with fixed device widths)** — Replace any hardcoded 393pt-style width assumptions with a rule that all layouts are constraint-flexible: iOS-27-SDK builds make iPhone apps resizable, and the new HIG 'Designing for iPhone Duo' page introduces dynamic poses. Annotate frames as min/max width ranges, not one canvas size. _(src: Expo SDK 58 beta changelog (iOS 27 SDK apps become resizable, no UIScreen.main geometry) + Apple HIG What's New, 9 Sep 2026 (iPhone Duo page — body unverified, summary only))_
- **Synthesis frame (the 'what's underneath / one sendable sentence' result screen) — add a generation-state treatment** — Add a during-generation state and a lightweight refine/feedback affordance to the synthesis frame, per Apple's new Generative-AI HIG guidance (user feedback during generation, refining results). Keep it in the editorial language — a quiet in-progress state on paper, not a glass spinner. _(src: developer.apple.com iOS 27 / MacRumors: new Generative-AI HIG guidance (refining results, feedback during generation))_
- **Capture frame (vent TextInput / speak-what-happened) — annotation** — Annotate the vent input: decide and document whether system Writing Tools / 'Write with Siri' should be suppressed in this field (AI-drafted venting contradicts 'speak your own side'); mark it as needing an iOS 27 device test since Write with Siri now appears system-wide in text fields. _(src: MacRumors 14 Sep 2026 release article (Write with Siri drafts text anywhere you type); RN/Expo opt-out path is UNVERIFIED)_
- **Design-system spec — Privacy/trust copy (and the settings/about frame)** — Add an in-app plain-language privacy statement surface: what leaves the device, what is stored, what the AI sees, plus a plain-format export (JSON/Markdown) walk-away path. State it in the UI, not only the privacy policy. _(src: HN 49704226 (Apple Intelligence can't be disabled — privacy-anxious sentiment) + HN journaling-app threads 48437773 / 47072863 (trust + open-format export is the feature))_

## Deliberately not adopted

Deliberately NOT adopted from iOS 27: (1) No re-skin and no in-app Liquid Glass — iOS 27 changed no design language (Apple's own release calls it refinement; HN consensus agrees), the user slider means in-app imitation glass can never match the user's chosen translucency, and HN practitioners explicitly endorse a confident own-brand design over chasing system chrome. The quiet-editorial paper/ink identity stands unchanged. (2) No corner-radius, typography, tab-bar, or dark-mode rework — HIG lists none; hand-tuned concentric corners remain valid. (3) No raise of the min iOS 16.4 deployment target — nothing in iOS 27 requires it; all new APIs are additive and runtime-gated (expo-glass-effect isLiquidGlassAvailable, App Intents surfaces simply absent pre-26/27). (4) No dependence on Siri AI or Apple cloud AI for the core synthesis — practitioners report it half-baked, it's gated to iPhone 15 Pro+ hardware, and it's delayed in the EU under DMA; One Side's own pipeline stays the product. (5) No Spotlight/semantic-index entity schemas — indexing vents into Spotlight contradicts the privacy posture. (6) No expo-glass-effect custom glass in the content layer — identity decision, reaffirmed. (7) SpeechAnalyzer in-app voice capture and Foundation Models on-device synthesis are flagged as future options, not adopted now — both need native modules above SDK 56's reach and are iOS 26+ progressive enhancements only.

## Build implications (calendar items)

(1) SDK migration is a calendar item, not optional: from April 2027 every App Store upload must be built with the iOS 27 SDK (Apple Developer News, 9 Sep 2026), which mandates the UIScene scene-based lifecycle and makes iPhone apps resizable. Path: Expo SDK 56 → 57 (easy, RN 0.86; scene support opt-in via ios.enableSceneSupport in expo@57.0.23) → 58 (real work: scenes default, expo-router core reworked, async File.write, strict TS API, Xcode 27, Node 22.13+). Budget it for Q4 2026/Q1 2027. Purge any UIScreen.main / fixed-Dimensions geometry assumptions in RN code. (2) New libraries worth planning: expo-app-intents (SDK 58) exposes App Intents/Siri AI/Shortcuts from JS — 'log what happened' by voice is the highest-value iOS 27 feature and needs no eject; SpeechAnalyzer (on-device, 2.12% WER, iOS 26+) and Foundation Models (free PCC tier for Small Business Program apps under 2M downloads; Claude pluggable via the Language Model protocol) both need custom native modules/config plugins — no Expo wrappers exist yet (inferred absence). (3) Permission strings: NO changes — iOS 27 adds no new mic/speech prompts or consent flows (explicit null across all sources). One device test needed: whether Writing Tools/Write with Siri injects into RN TextInput and whether writingToolsBehavior is reachable from Expo. (4) StoreKit/App Store: no breaking changes; new levers if subscribing — Retention Messaging API (fall 2026), subscription Bundles, 12-month-commitment monthly pricing (NOT available in Singapore); the new 'social media capabilities' age-rating question must be answered on the next submission (honest answer for One Side: no); On-Demand Resources deprecation is a no-op for an Expo app. (5) Existing SDK 56 binaries keep running unmodified on iOS 27 — nothing breaks today.

## Load-bearing facts

1. iOS 27 (shipped 14 Sep 2026) introduced NO new design language — it is an explicit refinement/quality release; Liquid Glass persists, now user-tunable via a Settings slider from ultraclear to fully tinted. Source: Apple Newsroom, 'Major updates for Apple's software platforms are now available', 14 Sep 2026 (apple.com/newsroom/2026/09/...), corroborated by the MacRumors iOS 27 roundup and the 843-comment HN release thread (id=49701004). Consequence: the iOS 26 hardening still stands in full — the correct output here is a short list, and this is it. 2. Starting April 2027, all App Store uploads must be built with the iOS 27 SDK (Xcode 27), which mandates the UIScene lifecycle and resizable iPhone apps — making the Expo SDK 56→58 migration a dated obligation. Source: Apple Developer News item dated 2026-09-09 (developer.apple.com/news/) + Expo SDK 58 beta changelog (expo.dev/changelog/sdk-58-beta, 2026-09-15). 3. Crafted apps' actual iOS 27 playbook was feature adoption, not visual adoption — Things shipped Siri AI task creation via App Intents, multiple apps shipped the new XL widget, several adopted on-device Foundation Models; nobody redesigned. Source: MacStories 'Our Favorite Indie Apps for iOS 27, Vol. 1' + Things blog 'Things for OS 27 and Siri AI' (culturedcode.com, 2026-09-14). This is what 'not looking last-year' means for One Side: expo-app-intents voice capture entry, not a re-skin.
