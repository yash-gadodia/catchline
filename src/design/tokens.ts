export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  hairline: string;
  text: string;
  text2: string;
  text3: string;
  flare: string;
  onFlare: string;
  danger: string;
  halo: string;
  scrim: string;
};

export const dark: Palette = {
  bg: '#000000',
  surface: '#141414',
  surface2: '#1F1F1F',
  hairline: '#2E2E2E',
  text: '#EDE9E1',
  text2: '#A39F97',
  text3: '#6E6B65',
  flare: '#FF1F3D',
  onFlare: '#000000',
  danger: '#FF1F3D',
  halo: '#000000',
  scrim: 'rgba(0,0,0,0.7)',
};

export const light: Palette = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  surface2: '#ECE9E2',
  hairline: '#D9D5CC',
  text: '#101010',
  text2: '#5A5750',
  text3: '#8C8982',
  flare: '#D90F2D',
  onFlare: '#FFFFFF',
  danger: '#D90F2D',
  halo: '#000000',
  scrim: 'rgba(247,245,240,0.8)',
};

// The analysis surfaces are always dark: the lifter is a photograph on black.
// Roles: bg canvas, surface/surface2 raised, hairline the line role, text/text2/text3 ink steps,
// flare the bar path and the one primary action, danger a destructive outline (flare by design),
// halo the black under the flare path on video, scrim a veil over video.
export const colors = dark;

// A black veil over video at a given alpha (gradients, captions on footage). Video is always dark,
// so this does not follow the palette.
export const shade = (alpha: number) => `rgba(0,0,0,${alpha})`;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 40,
  s8: 48,
  gutter: 24,
} as const;

export const radius = {
  image: 0,
  control: 4,
  sheet: 12,
} as const;

// Every rounded token corner is continuous (the iOS squircle), so controls match the system's own.
export const curve = 'continuous' as const;
export const shape = {
  control: { borderRadius: radius.control, borderCurve: curve },
  sheet: { borderRadius: radius.sheet, borderCurve: curve },
} as const;

export const stroke = {
  hairline: 1,
  outline: 2,
  path: 2.5,
  halo: 4,
  ghost: 2,
} as const;

export const opacity = {
  strobeMin: 0.35,
  strobeMax: 0.6,
  ghost: 0.4,
  lines: 0.6,
  pressed: 0.85,
  muted: 0.5,
} as const;

// The strobe stack's per-phase opacity (design system "Overlay and data"): faint early, solid catch.
export const strobe = {
  setup: 0.35,
  knee: 0.45,
  hip: 0.55,
  catch: 1,
  recovery: 0.4,
} as const;

// Durations in ms and cubic-bezier control points (Easing.bezier(...motion.easing.out)). Kept as
// numbers so this file stays importable outside React Native (the design guards read it).
export const motion = {
  duration: { pop: 180, fade: 200, move: 400, pulse: 500, breathe: 800, draw: 900 },
  stagger: 140,
  easing: {
    out: [0.33, 1, 0.68, 1],
    draw: [0.3, 0.8, 0.2, 1],
    pop: [0.2, 1.4, 0.4, 1],
  },
} as const;

export const control = {
  height: 56,
  chipHeight: 40,
  compactHeight: 48,
} as const;
