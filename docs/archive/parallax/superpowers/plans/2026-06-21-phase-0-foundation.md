# Phase 0 — Foundation & Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `2026-06-21-parallax-roadmap.md` (Global Constraints) first — they apply to every task here.

**Goal:** Stand up the Expo + TypeScript app with the complete, pixel-faithful Parallax design system (tokens, fonts, atom library), the navigation shell, and the unit-tested pure domain logic — so every later phase has a foundation to build screens on.

**Architecture:** Expo Router app at repo root. Design tokens and typography in `src/design/`. UI atoms in `src/components/` are faithful ports of `design_handoff_parallax/design_files/couples-core.jsx`, adapting web-only techniques to RN (gradient text → MaskedView+LinearGradient; backdrop-filter → expo-blur; CSS keyframes → Reanimated; SVG via react-native-svg). Pure logic (reveal scoring, wavelength/mood) lives in `src/domain/` and is unit-tested with no RN dependency.

**Tech Stack:** Expo SDK 53+, TypeScript, Expo Router, react-native-reanimated, react-native-gesture-handler, react-native-svg, expo-linear-gradient, @react-native-masked-view/masked-view, expo-blur, expo-font + @expo-google-fonts/*, react-native-safe-area-context. Tests: jest-expo + @testing-library/react-native.

## Global Constraints

See the roadmap's Global Constraints section — all apply here. Most load-bearing for Phase 0: exact colors/fonts/wordmark/tagline copied verbatim; code-drawn assets only; safe-area not mock chrome; `npx expo install` for native deps; reveal scoring formula fixed.

---

### Task 0: Scaffold Expo app + tooling

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `jest.config.js`, `jest-setup.ts`, `.gitignore` (append)
- Create: `app/_layout.tsx` (temporary minimal), `src/domain/smoke.test.ts`

**Interfaces:**
- Produces: a running Expo Router app skeleton; a green `npm test`; clean `npx tsc --noEmit`.

- [ ] **Step 1: Initialize the Expo Router + TypeScript project at repo root**

```bash
cd /Users/yash/dev/parallax
npx create-expo-app@latest . --template default   # 'default' = Expo Router + TS; keep existing non-conflicting files
```
If it refuses to write into a non-empty dir, scaffold in a temp dir and move `app/ package.json app.json tsconfig.json babel.config.js` in, preserving `design_handoff_parallax/`, `docs/`, `.claude/`, root `CLAUDE.md`/`ARCHITECTURE.md`.

- [ ] **Step 2: Install native + state + test dependencies (SDK-matched)**

```bash
npx expo install react-native-reanimated react-native-gesture-handler react-native-svg \
  expo-linear-gradient @react-native-masked-view/masked-view expo-blur \
  react-native-safe-area-context react-native-screens expo-font expo-haptics \
  @expo-google-fonts/instrument-serif @expo-google-fonts/hanken-grotesk @expo-google-fonts/space-mono \
  @react-native-async-storage/async-storage react-native-url-polyfill
npm install zustand @tanstack/react-query @supabase/supabase-js
npm install -D jest jest-expo @testing-library/react-native @types/jest react-test-renderer
```

- [ ] **Step 3: Configure Reanimated babel plugin, jest, and tsconfig**

`babel.config.js` must list `'react-native-reanimated/plugin'` LAST in plugins. `jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated))',
  ],
};
```
`jest-setup.ts`: `import '@testing-library/react-native/extend-expect';` and `require('react-native-reanimated').setUpTests?.();`. Add npm scripts: `"test": "jest"`, `"test:watch": "jest --watch"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 4: Write a smoke test**

```ts
// src/domain/smoke.test.ts
test('jest-expo runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run test + typecheck + boot**

Run: `npm test` → Expected: 1 passing. Run: `npm run typecheck` → Expected: no errors. Run: `npx expo start` and confirm the default screen loads on iOS simulator.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold expo router + ts app with design/test tooling"
```

---

### Task 1: Design tokens

**Files:**
- Create: `src/design/tokens.ts`, `src/design/tokens.test.ts`

**Interfaces:**
- Produces: `colors`, `gradients`, `shadows`, `radius`, `space` exports. `colors` keys: `bg0 bg1 surface surfaceSoft sunken line ink inkSoft inkMute p1 p1Deep p2 p2Deep match matchDeep`. Source values: `Parallax-final.html:11-28`.

- [ ] **Step 1: Write the failing test (exact hex — catches palette typos)**

```ts
// src/design/tokens.test.ts
import { colors, radius } from './tokens';
test('core palette matches the spec exactly', () => {
  expect(colors.p1).toBe('#FF8E7A');
  expect(colors.p1Deep).toBe('#EF6A53');
  expect(colors.p2).toBe('#9D95F5');
  expect(colors.p2Deep).toBe('#7064E6');
  expect(colors.match).toBe('#54C2A0');
  expect(colors.matchDeep).toBe('#2E9C7C');
  expect(colors.ink).toBe('#3A3340');
  expect(colors.surface).toBe('#FFFDFD');
  expect(colors.sunken).toBe('#F4ECF4');
});
test('pill radius is 999', () => { expect(radius.pill).toBe(999); });
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test src/design/tokens.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement tokens** — Create `src/design/tokens.ts` with `colors` (all hex above + `inkSoft '#8B8398'`, `inkMute '#B7B0C2'`, `bg0 '#FBF1F2'`, `bg1 '#F1ECFB'`, `surfaceSoft 'rgba(255,255,255,0.62)'`, `line 'rgba(58,51,64,0.09)'`), `gradients` (`us`, `usSoft`, `dawn` — store as the LinearGradient color arrays + angle, since RN has no CSS gradient string; e.g. `us: { colors:['#FF8E7A','#C387C9','#9D95F5'], locations:[0,0.48,1] }`), `shadows` (RN shadow objects approximating `--shadow`/`--shadow-soft`/`--shadow-pop` from html:23-25), `radius` (`pill:999, card:26, cardLg:30, tile:14`), `space` (`gutter:20, cardPad:16, gap:12`).

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test src/design/tokens.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/design/tokens.* && git commit -m "feat: design tokens from prototype spec"`

---

### Task 2: Typography + font loading

**Files:**
- Create: `src/design/fonts.ts`, `src/design/typography.ts`, `src/design/typography.test.ts`
- Modify: `app/_layout.tsx` (gate render on fonts loaded)

**Interfaces:**
- Consumes: `colors` from tokens.
- Produces: `useAppFonts(): boolean` (fonts-ready), `fontFamily` (`{ disp, ui, mono }`), and the `<Kick>` / `<Serif>` text helper specs (built in Task 10 as components; here export the style objects `kickStyle`, `serifStyle`). Font family names: `'InstrumentSerif_400Regular'`, `'HankenGrotesk_400Regular'..'_800ExtraBold'`, `'SpaceMono_400Regular'/'_700Bold'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/design/typography.test.ts
import { fontFamily, kickStyle } from './typography';
test('mono kicker is 10px / 0.18em uppercase', () => {
  expect(kickStyle.fontFamily).toBe(fontFamily.mono);
  expect(kickStyle.fontSize).toBe(10);
  expect(kickStyle.letterSpacing).toBeCloseTo(1.8, 5); // 0.18em * 10px
  expect(kickStyle.textTransform).toBe('uppercase');
});
```

- [ ] **Step 2: Run test → FAIL.**

- [ ] **Step 3: Implement** — `fonts.ts`: `useAppFonts` wraps the three `useFonts` hooks from `@expo-google-fonts/*`. `typography.ts`: `fontFamily = { disp:'InstrumentSerif_400Regular', ui:'HankenGrotesk_400Regular', mono:'SpaceMono_400Regular' }`; `kickStyle = { fontFamily: fontFamily.mono, fontSize:10, letterSpacing:1.8, textTransform:'uppercase', color: colors.inkMute }`; `serifStyle = { fontFamily: fontFamily.disp, lineHeight: 1.09*34 }`-style helper. RN `letterSpacing` is in px (not em) — convert `em*fontSize`.

- [ ] **Step 4: Run test → PASS.**

- [ ] **Step 5: Gate the app on fonts** — In `app/_layout.tsx`, call `useAppFonts()` and return `null` (or a splash) until ready, then render `<Stack/>`.

- [ ] **Step 6: Commit** — `git commit -am "feat: fonts + typography helpers"`

---

### Task 3: Domain — reveal scoring (TDD)

**Files:**
- Create: `src/domain/reveal.ts`, `src/domain/reveal.test.ts`

**Interfaces:**
- Produces:
```ts
export interface PromptAnswers { youPick: number; youHunch: number; themPick: number; themHunch: number; }
export interface RevealScore { yourHits: number; theirHits: number; twins: number; wave: number; }
export function scoreReveal(prompts: PromptAnswers[]): RevealScore;
```
Faithful generalization of `couples-core.jsx:309-318`: `yourHits` = youHunch===themPick; `theirHits` = themHunch===youPick; `twins` = youPick===themPick; `wave = round((yourHits+theirHits)/(n*2)*100)`, `0` when `n===0`.

- [ ] **Step 1: Write the failing tests (exact expected values)**

```ts
// src/domain/reveal.test.ts
import { scoreReveal } from './reveal';
const p = (youPick:number, youHunch:number, themPick:number, themHunch:number) => ({youPick,youHunch,themPick,themHunch});
test('perfect sync → wave 100, all hits, twins counted', () => {
  const r = scoreReveal([p(1,1,1,1), p(0,0,0,0), p(2,2,2,2)]);
  expect(r).toEqual({ yourHits: 3, theirHits: 3, twins: 3, wave: 100 });
});
test('half the hunches land → wave 50', () => {
  // yourHits: youHunch===themPick → [1==1 ✓, 4==0 ✗, 1==3 ✗] = 1
  // theirHits: themHunch===youPick → [4==1 ✗, 0==1 ✗, 1==3 ✗]... build exact:
  const r = scoreReveal([p(1,1,1,1), p(1,0,0,1), p(0,0,1,0)]);
  // yourHits: 1==1✓,0==0✓,0==1✗ =2 ; theirHits: 1==1✓,1==1✓,0==0✓=3 → (2+3)/6=83.33→83
  expect(r.yourHits).toBe(2); expect(r.theirHits).toBe(3); expect(r.wave).toBe(83);
});
test('no overlap → wave 0', () => {
  expect(scoreReveal([p(0,1,2,3)])).toEqual({ yourHits:0, theirHits:0, twins:0, wave:0 });
});
test('empty → wave 0, no NaN', () => {
  expect(scoreReveal([])).toEqual({ yourHits:0, theirHits:0, twins:0, wave:0 });
});
```

- [ ] **Step 2: Run test → FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/domain/reveal.ts
export interface PromptAnswers { youPick: number; youHunch: number; themPick: number; themHunch: number; }
export interface RevealScore { yourHits: number; theirHits: number; twins: number; wave: number; }
export function scoreReveal(prompts: PromptAnswers[]): RevealScore {
  let yourHits = 0, theirHits = 0, twins = 0;
  for (const p of prompts) {
    if (p.youHunch === p.themPick) yourHits++;
    if (p.themHunch === p.youPick) theirHits++;
    if (p.youPick === p.themPick) twins++;
  }
  const wave = prompts.length ? Math.round(((yourHits + theirHits) / (prompts.length * 2)) * 100) : 0;
  return { yourHits, theirHits, twins, wave };
}
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: reveal scoring domain logic"`

---

### Task 4: Domain — wavelength verdict + Peek mood (TDD)

**Files:**
- Create: `src/domain/wavelength.ts`, `src/domain/wavelength.test.ts`

**Interfaces:**
- Produces: `peekMoodForWave(wave:number): 'focus'|'happy'|'search'` (thresholds from `couples-screens.jsx` Reveal: ≥70 'focus', ≥45 'happy', else 'search'); `wordmarkOffsetForWave` is N/A (offset is time-based, not score-based). Keep verdict COPY in the screen (ported at build time), not here.

- [ ] **Step 1: Write the failing tests (boundary-exact)**

```ts
// src/domain/wavelength.test.ts
import { peekMoodForWave } from './wavelength';
test('mood thresholds', () => {
  expect(peekMoodForWave(70)).toBe('focus');
  expect(peekMoodForWave(69)).toBe('happy');
  expect(peekMoodForWave(45)).toBe('happy');
  expect(peekMoodForWave(44)).toBe('search');
  expect(peekMoodForWave(0)).toBe('search');
  expect(peekMoodForWave(100)).toBe('focus');
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `export const peekMoodForWave = (w:number) => w>=70?'focus':w>=45?'happy':'search';`
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: wavelength mood mapping"`

---

### Task 5: Icon system (G + I path map)

**Files:**
- Create: `src/components/Icon.tsx`, `src/components/Icon.test.tsx`

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces: `Icon` component `{ d:string, size?:number, color?:string, sw?:number, fill?:string }` and `ICONS` map. Port the `I` path map verbatim from `couples-core.jsx:98-123` and `G` from `:124-127`, rendered with react-native-svg `<Svg viewBox="0 0 20 20"><Path .../></Svg>`. Map web props: `c→stroke`, `sw→strokeWidth`, default `strokeLinecap/Linejoin="round"`.

- [ ] **Step 1: Write the failing render test**

```tsx
// src/components/Icon.test.tsx
import { render } from '@testing-library/react-native';
import { Icon, ICONS } from './Icon';
test('renders a known icon path', () => {
  const { UNSAFE_root } = render(<Icon d={ICONS.heart} />);
  expect(ICONS.home).toBeTruthy();
  expect(UNSAFE_root).toBeTruthy();
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — Port `ICONS` (all keys: spark home cards us back fwd chevR check cross share flame lock heart copy close bell gear plus send chat pencil bolt link logout grid stack apple card star) and `Icon` per the interface above.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: svg icon system"`

---

### Task 6: Wordmark + Slashes + Mark

**Files:**
- Create: `src/components/Wordmark.tsx`, `src/components/Mark.tsx`, `src/components/Wordmark.test.tsx`

**Interfaces:**
- Consumes: `colors`, `fontFamily`.
- Produces: `Wordmark({ size?, color?, light?, offset?:boolean })`, `Slashes({ offset?, light? })`, `Mark({ size? })`. Port `Slashes`/`Wordmark` from `couples-core.jsx:144-163` and `Mark` from `:130-137`.

**RN adaptations:** The two slashes are `<View>`s, not spans: `width = 0.1em→size*0.1`, `height = 0.7em→size*0.7`, `transform:[{skewX:'-11deg'}]`. The `offset` shift (2nd bar up `0.13em`) animates via Reanimated `useSharedValue` translating `-(size*0.13)→0` over 550ms cubic-bezier when `offset` goes true→false. `Mark` = two overlapping `<Circle>`s in react-native-svg (coral fillOpacity 0.92, periwinkle 0.78 with `mixBlendMode` unavailable → approximate with opacity). The `para`/`ax` text uses `fontFamily.disp`.

- [ ] **Step 1: Render test** — `render(<Wordmark/>)` mounts; `render(<Wordmark offset/>)` mounts; `render(<Mark/>)` mounts (assert no throw).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per interface + adaptations above.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: para//ax wordmark + mark glyph"`

---

### Task 7: Peek mascot

**Files:**
- Create: `src/components/Peek.tsx`, `src/components/Peek.test.tsx`

**Interfaces:**
- Produces: `Peek({ size?, mood?:'happy'|'focus'|'search'|'love' })`. Port the SVG from `couples-core.jsx:167-197` to react-native-svg (`Circle`, `Ellipse`, `Path`, `G`). Two overlapping lens circles (coral/periwinkle), pupil positions shift inward vs outward by mood, mouth path varies, `focus` adds a sparkle, `love` swaps eyes for arcs. The blink (`pxblink`) and search-dart (`pxdart`) animations → Reanimated loops on the pupil `<G>`.

- [ ] **Step 1: Render test** — render each of the 4 moods without throwing; assert the component returns a non-null tree per mood.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per source; animations may be added but the static per-mood render is the test gate.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: Peek mascot (4 moods)"`

---

### Task 8: Ring (animated wavelength ring)

**Files:**
- Create: `src/components/Ring.tsx`, `src/components/Ring.test.tsx`

**Interfaces:**
- Produces: `Ring({ pct:number, size?:number, animate?:boolean })`. Port `couples-core.jsx:293-308`: react-native-svg `<Svg>` with `<Defs><LinearGradient id="usg">` (coral→periwinkle), a track `<Circle stroke=sunken>` and a progress `<Circle>` with `strokeDasharray=c`, `strokeDashoffset=c*(1-pct/100)`, rotated -90°. Animate `strokeDashoffset` from full→target over 1.1s cubic-bezier with Reanimated `useAnimatedProps` on an `Animated.createAnimatedComponent(Circle)`.

- [ ] **Step 1: Render test** — `render(<Ring pct={83} />)` mounts; `render(<Ring pct={0} />)` mounts.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per source + Reanimated animated props.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: animated wavelength Ring"`

---

### Task 9: GradientText

**Files:**
- Create: `src/components/GradientText.tsx`, `src/components/GradientText.test.tsx`

**Interfaces:**
- Produces: `GradientText({ children, style, gradient? })` — replaces web `-webkit-background-clip:text`. Implementation: `<MaskedView maskElement={<Text style={style}>{children}</Text>}><LinearGradient colors={gradient ?? gradients.us.colors} start={{x:0,y:0}} end={{x:1,y:1}}><Text style={[style,{opacity:0}]}>{children}</Text></LinearGradient></MaskedView>`. Used for wave %, big serif scores, "wavelength" headers.

- [ ] **Step 1: Render test** — `render(<GradientText style={{fontSize:50}}>83%</GradientText>)` mounts and contains the text "83%".
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per interface.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: GradientText via MaskedView"`

---

### Task 10: Core atoms — Press, Btn, Chip, Tok, Stat, Card, Kick, Serif

**Files:**
- Create: `src/components/Press.tsx`, `Btn.tsx`, `Chip.tsx`, `Tok.tsx`, `Stat.tsx`, `Card.tsx`, `Text.tsx` (Kick + Serif), and one test file `src/components/atoms.test.tsx`

**Interfaces:**
- Consumes: tokens, typography, Icon.
- Produces (ports of `couples-core.jsx`):
  - `Press({ onPress, disabled, scale?, style, children })` — `Pressable` scaling to `0.975` on press (Reanimated or `Animated`), 0.14s. Source `:229-240`.
  - `Btn({ children, onPress, kind?:'ink'|'us'|'coral'|'soft', sub?, disabled? })` — pill, minHeight 58. Source `:243-262`.
  - `Chip({ children, you?, soft? })` — source `:276-283`.
  - `Tok({ who:{initial}, size?, ring?, you? })` — avatar. Source `:216-226`.
  - `Stat({ big, label, grad? })` — source `:284-292` (`grad` uses GradientText).
  - `Card` — `View` with `cardBase` (`:264`).
  - `Kick`, `Serif` text components — source `:207-213` using `kickStyle`/`serifStyle`.

- [ ] **Step 1: Write interaction + render tests**

```tsx
// src/components/atoms.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { Btn } from './Btn';
test('Btn fires onPress when enabled', () => {
  const onPress = jest.fn();
  const { getByText } = render(<Btn onPress={onPress}>Play today's three</Btn>);
  fireEvent.press(getByText("Play today's three"));
  expect(onPress).toHaveBeenCalledTimes(1);
});
test('Btn does not fire when disabled', () => {
  const onPress = jest.fn();
  const { getByText } = render(<Btn onPress={onPress} disabled>Nope</Btn>);
  fireEvent.press(getByText('Nope'));
  expect(onPress).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** all atoms per the ports above.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: core UI atoms (Press/Btn/Chip/Tok/Stat/Card/text)"`

---

### Task 11: Sheet + Toast

**Files:**
- Create: `src/components/Sheet.tsx`, `src/components/Toast.tsx`, `src/store/ui.ts`, `src/components/sheet.test.tsx`

**Interfaces:**
- Consumes: tokens, expo-blur, Reanimated, gesture-handler.
- Produces: `Sheet({ title?, onClose, children })` — bottom sheet: dim backdrop (`rgba(40,28,50,0.4)` + `expo-blur` BlurView), surface with `borderTopRadius 32`, drag handle, slide-up via Reanimated (`pxsheet` 0.34s). Source `:411-425`. `Toast({ msg })` — pill, slide-up, auto-dismiss; source `:426-433`. `src/store/ui.ts` — Zustand store `{ toast, fireToast(msg) }` (auto-clear after 1900ms) and `{ sheet, openSheet, closeSheet }`.

- [ ] **Step 1: Test** — render `<Sheet onClose={fn}>...</Sheet>` mounts and shows title; pressing the backdrop calls `onClose` (use testID on backdrop). `fireToast` sets then clears `toast` (use fake timers, advance 1900ms, assert null).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per interface.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: bottom Sheet + Toast + ui store"`

---

### Task 12: TopBar + frosted tab Nav

**Files:**
- Create: `src/components/TopBar.tsx`, `src/components/TabBar.tsx`, `src/components/nav.test.tsx`

**Interfaces:**
- Consumes: tokens, Icon, expo-blur.
- Produces: `TopBar({ title, onBack, right? })` (port `:393-408`); `TabBar` — a custom `expo-router` `Tabs` `tabBar` render prop showing 3 frosted pills Today/Refocus/Us (port `:366-390`), `backdrop-filter`→`expo-blur` BlurView, Refocus icon always coral-filled heart, active tab bold. Bottom inset via safe-area.

- [ ] **Step 1: Test** — `render(<TopBar title="LOVE MAP" onBack={fn}/>)` shows the title; pressing back calls `onBack`. `TabBar` renders 3 labels: Today, Refocus, Us.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** per interface.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat: TopBar + frosted tab bar"`

---

### Task 13: Navigation shell (Expo Router)

**Files:**
- Modify: `app/_layout.tsx`
- Create: `app/index.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/today.tsx`, `app/(tabs)/refocus.tsx`, `app/(tabs)/us.tsx`, `app/(onboarding)/index.tsx`, and empty stack route stubs (`app/play.tsx`, `reveal.tsx`, `waiting.tsx`, `packs.tsx`, `packDetail.tsx`, `dropDetail.tsx`, `thread.tsx`, `profile.tsx`, `editProfile.tsx`, `checkout.tsx`, `plusSuccess.tsx`, `manageSub.tsx`, `lovemap.tsx`, `activity.tsx`, `streak.tsx`, `milestone.tsx`, `wrapped.tsx`, `widgetSetup.tsx`, `homeScreen.tsx`), and sheet routes `app/(sheets)/share.tsx`, `plus.tsx`, `spice.tsx`.

**Interfaces:**
- Consumes: fonts gate (Task 2), providers, TabBar, the dawn background.
- Produces: the running navigation graph. `app/_layout.tsx` wraps `GestureHandlerRootView` + `SafeAreaProvider` + `QueryClientProvider` + fonts gate, renders root `<Stack>` with `(tabs)`, stack screens, and `(sheets)` group as `presentation:'transparentModal'`. `app/index.tsx` redirects to `(onboarding)` (auth/pairing wired in Phase 1; for now always onboarding). `(tabs)/_layout.tsx` uses the custom `TabBar`. Each tab/stub screen renders the dawn background (`gradients.dawn` via LinearGradient) + a placeholder label + safe-area padding.

- [ ] **Step 1: Test** — render `app/(tabs)/today.tsx` default export mounts and shows a "Today" placeholder. (Full router navigation is verified manually.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the layouts + stubs per interface.
- [ ] **Step 4: Run → PASS**, then `npx expo start` and verify: app opens to onboarding placeholder, tab bar switches Today/Refocus/Us, a stack push (e.g. temporary button → `/play`) works, and a sheet route slides up over the screen.
- [ ] **Step 5: Commit** — `git commit -am "feat: expo-router navigation shell (tabs + stack + sheets)"`

---

### Task 14: Component gallery (visual QA gate)

**Files:**
- Create: `app/gallery.tsx` (dev-only route)

**Interfaces:**
- Consumes: every atom.
- Produces: a scrollable screen rendering Wordmark (static + offset toggle), Mark, all Peek moods, Ring at 0/50/83/100 (with animate button), GradientText, all Btn kinds, Chip variants, Tok (ring/you/them), Stat, Kick/Serif samples, a Sheet trigger, and a Toast trigger — on the dawn background.

- [ ] **Step 1: Implement** the gallery composing the atoms.
- [ ] **Step 2: Verify pixel-faithfulness** — `npx expo start`, open `/gallery` on iOS + Android, and compare side-by-side against `design_handoff_parallax/design_files/Parallax-final.html` opened in a browser. Confirm: gradient text reads as a coral→periwinkle gradient; the frosted blur is visible; the wordmark's 2nd slash animates offset→aligned; the ring strokes 0→pct; Peek moods differ. Capture a screenshot for the record.
- [ ] **Step 3: Commit** — `git commit -am "feat: component gallery for visual QA"`

---

## Self-Review

**Spec coverage (Phase 0 scope):** tokens ✓(T1) fonts/type ✓(T2) reveal scoring ✓(T3) mood ✓(T4) icons ✓(T5) wordmark/mark ✓(T6) Peek ✓(T7) Ring ✓(T8) gradient text ✓(T9) Press/Btn/Chip/Tok/Stat/Card/Kick/Serif ✓(T10) Sheet/Toast ✓(T11) TopBar/TabBar ✓(T12) nav shell ✓(T13) visual QA ✓(T14). All `couples-core.jsx` exports are accounted for. `Screen`/`Phone` shell are intentionally NOT ported — replaced by Expo Router layouts + safe-area + the dawn background (per Global Constraints).

**Placeholder scan:** component-port tasks reference exact source `file:lines` + the precise web→RN transform + a render-test gate, rather than re-inlining the prototype's verbatim code (the source lives in-repo at `design_handoff_parallax/`). Novel logic (tokens, domain, GradientText, Ring animation, Sheet) has full inline code/tests.

**Type consistency:** `scoreReveal`/`PromptAnswers`/`RevealScore` (T3) and `peekMoodForWave` (T4) are the only cross-task domain signatures and are used consistently. `colors`/`fontFamily`/`Icon`/atoms names are stable across T1–T14.

**Open item for Phase 1:** `app/index.tsx` currently always routes to onboarding; Phase 1 replaces this with an auth+pairing check.
