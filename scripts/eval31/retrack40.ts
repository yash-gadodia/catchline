// Re-runs the 4.0 tracking on traces track40.ts saved (no harness, so only what the trace already holds), to try a
// change to the TS rules in seconds: node retrack40.cjs DIR [DIR ...] rewrites analysis.json and body.json in place
// and prints the share of the path read off the plate and how many reads the trace lacked.
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';

import { trackTrace } from '../../src/analysis/device/analyseTrace';
import { parseTraceJson } from '../../src/analysis/device/trace';

for (const dir of process.argv.slice(2)) {
  const id = dir.replace(/\/$/, '').split('/').pop() as string;
  try {
    const t = trackTrace(parseTraceJson(gunzipSync(readFileSync(`${dir}/trace.json.gz`)).toString()), { analysisId: id, assetPrefix: id });
    const path = ((t.analysis.reps as { path: { src?: string }[] }[])[0]?.path ?? []) as { src?: string }[];
    const plate = path.filter((p) => p.src === 'plate').length;
    writeFileSync(`${dir}/analysis.json`, JSON.stringify(t.analysis));
    writeFileSync(`${dir}/body.json`, JSON.stringify(t.body));
    console.log(id, 'plate', path.length ? Math.round((100 * plate) / path.length) : 0, 'pts', path.length, 'misses', t.misses.length);
  } catch (e) {
    console.log(id, 'error', (e as Error).message.slice(0, 80));
  }
}
