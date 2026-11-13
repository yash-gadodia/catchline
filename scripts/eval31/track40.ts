// 4.0 tracking eval: clips through the phone pipeline as the app runs it (harness pose pass, then the plan loop of
// trackTrace, three native passes at most), writing what the app would save per lift and one row per clip.
//   npx tsx scripts/eval31/track40.ts --harness BIN --models DIR --out DIR clip.mov [clip.mov ...]
// A pose pass already in DIR/<name>/ (pose.trace.json.gz + run.json) is reused.
// Per clip in DIR/<name>/: analysis.json, body.json, trace.json.gz. DIR/rows.jsonl: frames, fps, failure, path points,
// the share of the path read off the plate, misses left after the last pass, joints seen, seconds for the pose pass.
import { execFileSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { gunzipSync, gzipSync } from 'zlib';

import { trackTrace } from '../../src/analysis/device/analyseTrace';
import { Trace, parseTraceJson } from '../../src/analysis/device/trace';

const MAX_PASSES = 3;
const args = process.argv.slice(2);
const flags = new Set(['--harness', '--models', '--out', '--tap', '--mark', '--plate']);
const opt = (k: string) => args[args.indexOf(`--${k}`) + 1];
const clips = args.filter((a, i) => !flags.has(a) && !flags.has(args[i - 1]));
const [harness, models, out] = [opt('harness'), opt('models'), opt('out')];
// --mark frame,x,y,r: the lifter's mark on the plate (x, y shares of the frame, r a share of its height), for every
// clip given; --tap frame,x,y: a bare point. --plate DIR: where PlateNet.mlmodelc is (default: with the pose models).
const markArg = (args.includes('--mark') ? opt('mark') : args.includes('--tap') ? opt('tap') : '').split(',').map(Number);
const plateMark = markArg.length >= 3 ? { frame: markArg[0], x: markArg[1], y: markArg[2], ...(markArg.length > 3 ? { r: markArg[3] } : {}) } : undefined;
const plate = args.includes('--plate') ? ['--plate', opt('plate')] : [];
const gz = (p: string) => gunzipSync(readFileSync(p)).toString();
const sh = (a: string[]) => execFileSync(harness, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });

function mergeCalls(a: Trace, b: Trace): Trace {
  const calls = { ...a.calls } as Trace['calls'];
  for (const [k, v] of Object.entries(b.calls)) calls[k] = { ...(calls[k] ?? {}), ...v };
  return { ...b, calls };
}

for (const clip of clips) {
  const id = basename(clip).replace(/\.[^.]+$/, '');
  const dir = join(out, id);
  mkdirSync(dir, { recursive: true });
  const row: Record<string, unknown> = { id };
  try {
    const t0 = Date.now();
    if (!existsSync(join(dir, 'pose.trace.json.gz')) || !existsSync(join(dir, 'run.json'))) sh(['pose', clip, '--models', models, '--out', join(dir, 'pose.trace.json.gz'), '--run-out', join(dir, 'run.json'), '--movement', 'snatch', ...plate]);
    row.poseS = Math.round((Date.now() - t0) / 100) / 10;
    let trace = parseTraceJson(gz(join(dir, 'pose.trace.json.gz'))) as Trace;
    // a pose pass cached from a harness without the model says nothing of it
    if (args.includes('--plate')) trace.plateNet ??= 'eval';
    let tracked = trackTrace(trace, { analysisId: id, assetPrefix: id, plateMark });
    for (let pass = 1; pass < MAX_PASSES && tracked.misses.length; pass++) {
      const planFile = join(dir, `plan${pass}.json`);
      writeFileSync(planFile, JSON.stringify(tracked.plan));
      sh(['analyse', clip, '--models', models, '--plan', planFile, '--run-in', join(dir, 'run.json'), '--out', join(dir, `pix${pass}.trace.json.gz`), '--stills', join(dir, 'stills'), '--movement', 'snatch', ...plate]);
      trace = mergeCalls(trace, parseTraceJson(gz(join(dir, `pix${pass}.trace.json.gz`))) as Trace);
      tracked = trackTrace(trace, { analysisId: id, assetPrefix: id, plateMark });
    }
    row.allS = Math.round((Date.now() - t0) / 100) / 10;
    const a = tracked.analysis as { failure: { code?: string } | null; video: { fps: number; frameCount: number }; traceKind: string; noCueReason?: { offSideDeg?: number }; reps: { path: { src?: string }[] }[] };
    const path = a.reps[0]?.path ?? [];
    const frames = tracked.body?.frames ?? [];
    const seen = frames.reduce((n, r) => n + r.filter((v) => v != null).length, 0);
    Object.assign(row, {
      frames: a.video.frameCount,
      fps: a.video.fps,
      failure: a.failure?.code ?? null,
      kind: a.traceKind,
      offSideDeg: a.noCueReason?.offSideDeg ?? null,
      pathPts: path.length,
      plateShare: path.length ? Math.round((100 * path.filter((p) => p.src === 'plate').length) / path.length) : 0,
      missesLeft: tracked.misses.length,
      jointsSeen: frames.length ? Math.round((100 * seen) / (frames.length * frames[0].length)) : 0,
    });
    writeFileSync(join(dir, 'analysis.json'), JSON.stringify(tracked.analysis));
    writeFileSync(join(dir, 'body.json'), JSON.stringify(tracked.body));
    writeFileSync(join(dir, 'trace.json.gz'), gzipSync(JSON.stringify(trace)));
  } catch (e) {
    row.error = (e as Error).message.split('\n').slice(0, 3).join(' | ');
  }
  appendFileSync(join(out, 'rows.jsonl'), JSON.stringify(row) + '\n');
  process.stderr.write(JSON.stringify(row) + '\n');
}
