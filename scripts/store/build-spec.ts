// App Store assets: the share spec the app would build for a tracked lift, so the
// macOS track-share harness renders exactly what the app exports.
//   npx tsx scripts/store/build-spec.ts <dir with analysis.json + body.json> <out.json> [graph|story] [frame]
// story: the 9:16 story, with STORY_KICKER, STORY_TITLE and STORY_CODE from the environment
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTrackSpec } from '../../src/features/share/trackShare';

const [dir, out, graphArg, frameArg] = process.argv.slice(2);
const analysis = JSON.parse(readFileSync(join(dir, 'analysis.json'), 'utf8'));
const body = JSON.parse(readFileSync(join(dir, 'body.json'), 'utf8'));
const spec = buildTrackSpec(
  analysis,
  body,
  { path: true, lines: true, body: true, watermark: true, speed: 1, details: { graph: graphArg === 'graph', caption: null },
    ...(graphArg === 'story' ? { story: { kicker: process.env.STORY_KICKER ?? null, title: process.env.STORY_TITLE ?? null, code: process.env.STORY_CODE ?? null } } : {}) },
  frameArg ? Number(frameArg) : undefined,
);
writeFileSync(out, JSON.stringify(spec));
console.log(`${out}: frames ${spec.startFrame}-${spec.endFrame}`);
