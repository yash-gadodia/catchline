// The design rules (.claude/skills/catchline-ui), one per scripts/check-*.ts guard.
import ts from 'typescript';
import {
  type Rule,
  hasSpread,
  inAtoms,
  inDesign,
  isNumberLiteral,
  isTest,
  numberOf,
  prop,
  propName,
  walk,
} from './design-guard';

const appCode = (rel: string) => !inDesign(rel) && !isTest(rel);

function objects(sf: ts.SourceFile): ts.ObjectLiteralExpression[] {
  const out: ts.ObjectLiteralExpression[] = [];
  walk(sf, (n) => {
    if (ts.isObjectLiteralExpression(n)) out.push(n);
  });
  return out;
}

function styleProps(sf: ts.SourceFile, key: RegExp): ts.PropertyAssignment[] {
  return objects(sf).flatMap((o) =>
    o.properties.filter((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && key.test(propName(p) ?? '')),
  );
}

// Colours come from src/design/tokens. The flare is a token too (colors.flare).
const COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$|^(?:rgba?|hsla?)\(/i;
export const rawColors: Rule = {
  name: 'check-raw-colors',
  message: 'raw colour (hex, rgb(), hsl()) outside src/design; use a role from src/design/tokens.',
  applies: appCode,
  find: (sf) => {
    const hits: ts.Node[] = [];
    walk(sf, (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && COLOR.test(n.text.trim())) hits.push(n);
    });
    return hits;
  },
};

// Type comes from src/design/typography (type.*, display(), fontFamily.*). Atoms may size text
// from their own props, but no file may write lineHeight as a CSS multiplier.
export const typeTokens: Rule = {
  name: 'check-type-tokens',
  message:
    'raw fontSize / lineHeight / fontFamily / fontWeight outside src/design and src/components; use type.* or display() from src/design/typography. lineHeight is pixels, never a multiplier.',
  applies: appCode,
  find: (sf, rel) =>
    styleProps(sf, /^(fontSize|lineHeight|fontFamily|fontWeight)$/).filter((p) => {
      const key = propName(p);
      const v = p.initializer;
      if (key === 'lineHeight' && ts.isNumericLiteral(v) && Number(v.text) < 4) return true;
      if (inAtoms(rel)) return false;
      if (key === 'fontFamily' || key === 'fontWeight') return ts.isStringLiteral(v) || ts.isNumericLiteral(v);
      return isNumberLiteral(v);
    }),
};

// Radii come from radius.* and a rounded token corner is continuous (the iOS squircle), so a
// control matches the system's own buttons. A circle (`x / 2`, or a literal half of an equal
// width and height) needs neither.
const RADIUS_KEY = /^border\w*Radius$/;
function radiusOk(e: ts.Expression): 'ok' | 'token' | 'raw' {
  if (ts.isParenthesizedExpression(e)) return radiusOk(e.expression);
  if (ts.isConditionalExpression(e)) {
    const a = radiusOk(e.whenTrue);
    const b = radiusOk(e.whenFalse);
    return a === 'raw' || b === 'raw' ? 'raw' : a === 'token' || b === 'token' ? 'token' : 'ok';
  }
  if (ts.isNumericLiteral(e)) return Number(e.text) === 0 ? 'ok' : 'raw';
  if (ts.isPropertyAccessExpression(e) && e.expression.getText() === 'radius') {
    return e.name.text === 'image' ? 'ok' : 'token';
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.SlashToken && e.right.getText() === '2') {
    return 'ok';
  }
  return 'raw';
}
export const radiusTokens: Rule = {
  name: 'check-radius-tokens',
  message:
    "borderRadius must be a radius.* token (0 for images, `size / 2` for a circle) and a rounded corner pairs with borderCurve: 'continuous'.",
  applies: appCode,
  find: (sf) =>
    objects(sf).flatMap((o) => {
      const curve = prop(o, 'borderCurve');
      const curved = hasSpread(o) || (curve !== undefined && /continuous/.test(curve.getText()));
      const w = prop(o, 'width');
      const h = prop(o, 'height');
      const side = w && h && w.getText() === h.getText() ? numberOf(w) : undefined;
      return o.properties.filter((p): p is ts.PropertyAssignment => {
        if (!ts.isPropertyAssignment(p) || !RADIUS_KEY.test(propName(p) ?? '')) return false;
        if (side !== undefined && numberOf(p.initializer) === side / 2) return false;
        const kind = radiusOk(p.initializer);
        return kind === 'raw' || (kind === 'token' && !curved);
      });
    }),
};

// No pill shapes: a radius at or past half the height turns a 56pt button into a capsule. A square
// (width equal to height) is a circle, which is allowed (the shutter, a dot).
export const noPills: Rule = {
  name: 'check-no-pills',
  message: 'pill shape (borderRadius >= height / 2, or >= 20); controls are 56pt with radius.control (4).',
  applies: appCode,
  find: (sf) =>
    objects(sf).flatMap((o) => {
      const r = o.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && RADIUS_KEY.test(propName(p) ?? ''),
      );
      const value = r && numberOf(r.initializer);
      if (!r || value === undefined || value === 0) return [];
      const height = prop(o, 'height');
      const width = prop(o, 'width');
      const h = numberOf(height);
      if (height && width && height.getText() === width.getText()) return [];
      if (h !== undefined) return value * 2 >= h ? [r] : [];
      return value >= 20 ? [r] : [];
    }),
};

// RN does not inherit colour from a View: every top-level <Text> sets its own. A nested <Text>
// inherits from its parent Text, so only the outermost is checked. A style the file cannot see
// into (a variable, a prop) gets the benefit of the doubt; a typography token carries no colour.
const TEXT_TAG = /^(Text|Animated\.Text)$/;
const COLOURLESS = /^(type\.\w+|display\(.*\)|kickStyle)$/s;
function hasColor(e: ts.Expression | undefined): boolean {
  if (!e) return false;
  if (ts.isParenthesizedExpression(e)) return hasColor(e.expression);
  if (ts.isObjectLiteralExpression(e)) return hasSpread(e) || prop(e, 'color') !== undefined;
  if (ts.isArrayLiteralExpression(e)) return e.elements.some((x) => hasColor(x));
  if (ts.isConditionalExpression(e)) return hasColor(e.whenTrue) && hasColor(e.whenFalse);
  if (ts.isBinaryExpression(e)) return hasColor(e.right);
  if (ts.isSpreadElement(e)) return hasColor(e.expression);
  return !COLOURLESS.test(e.getText());
}
function textInsideText(n: ts.Node): boolean {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && TEXT_TAG.test(p.openingElement.tagName.getText())) return true;
  }
  return false;
}
export const textColor: Rule = {
  name: 'check-text-color',
  message: '<Text> without an explicit color; RN defaults to black, invisible on the black canvas.',
  applies: appCode,
  find: (sf) => {
    const hits: ts.Node[] = [];
    walk(sf, (n) => {
      if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return;
      if (!TEXT_TAG.test(n.tagName.getText())) return;
      const target = ts.isJsxOpeningElement(n) ? n.parent : n;
      if (textInsideText(target)) return;
      const style = n.attributes.properties.find(
        (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === 'style',
      );
      const spread = n.attributes.properties.some(ts.isJsxSpreadAttribute);
      const expr = style?.initializer && ts.isJsxExpression(style.initializer) ? style.initializer.expression : undefined;
      if (!spread && !hasColor(expr)) hits.push(n);
    });
    return hits;
  },
};

// Spacing comes from space.* (4/8/12/16/24/32/40/48, gutter 24). A literal scaled by * or / is a
// proportion (an atom's em-relative gap), not a spacing value.
const SPACING_KEY = /^((padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|gap|rowGap|columnGap)$/;
function rawSpacing(e: ts.Expression): boolean {
  let raw = false;
  walk(e, (n) => {
    if (!ts.isNumericLiteral(n) || Number(n.text) === 0) return;
    let p = n.parent;
    while (ts.isPrefixUnaryExpression(p) || ts.isParenthesizedExpression(p)) p = p.parent;
    const scaled =
      ts.isBinaryExpression(p) &&
      [ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(p.operatorToken.kind);
    if (!scaled) raw = true;
  });
  return raw;
}
export const spacingTokens: Rule = {
  name: 'check-spacing-tokens',
  message: 'raw padding / margin / gap; use space.* from src/design/tokens.',
  applies: appCode,
  find: (sf) => styleProps(sf, SPACING_KEY).filter((p) => rawSpacing(p.initializer)),
};

export const RULES = [rawColors, typeTokens, radiusTokens, noPills, textColor, spacingTokens];
