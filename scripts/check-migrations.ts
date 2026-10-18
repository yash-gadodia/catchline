// Migrations are append-only and numbered once.
//   npx tsx scripts/check-migrations.ts   check supabase/migrations against origin/catchline
// Two branches that each add 0016 both pass alone and collide on merge; `supabase db push`
// records versions by prefix, so one of them never runs. An edited migration that prod already
// applied never re-runs, so prod and a fresh `supabase db reset` silently diverge: fix forward
// with a new migration instead. A migration this branch added can still be edited.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const DIR = 'supabase/migrations';
if (process.argv.length > 2) process.exit(0);

const errors: string[] = [];
const seen = new Map<string, string>();
for (const f of readdirSync(join(ROOT, DIR)).filter((f) => f.endsWith('.sql')).sort()) {
  const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(f);
  if (!m) {
    errors.push(`${DIR}/${f}: name it NNNN_snake_case.sql`);
    continue;
  }
  const other = seen.get(m[1]);
  if (other) errors.push(`${DIR}/${f}: prefix ${m[1]} is taken by ${other}; renumber to the next free one`);
  seen.set(m[1], f);
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
let base = '';
try {
  base = git('merge-base', 'HEAD', 'origin/catchline');
} catch {
  console.log('check-migrations: no origin/catchline here, skipping the append-only check.');
}
if (base) {
  for (const line of git('diff', '--name-status', base, '--', DIR).split('\n').filter(Boolean)) {
    const [status, path] = line.split('\t');
    if (status !== 'A') errors.push(`${path}: already on catchline (${status}); add a new migration instead of editing it`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  console.error(`check-migrations: ${errors.length} problem(s).`);
  process.exit(1);
}
