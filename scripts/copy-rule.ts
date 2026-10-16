// The raw-copy guard (scripts/check-raw-copy.ts): user-facing words in JSX go through t() from src/i18n,
// so every language gets them. Flags JSX text, string literals in copy props (title, label, ...) and
// string literals rendered as JSX children. Dev-only screens are allowlisted; a deliberate exception
// (a brand name, a unit) carries `// i18n-ok: <reason>` on the line or the line above.
import ts from 'typescript';
import { isTest, walk, type Rule } from './design-guard';

export const COPY_PROPS = new Set([
  'title',
  'label',
  'sub',
  'subtitle',
  'placeholder',
  'accessibilityLabel',
  'accessibilityHint',
  'message',
  'caption',
  'text',
  'cta',
  'body',
]);

export const ALLOWED = [/^app\/dev\//, /^app\/dev\.tsx$/, /^app\/dev-pose\.tsx$/, /^app\/paywall\/dev\.tsx$/];

const WORD = /\p{L}{2,}/u;

function hasWord(e: ts.Node): boolean {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return WORD.test(e.text);
  if (ts.isTemplateExpression(e)) return WORD.test(e.head.text) || e.templateSpans.some((s) => WORD.test(s.literal.text));
  if (ts.isParenthesizedExpression(e)) return hasWord(e.expression);
  if (ts.isConditionalExpression(e)) return hasWord(e.whenTrue) || hasWord(e.whenFalse);
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return hasWord(e.right);
    }
    if (op === ts.SyntaxKind.PlusToken) return hasWord(e.left) || hasWord(e.right);
  }
  return false;
}

function escaped(sf: ts.SourceFile, node: ts.Node): boolean {
  const lines = sf.text.split('\n');
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  return [line, line - 1].some((l) => l >= 0 && /i18n-ok:/.test(lines[l] ?? ''));
}

export const rawCopy: Rule = {
  name: 'check-raw-copy',
  message: 'user-facing copy in JSX must go through t() from src/i18n (add the key to src/i18n/en).',
  applies: (rel) =>
    (rel.startsWith('app/') || rel.startsWith('src/features/')) && !isTest(rel) && !ALLOWED.some((r) => r.test(rel)),
  find: (sf) => {
    const hits: ts.Node[] = [];
    walk(sf, (n) => {
      if (ts.isJsxText(n) && WORD.test(n.text)) hits.push(n);
      else if (ts.isJsxAttribute(n) && n.initializer && COPY_PROPS.has(n.name.getText(sf))) {
        const init = n.initializer;
        const e = ts.isJsxExpression(init) ? init.expression : init;
        if (e && hasWord(e)) hits.push(n);
      } else if (
        ts.isJsxExpression(n) &&
        n.expression &&
        (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) &&
        hasWord(n.expression)
      ) {
        hits.push(n);
      }
    });
    return hits.filter((n) => !escaped(sf, n));
  },
};
