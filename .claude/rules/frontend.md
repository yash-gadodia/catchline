---
paths: ["app/**", "src/components/**", "src/design/**"]
---

# React Native fidelity (hard-won — these caused real visual bugs)

The visual rules (palette, type voices, spacing, shape, motion, art, copy) are `.claude/skills/catchline-ui`; screen review on the simulator is `.claude/skills/design-review`.
The design guards (`scripts/check-{raw-colors,type-tokens,radius-tokens,no-pills,text-color,spacing-tokens}.ts`) enforce them; escape a deliberate case with `// design-ok: <reason>`.

The traps that bit us, in priority order:

- **`lineHeight` is PIXELS, not a CSS multiplier.** `lineHeight: 1.5` clips text to a ~1.5px sliver (invisible). Use `lineHeight: fontSize * ~1.4` (e.g. 14px → 20, button 16.5 → 20). This made descriptions and button labels invisible.
- **Every `<Text>` needs its own explicit `color`.** RN does NOT inherit color from a parent `<View>` (default is black). White-on-dark buttons rendered invisible until each Text got `color`.
- **`letterSpacing`/spacing inside size-parameterized atoms must be em-relative, not hardcoded px.** A hardcoded `letterSpacing: 0.25` is right at `size=25` but wrong when the atom renders at `size=64`: use `size * 0.01`. The design's `0.14em` → `fontSize * 0.14`.
- **Reuse the atom library in `src/components`** (`Btn`, `Mark`, `Readout`, `Row`, `Segmented`, `Sheet`, `SmallCaps`, `TopBar`; the list is whatever `ls src/components` shows). Do NOT reimplement them. Tokens from `src/design/tokens` (colors, radius, space, control, stroke) + `src/design/typography` (`fontFamily`, `type`, `display`): no hardcoded hex that duplicates a token.
- **Web→RN swaps:** a `linear-gradient(...)`/`radial-gradient(...)` **string** is NOT a valid RN `backgroundColor`/`color` (renders nothing) → `expo-linear-gradient`; CSS keyframes → Reanimated; SVG → react-native-svg; `pointerEvents` is a PROP, not a style key. NOTE: `inset` and `display:'flex'` **are** valid in RN 0.71+ (`inset` is the top/right/bottom/left shorthand; flex is the default): do not "fix" them.
- **No fake phone frame / status bar** (prototype scaffolding): use real safe-area insets (`react-native-safe-area-context`).
- **Tab bar**: `src/features/library/TabBar.tsx`, passed to `<Tabs tabBar>` in `app/(tabs)/_layout.tsx` with the in-flight bar above it.
- **TypeScript**: no `any` / `@ts-ignore`. Avoid defensive `try/catch` around `Animated.createAnimatedComponent` (it's reliable).

## Reload caveat (dev build on the simulator; Expo Go cannot run this repo)
Component edits hot-reload via Fast Refresh, but **route `_layout` / structural changes need a full reload** and the dev client caches the bundle — a deep-linked re-open may show stale JS. Verify a layout change with `npx expo export` (bundles all routes) and/or a manual reload (shake → Reload). `osascript` keystroke injection is blocked, so headless reload isn't reliable.
