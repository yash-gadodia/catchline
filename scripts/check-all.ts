// Runs every scripts/check-*.ts guard concurrently. Adding a guard = adding a file.
//   npx tsx scripts/check-all.ts            every guard over src/ and app/ (npm run check, CI)
//   npx tsx scripts/check-all.ts <file>...  every guard against just those files (edit hook)
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const files = process.argv.slice(2);
const guards = readdirSync(__dirname)
  .filter((f) => /^check-.+\.ts$/.test(f) && f !== 'check-all.ts')
  .sort();

function run(guard: string): Promise<{ guard: string; ok: boolean; output: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(__dirname, guard), ...files], { cwd: ROOT });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => done({ guard, ok: code === 0, output: output.trim() }));
  });
}

Promise.all(guards.map(run)).then((results) => {
  const failed = results.filter((r) => !r.ok);
  for (const r of failed) console.error(r.output || `${r.guard} failed`);
  if (failed.length > 0) {
    console.error(`check-all: ${failed.length} of ${results.length} guard(s) failed.`);
    process.exit(1);
  }
  console.log(`check-all: ${results.length} guard(s) passed${files.length ? ` on ${files.length} file(s)` : ''}.`);
});
