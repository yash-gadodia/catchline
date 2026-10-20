// Device measurement parity + timing per trace: npx tsx scripts/device-parity.ts [expected dir] [trace dir]
// (defaults: src/analysis/device/fixtures and cv/tests/fixtures/traces; point both at private dirs of
// dump_device_parity.py output and the traces it read for other lifts)
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import { analyseTrace } from '../src/analysis/device/analyseTrace';
import { Fixture, headline, runFixture } from '../src/analysis/device/parity';
import { Trace, parseTraceJson } from '../src/analysis/device/trace';

const dir = process.argv[2] ?? join(__dirname, '..', 'src', 'analysis', 'device', 'fixtures');
const traces = process.argv[3] ?? join(__dirname, '..', 'cv', 'tests', 'fixtures', 'traces');
const gz = (p: string) => gunzipSync(readFileSync(p)).toString();
const loadTrace = (name: string): Trace => {
  const p = [`${name}.trace.json.gz`, `${name}.json.gz`].map((f) => join(traces, f)).find(existsSync);
  if (!p) throw new Error(`no trace for ${name} in ${traces}`);
  return parseTraceJson(gz(p)) as Trace;
};

let bad = 0;
let largest: { name: string; movement: string; frames: number } | null = null;
console.log('trace | movement | python | ts | mismatches | max rel | ms');
for (const f of readdirSync(dir).filter((x) => x.endsWith('.expected.json.gz')).sort()) {
  const fx = JSON.parse(gz(join(dir, f))) as Fixture;
  const trace = loadTrace(fx.name);
  const runs = [1, 2, 3].map(() => runFixture(fx, trace));
  const { diffs, analysis } = runs[0];
  const ms = Math.min(...runs.map((r) => r.ms));
  const n = Object.values(diffs).reduce((s, d) => s + d.mismatches.length, 0);
  const rel = Math.max(...Object.values(diffs).map((d) => d.maxRel));
  bad += n;
  const frames = Object.values(trace.pose)[0].n;
  if (!largest || frames > largest.frames) largest = { name: fx.name, movement: fx.movement, frames };
  const tag = fx.movement + (fx.forced ? ' (forced)' : '');
  console.log(`${fx.name.slice(0, 8)} | ${tag} | ${headline(fx.expected.analysis)} | ${headline(analysis)} | ${n} | ${rel.toExponential(1)} | ${ms} (${frames} fr)`);
  for (const [k, d] of Object.entries(diffs)) for (const m of d.mismatches.slice(0, 8)) console.log(`  ${k} ${m}`);
}
if (largest) {
  const text = gz([`${largest.name}.trace.json.gz`, `${largest.name}.json.gz`].map((f) => join(traces, f)).find(existsSync) as string);
  const times = [1, 2, 3].map(() => {
    const t0 = Date.now();
    analyseTrace(parseTraceJson(text), largest!.movement);
    return Date.now() - t0;
  });
  console.log(`analyseTrace on the largest trace (${largest.name.slice(0, 8)}, ${largest.frames} frames, parse included): ${Math.min(...times)} ms`);
}
process.exit(bad ? 1 : 0);
