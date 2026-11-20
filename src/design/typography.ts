import type { TextStyle } from 'react-native';

export const fontFamily = {
  display: 'BigShouldersDisplay_700Bold',
  displayBlack: 'BigShouldersDisplay_900Black',
  body: 'SchibstedGrotesk_400Regular',
  bodyMedium: 'SchibstedGrotesk_500Medium',
  bodyBold: 'SchibstedGrotesk_700Bold',
  mono: 'SometypeMono_400Regular',
  monoMedium: 'SometypeMono_500Medium',
} as const;

// lineHeight is pixels in RN; tracking is em-relative (-2% on display).
const tracked = (size: number, em: number) => size * em;

export const type = {
  hero: {
    fontFamily: fontFamily.displayBlack,
    fontSize: 72,
    lineHeight: 72,
    letterSpacing: tracked(72, -0.02),
  },
  cue: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: tracked(40, -0.02),
  },
  title: { fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 },
  callout: { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 },
  button: { fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 },
  readout: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

export function display(size: number, black = false): TextStyle {
  return {
    fontFamily: black ? fontFamily.displayBlack : fontFamily.display,
    fontSize: size,
    lineHeight: Math.round(size * 0.98),
    letterSpacing: tracked(size, -0.02),
  };
}

// An uppercase display heading. Big Shoulders' accents sit above its cap height (É tops out at 0.97 em, the cap at
// 0.8), so at the display leading iOS cut them off: ÜBERGANG read UBERGANG, RÉCEPTION read RECEPTION. 1.2 em is the
// font's own line height (ascender 0.98 + descender 0.21) and leaves the accents their room.
export function displayCaps(size: number): TextStyle {
  return { ...display(size), lineHeight: Math.round(size * 1.2), textTransform: 'uppercase' };
}
