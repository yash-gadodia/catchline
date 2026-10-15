---
name: catchline-ui
description: The Catchline visual system for React Native screens and atoms. Read before building or changing any screen, sheet, overlay, chart, share card or atom, before picking a colour, type style, spacing, radius or animation, and before writing any UI copy. Covers the black/bone/flare palette, the three type voices, hierarchy, spacing, shape, motion, art direction for the strobe silhouettes and bar path, iOS-native polish, copy voice, and the design guards that enforce it. Triggers on new screen, restyle, "make it look better", "feels off", button, sheet, row, chip, chart, overlay, animation, copy, design tokens, borderRadius, fontSize, colour.
---

# Catchline UI

Direction: chronophotography (Marey, Muybridge, Edgerton). A black-and-white sports spread with one flare of red. **The lifter is the image; the app is the caption.** Every screen should read like a caption under a photograph: quiet type, one measured number, one action.

The single source is `src/design` (`tokens.ts`, `typography.ts`). The visual reference is `~/dev/liftcheck-research/design/Catchline Design System.dc.html`; where it disagrees with this skill or CLAUDE.md (the design file's flare is `#FF3B2F`, the app's is `#FF1F3D`), this skill wins. The live catalogue of every token and atom is the dev route `catchline://dev/design` (`app/dev/design.tsx`); open it when unsure what a token looks like.

## 1. Colour: monochrome plus one flare

- Use roles from `colors`, never values: `bg` (black canvas), `surface` / `surface2` (raised), `hairline` (the line role: dividers, outlines), `text` (bone), `text2`, `text3` (ink steps), `flare` (the bar path and the one primary action), `onFlare` (label on flare), `danger` (destructive, drawn as a flare outline, never a fill), `halo` (the black under the flare path on video), `scrim` (veil over video). A veil at another alpha is `shade(alpha)`.
- **Flare means two things only: the bar path and the primary action.** One flare button per screen. Never flare for decoration, headings, icons, charts' lines (the trend line is bone; only the latest point and the cue marker are flare) or status.
- No status colours. Stuck is bone filled, trying is flare, didn't stick is bone hollow, dropped is `text3`. Delta arrows and viewfinder ticks are bone.
- Video stays in colour; strobe cutouts are desaturated to bone.
- A new colour is a role in `Palette` (dark and light values side by side), never a literal in a screen. Legibility floor from the design: bone on black 17:1, flare on black 5.9:1; check any new pair the same way.

## 2. Type: three voices

| Voice | Face | Use |
|---|---|---|
| What the lifter should feel | Big Shoulders Display (`type.hero`, `type.cue`, `display(size)`) | the cue, the one big number, a screen title on a hero |
| What the app says | Schibsted Grotesk (`type.title`, `body`, `callout`, `label`, `button`, `small`) | everything conversational |
| What was measured | Sometype Mono (`type.readout`, `type.caption`, `<Readout>`, `<SmallCaps>`) | numbers, frames, timings, phase names |

- Pick a style by role from `type.*`, then add `color`. Never write `fontSize`, `lineHeight`, `fontFamily` or `fontWeight` in a screen; atoms may size text from their own props. Weight comes from the family (`bodyBold`), never `fontWeight` (it synthesises or silently does nothing on a custom font).
- `lineHeight` is pixels (`fontSize * ~1.35`), never a multiplier: `lineHeight: 1.5` renders a 1.5px sliver.
- **Every top-level `<Text>` sets `color`.** RN does not inherit from a View; the default is black on a black canvas.
- Mono is only for measured values. A number that changes (timer, rep count, cm) uses mono so its width holds.
- Hierarchy is size and voice, not weight soup: one display element per screen, then title, then body. Big Shoulders is tracked `-2%` (`display()` does it); never track body text.
- Copy is stored in sentence case; small caps come from `<SmallCaps>`, never typed capitals.

## 3. Space and layout

- Spacing is `space.*` (4, 8, 12, 16, 24, 32, 40, 48; `gutter` 24 is the screen edge). A gap between groups is at least twice the gap inside a group (8 inside, 16 to 24 between).
- Group with space first, a `hairline` second, a surface last. No cards around content that space already groups; the cue is a pull quote, not a card.
- Content bleeds (video, strobe, photos edge to edge, radius 0); controls and text stay inside the gutter and the safe area (`useSafeAreaInsets`, never a fake status bar). Tab screens pad their bottom so CTAs clear the floating tab bar.
- One primary action, at the bottom within thumb reach, full width inside the gutter.

## 4. Shape

- Radii are `radius.image` 0 (all imagery, evidence frames), `radius.control` 4 (buttons, chips, segmented, inputs), `radius.sheet` 12 (the sheet: the only rounded surface). Spread `...shape.control` / `...shape.sheet`, which carry `borderCurve: 'continuous'` (the iOS squircle). A hand-written token radius pairs with `borderCurve: 'continuous'`.
- **No pills.** Buttons and chips are `control.height` 56 (compact 48, chip 40) at radius 4. A radius at half the height turns a control into a capsule. Circles (the shutter, 8pt key-frame dots) are fine: equal width and height, radius half.
- Outlines are `stroke.outline` 2 (secondary button), dividers `stroke.hairline` 1, the bar path `stroke.path` 3 with a `stroke.halo` 8 black halo.
- No shadows, no gradients for depth, no glass. Depth on this product comes from the photograph.

## 5. Motion

- Durations and curves come from `motion` (`duration.pop` 180, `fade` 200, `move` 400, `pulse` 500, `breathe` 800, `draw` 900; `stagger` 140; `Easing.bezier(...motion.easing.out)`).
- Motion explains, it never decorates: the bar path draws (`draw`), the strobe pops in sequence, the number lands. Routine taps get no animation beyond the press state (`opacity.pressed` on flare, `surface2` on outline).
- Respect `useReducedMotion()`: show the end state at once (the `AnimatedMark` pattern), keep opacity changes, drop travel, scale and overshoot.
- Pair any animated state with a static cue (a label, a filled dot). Haptics (`src/lib/haptics`) land on the moment the thing is decided, once.

## 6. Art direction: silhouettes, strobe, bar path

- Strobe stack opacities are `strobe.*`: setup 0.35, knee 0.45, hip 0.55, catch 1 (in colour), recovery 0.4. Cutouts desaturated to bone with a 1px bone edge.
- The bar path is flare, `stroke.path`, round caps and joins, on a `halo` black halo; key frames are 8pt bone dots; the decisive moment is a flare dot.
- Gymnastics: the hip trail is flare, the bar a hairline, the body-line angle drawn as two rays with an arc.
- Evidence frames are 1:1 crops, radius 0, one dimension line, one number in mono.
- Trend charts: bone line on black, flare dot for the latest, values typed at the points, no grid, the cue date as a flare marker, best as a dashed line with its label clear of the polyline.
- Silhouette and processing art is drawn from the lifter's own frames or tokens; never stock illustration, never emoji.

## 7. iOS polish

- Hit targets at least 44pt (`hitSlop` on text buttons); 12pt between adjacent controls.
- `accessibilityRole` on every Pressable, `accessibilityState` for selected, `accessibilityLabel` on icon-only controls; Dynamic Type must not clip (no fixed heights around text).
- Native sheet and back behaviours over custom ones; the swipe-back gesture must keep working.
- Check every new screen at the smallest supported width with real content lengths (long movement names, two-line cues).

## 8. Copy voice

- Plain, specific, second person. Say what was measured: "Bar drift at hip", "Your hips rose before the bar passed your knee". The cue is labelled "AI estimate". It says when it cannot see ("Couldn't see the bar at the catch"). It never gives a score.
- Never "prevent injury" or "diagnose" (`check-banned-copy`). No hype, no exclamation marks, no emoji, no em dashes.
- Buttons are verb-first and short: "Try this next session", "Retake", "Delete lift". The secondary path is honest: "Not for me".
- Errors say what happened and the next step, next to where it broke.

## 9. Atoms before one-offs

Reuse `src/components`: `Btn` (primary, secondary, text, compact), `Segmented`, `Readout`, `SmallCaps`, `TopBar`, `Sheet`, `Mark`. A pressable styled as a 56pt button or a hairline list row outside `src/components` is a one-off; the second time a pattern appears, it becomes an atom (with a catalogue entry in `app/dev/design.tsx`).

## 10. Guards

`npm run check` runs `check-raw-colors`, `check-type-tokens`, `check-radius-tokens`, `check-no-pills`, `check-text-color` and `check-spacing-tokens` (rules in `scripts/design-rules.ts`, tests beside them). Today's violations are a per-file count in `scripts/design-baseline.json`; a file can never exceed its count, and a new file starts at zero. When a guard fires, fix it with a token or an atom. A deliberate exception carries `// design-ok: <reason>` on the line or the line above. After cleaning a file, `npx tsx scripts/design-baseline.ts --write` lowers its count; never raise a count to make a check pass. Screens are reviewed against this skill with the design-review skill.
