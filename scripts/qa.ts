// The full gate, in order and quiet: one line per passing step; a failing step
// prints its full output and stops the run with that step's exit code.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const STEPS: [string, string[], string?][] = [
  ['typecheck', ['npm', 'run', 'typecheck']],
  ['check-all', ['npm', 'run', 'check']],
  ['jest', ['npx', 'jest', '--ci']],
  ['cv pytest', ['uv', 'run', 'pytest', '-q'], 'cv'],
  ['worker pytest', ['uv', 'run', 'pytest', '-q'], 'worker'],
  ['deno test', ['deno', 'test', '-q', '--allow-env', '--allow-read'], 'supabase/functions'],
  ['expo export', ['npx', 'expo', 'export', '-p', 'ios']],
];

for (const [name, [cmd, ...args], dir] of STEPS) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd: resolve(ROOT, dir ?? '.'), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) {
    console.log(`PASS  ${name} (${secs}s)`);
    continue;
  }
  console.log(`FAIL  ${name} (${secs}s, exit ${r.status})\n`);
  process.stdout.write(`${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `${r.error}\n` : ''}`);
  process.exit(r.status ?? 1);
}
console.log('qa passed');
