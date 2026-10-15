// Per-file counts for every design rule, plus the one-off buttons and rows that should be atoms.
//   npx tsx scripts/design-baseline.ts          print the table
//   npx tsx scripts/design-baseline.ts --write  re-cut scripts/design-baseline.json from today's code
// Re-cut only after fixing violations, never to absorb new ones: a reviewer reads the diff of
// design-baseline.json and every number in it should only go down.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { BASELINE_PATH, ROOT, countsFor, inAtoms, isTest, parse, sourceFiles, walk } from './design-guard';
import { RULES } from './design-rules';

const files = sourceFiles();
const table: Record<string, Record<string, number>> = {};
const baseline: Record<string, Record<string, number>> = {};
for (const rule of RULES) {
  const counts = countsFor(rule, files);
  baseline[rule.name] = Object.fromEntries(
    Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([f, l]) => [f, l.length]),
  );
  for (const [f, l] of Object.entries(counts)) (table[f] ??= {})[rule.name] = l.length;
}

// Pressables styled as a 48/56pt button or a hairline list row outside src/components.
const BUTTON = /height:\s*(56|48|control\.(height|compactHeight))\b/;
const ROW = /border(Bottom|Top)Width/;
for (const rel of files) {
  if (inAtoms(rel) || isTest(rel)) continue;
  const sf = parse(readFileSync(join(ROOT, rel), 'utf8'), rel);
  walk(sf, (n) => {
    if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return;
    if (!/^(Pressable|TouchableOpacity)$/.test(n.tagName.getText())) return;
    const attrs = n.attributes.getText();
    const kind = BUTTON.test(attrs) ? 'one-off-button' : ROW.test(attrs) ? 'one-off-row' : undefined;
    if (kind) (table[rel] ??= {})[kind] = ((table[rel] ??= {})[kind] ?? 0) + 1;
  });
}

const cols = [...RULES.map((r) => r.name), 'one-off-button', 'one-off-row'];
const short = (c: string) => c.replace(/^check-/, '');
const rows = Object.entries(table).sort(([a], [b]) => a.localeCompare(b));
console.log(['file', ...cols.map(short), 'total'].join(' | '));
const totals = cols.map(() => 0);
for (const [f, c] of rows) {
  const vals = cols.map((k, i) => {
    totals[i] += c[k] ?? 0;
    return c[k] ?? 0;
  });
  console.log([f, ...vals, vals.reduce((a, b) => a + b, 0)].join(' | '));
}
console.log(['TOTAL', ...totals, totals.reduce((a, b) => a + b, 0)].join(' | '));

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`wrote ${BASELINE_PATH}`);
}
