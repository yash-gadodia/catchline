// AST engine for the design guards (scripts/check-{raw-colors,type-tokens,radius-tokens,no-pills,
// text-color,spacing-tokens}.ts). The line regex in guard.ts cannot see a style object, so these
// parse each file with the TypeScript compiler and inspect style keys and <Text> elements.
//
// Today's violations live in scripts/design-baseline.json as a per-file count. A file may not
// exceed its count (new files have 0), so drift cannot grow while other screens are mid-edit.
// A deliberate exception carries `// design-ok: <reason>` on the line or the line above.
//   npx tsx scripts/design-baseline.ts          per-file counts for every rule
//   npx tsx scripts/design-baseline.ts --write  re-cut the baseline (only after fixing violations)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { control, radius, space, stroke } from '../src/design/tokens';

export const ROOT = resolve(__dirname, '..');
export const BASELINE_PATH = join(__dirname, 'design-baseline.json');

export type Rule = {
  name: string;
  message: string;
  applies: (rel: string) => boolean;
  find: (sf: ts.SourceFile, rel: string) => ts.Node[];
};

export const isTest = (rel: string) => /\.test\.tsx?$/.test(rel);
export const inDesign = (rel: string) => rel.startsWith('src/design/');
export const inAtoms = (rel: string) => rel.startsWith('src/components/');

const TOKENS: Record<string, Record<string, number>> = { radius, control, space, stroke };

export function parse(source: string, fileName = 'fixture.tsx'): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (c) => walk(c, visit));
}

export function propName(p: ts.ObjectLiteralElementLike): string | undefined {
  if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) return undefined;
  const n = p.name;
  return ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : undefined;
}

export function prop(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (propName(p) !== name) continue;
    if (ts.isPropertyAssignment(p)) return p.initializer;
    if (ts.isShorthandPropertyAssignment(p)) return p.name;
  }
  return undefined;
}

export const hasSpread = (obj: ts.ObjectLiteralExpression) => obj.properties.some(ts.isSpreadAssignment);

// A literal number, a negative literal, or a token like radius.control / control.height.
export function numberOf(e: ts.Expression | undefined): number | undefined {
  if (!e) return undefined;
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) {
    return -Number(e.operand.text);
  }
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
    return TOKENS[e.expression.text]?.[e.name.text];
  }
  return undefined;
}

export const isNumberLiteral = (e: ts.Expression) =>
  ts.isNumericLiteral(e) ||
  (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand));

function suppressed(sf: ts.SourceFile, node: ts.Node): boolean {
  const lines = sf.text.split('\n');
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  return [line, line - 1].some((l) => l >= 0 && /design-ok:/.test(lines[l] ?? ''));
}

export function check(rule: Rule, source: string, rel = 'src/features/fixture.tsx'): number[] {
  const sf = parse(source, rel);
  return rule
    .find(sf, rel)
    .filter((n) => !suppressed(sf, n))
    .map((n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
}

export function sourceFiles(): string[] {
  return ['src', 'app'].flatMap((dir) =>
    (readdirSync(join(ROOT, dir), { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => join(dir, f)),
  );
}

export function readBaseline(): Record<string, Record<string, number>> {
  return existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
}

export function countsFor(rule: Rule, files: string[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const rel of files) {
    if (!/\.tsx?$/.test(rel) || !rule.applies(rel)) continue;
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    const lines = check(rule, readFileSync(path, 'utf8'), rel);
    if (lines.length > 0) out[rel] = lines;
  }
  return out;
}

export function runDesignGuard(rule: Rule): void {
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args.map((f) => relative(ROOT, resolve(f))) : sourceFiles();
  const budget = readBaseline()[rule.name] ?? {};
  const over: string[] = [];
  for (const [rel, lines] of Object.entries(countsFor(rule, files))) {
    const allowed = budget[rel] ?? 0;
    if (lines.length <= allowed) continue;
    over.push(`  ${rel}: ${lines.length} found, baseline ${allowed} (lines ${lines.join(', ')})`);
  }
  if (over.length === 0) return;
  console.error(`${rule.name}: ${rule.message}`);
  for (const o of over) console.error(o);
  console.error('  Fix with src/design tokens or src/components atoms (.claude/skills/catchline-ui).');
  console.error('  A deliberate exception: `// design-ok: <reason>` on the line or the line above.');
  process.exit(1);
}
