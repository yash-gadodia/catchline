import { check } from './design-guard';
import { noPills, radiusTokens, rawColors, spacingTokens, textColor, typeTokens } from './design-rules';

const SCREEN = 'src/features/library/Fixture.tsx';

describe('check-raw-colors', () => {
  it('passes token colours and SVG url() refs', () => {
    expect(check(rawColors, `const a = { color: colors.flare, fill: 'url(#fade)', stroke: shade(0.6) };`, SCREEN)).toEqual([]);
  });
  it('fails hex (the flare included), rgba() in JSX and in style objects', () => {
    const src = `const a = { color: '#FF1F3D' };\nconst b = <Path stroke="#000" />;\nconst c = { backgroundColor: 'rgba(0,0,0,0.6)' };`;
    expect(check(rawColors, src, SCREEN)).toEqual([1, 2, 3]);
  });
  it('ignores src/design, where the values live', () => {
    expect(rawColors.applies('src/design/tokens.ts')).toBe(false);
  });
});

describe('check-type-tokens', () => {
  it('passes type.* and display()', () => {
    expect(check(typeTokens, `const a = [type.body, { color: colors.text }];\nconst b = display(56);`, SCREEN)).toEqual([]);
  });
  it('fails raw fontSize, lineHeight, fontFamily and fontWeight on a screen', () => {
    const src = `const a = { fontSize: 15, lineHeight: 21 };\nconst b = { fontFamily: 'Menlo', fontWeight: '700' };`;
    expect(check(typeTokens, src, SCREEN)).toEqual([1, 1, 2, 2]);
  });
  it('lets an atom size its own text but never as a lineHeight multiplier', () => {
    const src = `const a = { fontSize: 13, lineHeight: 18 };\nconst b = { lineHeight: 1.5 };`;
    expect(check(typeTokens, src, 'src/components/Readout.tsx')).toEqual([2]);
  });
});

describe('check-radius-tokens', () => {
  it('passes a token with a continuous curve, shape spreads, zero and circles', () => {
    const src = [
      `const a = { borderRadius: radius.control, borderCurve: 'continuous' };`,
      `const b = { ...shape.sheet };`,
      `const c = { borderRadius: 0 };`,
      `const d = { width: 8, height: 8, borderRadius: 4 };`,
      `const e = { borderRadius: size / 2 };`,
    ].join('\n');
    expect(check(radiusTokens, src, SCREEN)).toEqual([]);
  });
  it('fails a raw radius and a token without borderCurve', () => {
    const src = `const a = { borderRadius: 6 };\nconst b = { borderTopLeftRadius: radius.sheet };`;
    expect(check(radiusTokens, src, SCREEN)).toEqual([1, 2]);
  });
  it('honours a design-ok comment', () => {
    expect(check(radiusTokens, `// design-ok: grabber is a 4pt capsule\nconst a = { borderRadius: 2 };`, SCREEN)).toEqual([]);
  });
});

describe('check-no-pills', () => {
  it('passes a 56pt control at radius 4 and a circular shutter', () => {
    const src = `const a = { height: control.height, borderRadius: radius.control };\nconst b = { width: 72, height: 72, borderRadius: 36 };`;
    expect(check(noPills, src, SCREEN)).toEqual([]);
  });
  it('fails a capsule button and a 999 radius', () => {
    const src = `const a = { height: 56, borderRadius: 28 };\nconst b = { paddingHorizontal: space.s4, borderRadius: 999 };`;
    expect(check(noPills, src, SCREEN)).toEqual([1, 2]);
  });
});

describe('check-text-color', () => {
  it('passes a coloured Text, an inherited nested Text and a style the file cannot see', () => {
    const src = [
      `const a = <Text style={[type.body, { color: colors.text }]}>x<Text style={{ fontSize: 9 }}>y</Text></Text>;`,
      `const b = <Text style={styles.title}>z</Text>;`,
      `const c = <Text {...props}>w</Text>;`,
    ].join('\n');
    expect(check(textColor, src, SCREEN)).toEqual([]);
  });
  it('fails a bare Text, a token-only style and a colourless Animated.Text', () => {
    const src = `const a = <Text>x</Text>;\nconst b = <Text style={type.body}>y</Text>;\nconst c = <Animated.Text style={display(40)} />;`;
    expect(check(textColor, src, SCREEN)).toEqual([1, 2, 3]);
  });
});

describe('check-spacing-tokens', () => {
  it('passes space.* tokens, insets arithmetic and em-relative gaps', () => {
    const src = `const a = { padding: space.s4, paddingTop: insets.top + space.s5, gap: size * 0.22, margin: 0 };`;
    expect(check(spacingTokens, src, SCREEN)).toEqual([]);
  });
  it('fails literal padding, margin and gap', () => {
    const src = `const a = { paddingVertical: 14 };\nconst b = { marginTop: insets.top + 24, gap: 6 };`;
    expect(check(spacingTokens, src, SCREEN)).toEqual([1, 2, 2]);
  });
});
