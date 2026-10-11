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
  scrim: 'rgba(247,245,240,0.8)',
};

// The analysis surfaces are always dark: the lifter is a photograph on black.
export const colors = dark;

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

export const stroke = {
  hairline: 1,
  outline: 2,
  path: 3,
  halo: 8,
  ghost: 2,
} as const;

export const opacity = {
  strobeMin: 0.35,
  strobeMax: 0.6,
  ghost: 0.4,
  lines: 0.6,
} as const;

export const control = {
  height: 56,
  chipHeight: 40,
  compactHeight: 48,
} as const;
