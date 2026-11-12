// Re-runs the 4.0 tracking on traces track40.ts saved (no harness, so only what the trace already holds), to try a
// change to the TS rules in seconds: node retrack40.cjs DIR [DIR ...] rewrites analysis.json and body.json in place
// and prints the share of the path read off the plate and how many reads the trace lacked. --marks FILE: lines of
// "ID frame,x,y,r", the lifter's mark per clip, as track40.ts --mark.
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';

import { trackTrace } from '../../src/analysis/device/analyseTrace';
import { PlateMark } from '../../src/analysis/device/pipeline';
import { Trace, parseTraceJson } from '../../src/analysis/device/trace';

const args = process.argv.slice(2);
const marksAt = args.indexOf('--marks');
const marks = new Map<string, PlateMark>();
if (marksAt >= 0)
  for (const line of readFileSync(args[marksAt + 1], 'utf8').split('\n').filter(Boolean)) {
    const [mid, m] = line.split(/\s+/);
    const [frame, x, y, r] = m.split(',').map(Number);
    marks.set(mid, { frame, x, y, r });
  }
for (const dir of args.filter((_, i) => i !== marksAt && i !== marksAt + 1)) {
  const id = dir.replace(/\/$/, '').split('/').pop() as string;
  try {
    const trace = parseTraceJson(gunzipSync(readFileSync(`${dir}/trace.json.gz`)).toString()) as Trace;
    if (trace.calls.plate_net) trace.plateNet ??= 'eval';
    const t = trackTrace(trace, { analysisId: id, assetPrefix: id, plateMark: marks.get(id) });
    const path = ((t.analysis.reps as { path: { src?: string }[] }[])[0]?.path ?? []) as { src?: string }[];
    const plate = path.filter((p) => p.src === 'plate').length;
    writeFileSync(`${dir}/analysis.json`, JSON.stringify(t.analysis));
    writeFileSync(`${dir}/body.json`, JSON.stringify(t.body));
    console.log(id, 'plate', path.length ? Math.round((100 * plate) / path.length) : 0, 'pts', path.length, 'misses', t.misses.length, 'lift', JSON.stringify((t.analysis as { lift?: unknown }).lift ?? null), 'of', (t.body?.frames.length ?? 0));
  } catch (e) {
    console.log(id, 'error', (e as Error).message.slice(0, 80));
  }
}
