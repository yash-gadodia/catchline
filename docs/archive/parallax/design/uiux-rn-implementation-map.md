# RN Implementation Map — One Side (RN 0.85 / Expo SDK 56, iOS 16.4–26)

# RN IMPLEMENTATION MAP — One Side
RN 0.85 / Expo SDK 56 / Expo Router / Reanimated 4 / EAS dev-client builds. Min iOS 16.4, tested through iOS 26.
Every row: exact library + API, config-plugin?, new-native-build?, the known trap, the fallback.

---

## 1. Keyboard accessory bar (sentence-stem chips + "Just save" / "Read it" + inline "+")

- **Library**: `react-native-keyboard-controller` **~1.22.x** (Reanimated-backed since 1.21.7). Config plugin: **no** (plain native module). New build: **YES**.
- **API**: `<KeyboardProvider>` at root (`app/_layout.tsx`); bar = custom content inside `<KeyboardStickyView offset={{ closed: -insets.bottom, opened: 0 }}>` — chips row + quiet buttons + own Background view (paper surface token, 1px top hairline `mute @ 24%`). Copy the shape of the library's `KeyboardToolbar` compound, do NOT use `KeyboardToolbar` itself (generic chrome).
- **Explicitly rejected**: RN core `InputAccessoryView` (breaks inside `formSheet` modals, can't host the "+" popover) and Reanimated's `useAnimatedKeyboard` (**officially deprecated for persistent iOS 26 bugs**, docs point to keyboard-controller).
- **Trap #1 (New Arch iOS)**: React state updates inside TextInput callbacks interrupt the keyboard animation — set the library feature flag `DISABLE_COMMIT_PAUSING_MECHANISM` (the capture screen sets state on every keystroke).
- **Trap #2**: chips render ~32pt tall — pad every chip Pressable to **44pt min height** (paddingVertical, not hitSlop-only), "+" gets a 44×44pt frame (`hitSlop {12,12,12,12}` on a 20pt glyph); `accessibilityRole:'button'`, hint "Inserts this phrase".
- **Scroll container pairing**: `keyboardDismissMode="interactive"`, `keyboardShouldPersistTaps="handled"`, `contentInsetAdjustmentBehavior="automatic"` (RN default is `'never'` — the #1 cropped-list tell).
- **Fallback**: if keyboard-controller misbehaves in a given OS beta, the bar degrades to absolute-position + `useKeyboardHandler`-less static bottom placement (keyboard closed state) — never back to `useAnimatedKeyboard`.

## 2. Keyboard-coupled animation (bar + Speak pill riding the keyboard spring)

- **API**: same library — `useKeyboardHandler` worklets (`onStart/onMove/onInteractive/onEnd`, each event `{height, progress 0→1, duration, target}`). Drive `translateY: -height` directly in the worklet so the bar/pill ride the UIKit keyboard **pixel-for-pixel**. Never approximate the system keyboard with `withTiming(250)` or your own spring.
- **120fps**: add `"CADisableMinimumFrameDurationOnPhone": true` to `app.json → ios.infoPlist`. Config-side only, but **new build: YES** (Info.plist).
- **Trap**: `useAnimatedKeyboard` returns height 0/CLOSED for iPad floating keyboards — moot since we don't use it; keyboard-controller tracks the real frame.
- **Fallback**: none needed — pure JS/worklet.

## 3. Dictation / voice capture

- **Library**: `expo-speech-recognition` (jamsch) — install the SDK-pinned tag (verify the SDK-56 pin at install; repo publishes per-SDK tags e.g. `@sdk-54`). Config plugin: **YES** — carries both purpose strings:
  - `microphonePermission`: "One Side listens while you say what happened, so you don't have to type it."
  - `speechRecognitionPermission`: "Your words are turned into text on this phone so the app can work with what you said."
  New build: **YES**.
- **API**: `start({ interimResults: true, continuous: true, requiresOnDeviceRecognition: true, volumeChangeEventOptions: { enabled: true, intervalMillis: 100 } })`. Events: `result` (with `isFinal` → two-tone transcript: finalized ink `#3A3340`, volatile tail mute `#B7B0C2`, 180ms color-only promotion), `volumechange` (float −2…10 → waveform level `clamp(((v+2)/12)^0.75, 0, 1)` — low-end boost for whispering).
- **Permission sequencing** (crash-proof, per Apple: missing `NSSpeechRecognitionUsageDescription` = crash on request): branch on `getPermissionsAsync()` BEFORE every `start()`; first tap → `requestMicrophonePermissionsAsync()` THEN `requestSpeechRecognizerPermissionsAsync()`; `granted:false && canAskAgain:false` → denied card with `Linking.openSettings()`, typing path always primary.
- **Trap #1**: built-in silence cutoff (~3s with `continuous:false`) is hostile to a crying user — use `continuous:true` and own the policy in JS (6s "Take your time" eyebrow, 20s keep-everything auto-stop).
- **Trap #2**: min iOS for the library is 17; on iOS 16.4 devices `start()` support must be feature-checked — **fallback**: hide the Speak pill's dictation path and rely on the system keyboard mic key (both land in the same TextInput). Typing is always fully capable, so no user is blocked.
- **iOS 26 upgrade path**: SpeechAnalyzer/SpeechTranscriber (`volatileRange`, `prepareToAnalyze`) maps 1:1 onto the two-tone renderer — no UI change when the library adopts it. Do not write a native module now.

## 4. Streaming transport (submit → result)

- **Decision: buffer, don't stream.** Transport = one plain awaited `fetch` (or `supabase.functions.invoke`) returning the **complete JSON** `{verdict: 'bridge'|'no_bridge', bridge, underneath_a, underneath_b, let_go?}`. No SSE, no token streaming, no `expo/fetch` ReadableStream code.
- **Why (binding)**: output is ~120 words — TTFT dominates; token streaming **leaks the verdict** (a no-bridge answer visibly types differently) and a half-rendered bridge clause is emotionally dangerous. The choreography preset (`REVEAL_BRIDGE` vs `REVEAL_NO_BRIDGE`) is only selectable because the response is buffered.
- **Working state**: stage lines on a **local clock**, one Reanimated timeline: 0.6s "HEARING YOU" → 8s "FINDING WHAT'S UNDERNEATH" → 15s "LOOKING FOR A BRIDGE" + "A considered answer, not a fast one." → 25s "Almost there." → 40s escape hatch (Keep waiting / Save what you wrote). Breathing violet dot: `withRepeat(withTiming(1.15, {duration:1600, easing:Easing.inOut(Easing.sin)}))`. **No spinner, no skeleton, no percent bar.** On response: complete current stage's 800ms minimum → 250ms beat (600ms for no-bridge) → reveal preset.
- **New deps: none.** Trap: don't fake-sync stage lines to backend milestones you can't observe. Fallback: 40s escape hatch + "Save what you wrote" preserves the vent on timeout.

## 5. borderCurve (squircles)

- **API**: RN core `borderCurve: 'continuous'` (iOS 13+, in 0.85). Config plugin: no. New build: **no**.
- **Enforcement**: `squircle(radius)` helper in `src/design/tokens` applied to every `borderRadius ≥ 12` (Speak pill, cards, chips). Companion helper `concentric(parentRadius, inset) = max(parentRadius - inset, 0)` for nested radii (card 28 → inset-12 button 16 → inset-8 chip 8). Speak pill stays stadium (radius = height/2 = 32).
- **Trap**: circular corners are the single most reliable "web view" tell — make the helper the only way radii are set. Fallback: n/a (no-op on Android).

## 6. SF Symbols vs SVG

- **Library**: `expo-symbols` (`SymbolView`) — **beta**; string symbol names are iOS-only (fine, iOS-first). Config plugin: no. New build: **YES**.
- **Split rule — verb vs noun**: SF Symbols for system verbs: `mic.fill` (pill), `doc.on.doc` (Copy), `square.and.arrow.up` (share), `checkmark` (copy confirm), `trash` (destructive in menus). `weight:'medium'`, `tintColor` from tokens. Custom `react-native-svg` (already installed) for meaning-bearing marks (wordmark, bridge motif). Never mix both in one row.
- **Animation budget**: `animationSpec:{effect:{type:'bounce'}}` exactly once, on copy success. Trap: beta API — pin the SDK-56 version; **fallback prop** on `SymbolView` renders your SVG twin on failure/Android.

## 7. Haptics (canonical map — six, everything else contractually silent)

- **Library**: `expo-haptics` (SDK 56 version). Config plugin: no. New build: **YES** (native pod; may already be in the build — verify `expo doctor`, cost is zero either way).
- **One helper file** `src/lib/haptics.ts` — `haptic('speakStart' | ...)`, gated by one Settings switch (default on). The map:
  1. **Speak start** — `impactAsync(Rigid)` fired **onPressIn, before the audio session opens** (~80ms lead). Taptic Engine is DEAD during active recording/dictation and the mic would record the buzz — any haptic mid-capture is both lost and harmful.
  2. **Speak stop** — `impactAsync(Soft)`, only **after** session teardown.
  3. **Submit** — `impactAsync(Soft)` (acknowledgement, not celebration).
  4. **Bridge reveal** — one `impactAsync(Light)` as the headline lands.
  5. **Copy success** (after the 450ms press-and-hold fill completes) — `notificationAsync(Success)`, the app's ONLY Success. If testing reads it as applause: fallback `impactAsync(Medium)`, never silence.
  6. **Safety stop screen** — `notificationAsync(Warning)`, the app's only Warning.
- **Contractually haptic-FREE**: stem chips, "+", Copy-unlock state change, streaming/working transitions, **no-bridge reveal (nothing — stillness is the message)**, all navigation/sheets/scroll.
- **Sound: zero, as policy.** The recording session category (`.record`/`.playAndRecord`) bypasses the silent switch — any app sound can betray the user in the room. No expo-av/expo-audio feedback code ships. VoiceOver gets `AccessibilityInfo.announceForAccessibilityWithOptions` ("Recording", "Saved", "Copied", queued per-section result announcements) instead of earcons.
- **Trap**: haptics silently no-op in Low Power Mode / active camera / dictation — every haptic pairs with a visible state change; the app must feel complete with zero haptics.

## 8. Sheets & context menus

- **Sheets**: Expo Router native-stack screen options — `presentation:'formSheet'`, `sheetAllowedDetents:[0.55, 0.95]` (or `['fitToContents']` for the short ones), `sheetInitialDetentIndex:0`, `sheetGrabberVisible:true`, **`sheetCornerRadius` left UNSET** so iOS 26 supplies the concentric system radius. New deps: none (react-native-screens in stack). New build: no.
  - Surfaces: "Read it" (past entries), Settings. Inner content painted paper `#FBF7F3` / dark `#1E1827` via `DynamicColorIOS` — system chrome outside, editorial paper inside.
  - **Trap #1**: `flex:1` inside `'fitToContents'` detents is still broken on SDK 56 — give fitToContents sheets explicit heights. **Trap #2**: RN `InputAccessoryView` breaks inside formSheet — already avoided (keyboard-controller). Fallback: numeric detents `[0.55, 0.95]` everywhere if fitToContents misbehaves.
- **Context menus (optional, phase 2 of same build)**: `zeego` 3.x + `react-native-ios-context-menu` v3 + `react-native-ios-utilities` for long-press on saved entries (Copy bridge / Read again / Delete destructive). New build: **YES**. **Trap**: peer ranges vs RN 0.85 are UNVERIFIED — run `npm i --dry-run` and check before committing; if peers fail, ship without it (long-press menu deferred, not faked with a JS menu).
- **Rejected**: `@gorhom/bottom-sheet` and any JS sheet — detent physics and the iOS 26 glass edge are unfakeable.
- **Liquid Glass**: `expo-glass-effect` is **NOT installed in this build**. The voice-capture spec settled the listening pill as hairline-surface (quiet, receiving), which removes the one sanctioned glass moment; every other candidate surface is content-layer where Apple itself bans glass. Revisit only if a floating copy-confirm lozenge is added later — then: `GlassView glassEffectStyle:'regular'`, triple-gated on `isLiquidGlassAvailable() && !reduceTransparency`, never opacity-animated (documented breakage).

## 9. Launch-to-keyboard timing

- **Libraries**: `expo-splash-screen` (in SDK) + `expo-font` **config plugin** (not `useFonts`). Config plugin: **YES** (both). New build: **YES**.
- **Fonts embedded at build time** — first-frame availability, zero FOUT on "What happened?": plugin lists 6 static TTFs — InstrumentSerif Regular + Italic (register Italic as its own family, never `fontStyle:'italic'`), HankenGrotesk 400/500/600 **extracted statics** (Google ships it variable — extract with fontTools; Expo warns against VFs), SpaceMono 400. Verify embedded PostScript names once with `Font.getLoadedFonts()` and pin them in tokens.
- **Splash**: config `backgroundColor:'#FBF7F3'`, `dark:{backgroundColor:'#15111B'}`, no image (or wordmark at `imageWidth:96`); runtime `SplashScreen.setOptions({fade:true, duration:220})`; `preventAutoHideAsync()` at module scope, `hideAsync()` gated on fonts loaded. The splash IS the capture screen's empty paper.
- **Keyboard**: `autoFocus` on the capture TextInput → keyboard springs on frame one; the system keyboard slide IS the launch animation (zero entrance choreography — the Raycast rule). Cold-start target: cursor ready <400ms.
- **Trap**: Expo Go / dev builds do NOT show the real splash — verify timing on a **preview/release** build only. Also iOS cannot present a keyboard during the launch screen; first frame via autoFocus is the earliest possible, accept it.
- **App icon** (same build): Icon Composer layered `.icon` bundle → `app.json ios.icon` (SDK 54+ supports it). Verify tinted/clear variants — the mark must survive on silhouette alone.

## 10. Dynamic Type clamping

- **API**: RN core `dynamicTypeRamp` (iOS-only) + `maxFontSizeMultiplier`, baked into **one `<AppText role="…">` wrapper** so per-screen hand-tuning is unrepresentable. No deps, no build.
- **Tier table** (family/size/lineHeight-px/letterSpacing-pt/ramp/cap):
  - `display-q` InstrumentSerif 34/38/−0.41 · largeTitle · **1.3**
  - `display-verdict` 30/34/−0.36 · title1 · 1.3
  - `bridge-sentence` InstrumentSerif-Italic 26/32/−0.31 · title1 · 1.3 (hung open-quote `marginLeft:-10`)
  - `card-head` 22/26/−0.26 · title2 · 1.3
  - `ui-body` HankenGrotesk-Regular 17/24/0 · body · **UNCAPPED** (the user's own vent text scales fully to AX5)
  - `ui-secondary` 15/21/0 · 1.5 · soft `#6F6880`
  - `btn-primary` HankenGrotesk-SemiBold 17/22/+0.2 · 1.35 — Speak pill uses `minHeight:64`, never fixed height
  - `chip` Medium 14/18/+0.1 · 1.2 · `eyebrow` SpaceMono 11/16/+0.88 caps · 1.35 · `privacy` 12/16 · SOFT not mute · 1.35
- **Hard rules**: serif floor 20pt; every `<Text>` gets explicit color; lineHeight always px (the CLAUDE.md law); never animate scale on a serif headline (raster shimmer) — translateY/opacity only.
- **Trap (UNVERIFIED)**: whether RN 0.85 scales a hard px lineHeight with the font at AX sizes — **verify on-device at AX5 before shipping**; if lines overlap, compute lineHeight in AppText as `Math.round(scaledFontSize * ratio)`.
- **Under Dynamic Type AX**: chips wrap to two accessory rows rather than shrink.

## 11. Cross-cutting (bind the other tracks' choices)

- **Theme**: tokens hosted in `DynamicColorIOS({light, dark})` (`bg`, `surface`, `ink`, `soft`, `mute`, readable accents) — native-layer flips, correct app-switcher snapshots, no JS re-render. Follow system appearance, **no in-app toggle**; don't swap theme mid-capture (apply on next screen). Ship the readable-variant tokens now: `text-coral #BE452C`, `text-violet #5F53D6`, `text-green #1F7D62`, `readable-mute #8F87A0`, dark-soft `#948DA8`; dark text stack `#EDE7E2` / `rgba(237,231,226,0.87)` / hairline `rgba(237,231,226,0.08)`.
- **Motion tokens** (Reanimated 4 duration/dampingRatio mode = 1:1 with SwiftUI `spring(duration:bounce:)`): `spring.smooth {duration:500, dampingRatio:1}`, `spring.snappy {350, 0.85}`, `spring.gentle {700, 1}`; fades `withTiming 200ms Easing.out(Easing.quad)`; the ONE sub-0.85 exception: Copy-unlock tick `{300, 0.7}` at 2% scale. Entering/exiting: FadeIn/FadeOut only, travel capped 8–12px via `.withInitialValues()`; BounceIn/Zoom/Flip/LightSpeed banned. Leave `reduceMotion: ReduceMotion.System` (default) everywhere; single zustand a11y store (reduceMotion + reduceTransparency + boldText + screenReader, live via AccessibilityInfo events) is the review gate: no loop without a static state, no navigator transition without `animation:'fade'` fallback.
- **Pressable atom**: onPressIn scale `withTiming(0.97, {duration:110, easing:Easing.out(Easing.quad)})` + opacity 0.85; onPressOut `withSpring(1, {damping:20, stiffness:300})`; chips opacity-only to 0.7; Speak pill 0.98 max. Kill any `TouchableOpacity` (activeOpacity 0.2 = web flicker).
- **VoiceOver result flow**: `accessibilityLiveRegion` is Android-only — use `announceForAccessibilityWithOptions(text, {queue:true})` per completed section, then `sendAccessibilityEvent` focus to the bridge. Speak pill: `accessibilityRole:'togglebutton'` + `accessibilityState:{checked}`.

---

## NEW DEPENDENCIES — ordered, one build

Install order (peer-risk first):

1. `react-native-keyboard-controller@~1.22` — native, no plugin; add `KeyboardProvider` + `DISABLE_COMMIT_PAUSING_MECHANISM`
2. `expo-speech-recognition` (jamsch, SDK-56-pinned tag) — **config plugin** carrying both purpose strings
3. `expo-haptics` (SDK 56) — native
4. `expo-symbols` (SDK 56) — native, beta, always pass `fallback`
5. `expo-font` **config plugin** entry + 6 static TTFs in `assets/fonts/`
6. `expo-splash-screen` config (paper/dark backgroundColor, fade 220) — plugin config change
7. `app.json` additions: `ios.infoPlist.CADisableMinimumFrameDurationOnPhone: true`, `ios.icon: './assets/oneside.icon'`
8. *(conditional)* `zeego@3` + `react-native-ios-context-menu@3` + `react-native-ios-utilities` — ONLY after `npm i --dry-run` confirms peer ranges against RN 0.85; drop from the build if they don't, no substitute

**Explicitly NOT installed**: `expo-glass-effect` (no sanctioned glass moment left in the settled screens), `@gorhom/bottom-sheet` (native formSheet instead), any audio library for feedback (zero-sound policy), FlashList (no long lists — plain ScrollView keeps rubber-banding pristine).

**The build**: all of the above are native modules or config-plugin/Info.plist changes → they ship together in **ONE EAS build pair from the same commit**: `eas build --profile development --platform ios` (new dev client — the old one cannot load any of this) and `eas build --profile preview --platform ios` (the only build where splash timing, embedded fonts, the .icon variants, and formSheet detents can actually be verified). Nothing here is OTA-updatable; sequence every JS feature in this map AFTER this build lands.

**Verify on the preview build, on device**: cold launch <400ms to cursor · fonts at first frame (no FOUT) · both permission dialogs show the editorial strings · haptic map under Low Power Mode (must feel complete) · AX5 Dynamic Type (lineHeight overlap check — the one flagged unknown) · iOS 16.4 sim (no dictation library — keyboard mic fallback) · iOS 26 device (formSheet concentric corners, icon variants, Reduce Transparency + Reduce Motion matrix).

## Decisions taken
1) Streaming vs buffering: the motion track spec'd a token-streaming renderer (batched chunk fades); the reveal track argued buffer-then-stage. Buffering wins — the no-bridge verdict leak and the two-preset choreography are only possible with a complete parsed response, and at ~120 words TTFT dominates anyway. The streaming renderer spec is dropped; no SSE transport ships. 2) Haptic map: four tracks gave four conflicting maps (Medium/Light on speak, Soft on pressIn, Rigid/Soft pair, Soft/Rigid inverted). The dedicated haptics track wins as canonical: Rigid start (onPressIn, before session open) / Soft stop (after teardown) / Soft submit / Light bridge-land (taken from the reveal track since buffering makes arrival discrete) / Success on copy / Warning on safety stop — six total, no-bridge and chips contractually silent. 3) Liquid Glass: the HIG track licensed one GlassView on the recording Speak pill, but the voice-capture track settled the listening pill as a quiet hairline surface — those are mutually exclusive; the voice track's register argument wins, so expo-glass-effect is not installed at all. 4) sheetCornerRadius: RN-fidelity track said 28, HIG track said leave unset for the iOS 26 concentric system value — unset wins. 5) Dynamic Type caps: typography track (1.3 display / 1.35 chrome / body uncapped) over the a11y track's looser 1.6/2.0 — the typography table is per-role and maps each style to its honest Apple ramp; body staying uncapped satisfies the a11y intent. 6) Copy interaction: kept the teardown track's 450ms press-and-hold fill, completing with the haptics track's Success (fallback Medium, never silence). 7) zeego made conditional rather than committed — its peer ranges vs RN 0.85 were flagged unverified by the source track itself.

## Open for owner
1) Run `npm i --dry-run` for zeego 3.x + react-native-ios-context-menu v3 against RN 0.85 before the build is queued — include or drop, no substitute. 2) Confirm the exact expo-speech-recognition tag/version pinned for SDK 56 (repo publishes per-SDK pins; @sdk-54 was the last one verified in research). 3) On-device AX5 test: whether RN 0.85 scales hard px lineHeight with the font — flagged unverified; if lines overlap, AppText computes lineHeight from the scaled size. 4) Extract HankenGrotesk 400/500/600 statics from the variable font (fontTools) and build the Icon Composer .icon in Xcode 26 — both are human/tooling steps outside npm. 5) Speak-pill label contrast in light theme (white on #EF6A53 = 3.06:1 fails) — a design call the a11y track left open: darker fill family (#BE452C-class) vs ink-dark label; verify with the contrast script before tokens freeze. 6) If user testing reads notificationAsync(Success) on copy as applause, swap to impactAsync(Medium) — pre-approved fallback, no re-litigation needed.
