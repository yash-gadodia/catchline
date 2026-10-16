// i18n guard: no raw user-facing strings in JSX under app/ and src/features/. Rule in scripts/copy-rule.ts.
import { relative, resolve } from 'node:path';
import { countsFor, ROOT, sourceFiles } from './design-guard';
import { rawCopy } from './copy-rule';

const args = process.argv.slice(2);
const files = args.length > 0 ? args.map((f) => relative(ROOT, resolve(f))) : sourceFiles();
const hits = Object.entries(countsFor(rawCopy, files));
if (hits.length > 0) {
  console.error(`${rawCopy.name}: ${rawCopy.message}`);
  for (const [rel, lines] of hits) console.error(`  ${rel}: lines ${lines.join(', ')}`);
  console.error('  A deliberate exception: `// i18n-ok: <reason>` on the line or the line above.');
  process.exit(1);
}
