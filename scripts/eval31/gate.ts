// The real-clip release gate (driven by gate.sh; bundled with esbuild and run on the Mac Mini).
//   node gate.cjs run --clips gate-clips.json --harness BIN --transcoder BIN --models DIR --work DIR --out FILE [--source original]
//       each clip is prepared as the phone prepares it (probe, planEncode, transcode: src/data/prepare.ts), then
//       tracked as the phone tracks it (pose pass, then the plan loop of trackTrace, three native passes at most).
//   node gate.cjs replay --clips gate-clips.json --work DIR --out FILE
//       only the TS rules, on the traces a run left in DIR (no harness): seconds, for TS-only changes.
//   node gate.cjs compare --baseline FILE --result FILE [--report]
//       the table of what moved; exit 1 on a regression unless --report.
// One row per clip: tracked, path points, the share of the path read off the plate, joints seen, the lift window,
// misses left after the last pass, seconds, and against the hand labels (--labels DIR, default ~/catchline-plate-data:
// labels_label-*.json, then owner_labels.json, which wins on a frame both labelled) the share of labelled plate frames
// where the drawn path sits within 0.25 plate radii of the labelled centre.
// The labels index the ORIGINAL clip's frames (decode order, frames.py). The prepare step keeps every frame and its
// timestamp from the start of a full-clip trim, so prepared frame i is original frame i; the run checks that with the
// original's packet count (srcFrames, ffprobe) and only if the counts differ maps a frame by f * frames / srcFrames.
// cx, cy and r are shares of the shown frame (r of its height); the prepared clip keeps the aspect, so they carry over.
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import { trackTrace } from '../../src/analysis/device/analyseTrace';
import { Trace, parseTraceJson } from '../../src/analysis/device/trace';
import { planEncode, retryPlan } from '../../src/features/capture/compress';
import { fullTrim } from '../../src/features/capture/trim';

// src/data/devicePipeline.ts MAX_PASSES (not importable off the phone).
const MAX_PASSES = 3;
export const LIMITS = { plateShare: 10, jointsSeen: 3, onLabels: 10 };
const LABEL_R = 0.25;

type Clip = { id: string; path: string; shows: string; angle: string; why: string; expect?: 'no-path' | 'hip-path' };
export type Row = {
  tracked: boolean;
  failure: string | null;
  error?: string;
  pathPts: number;
  // 'hip' for a hanging movement's hip trail (a baseline row from before 12-11 has none: a bar path)
  traceKind?: 'bar' | 'hip';
  plateShare: number;
  jointsSeen: number;
  lift: [number, number] | null;
  frames: number;
  fps: number;
  missesLeft: number;
  srcFrames?: number;
  labelled?: number;
  onLabels?: number;
  size?: string;
  prepS?: number;
  poseS?: number;
  allS?: number;
};
export type Result = { mode: 'full' | 'replay'; source: 'prepared' | 'original'; at: string; clips: Record<string, Row> };

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : undefined);
const need = (k: string) => opt(k) ?? die(`--${k} is required`);
const die = (m: string): never => {
  console.error(`gate: ${m}`);
  process.exit(2);
};
const gz = (p: string) => gunzipSync(readFileSync(p)).toString();
const secs = (t0: number) => Math.round((Date.now() - t0) / 100) / 10;
const sh = (bin: string, a: string[]) => execFileSync(bin, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
const firstLines = (e: unknown) => (e as Error).message.split('\n').slice(0, 3).join(' | ').slice(0, 300);

function mergeCalls(a: Trace, b: Trace): Trace {
  const calls = { ...a.calls } as Trace['calls'];
  for (const [k, v] of Object.entries(b.calls)) calls[k] = { ...(calls[k] ?? {}), ...v };
  return { ...b, calls };
}

type Plate = { cx: number; cy: number; r: number };
type Labels = Record<string, Record<number, Plate | null>>;

function loadLabels(dir: string): Labels {
  const out: Labels = {};
  if (!existsSync(dir)) return out;
  const files = readdirSync(dir).filter((f) => /^labels_label-.+\.json$/.test(f)).sort();
  if (existsSync(join(dir, 'owner_labels.json'))) files.push('owner_labels.json');
  for (const f of files) {
    const all = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, { clip: string; frame: number; none?: boolean } & Plate>;
    for (const l of Object.values(all)) (out[l.clip] ??= {})[l.frame] = l.none ? null : { cx: l.cx, cy: l.cy, r: l.r };
  }
  return out;
}

function packets(clip: string): number {
  return parseInt(sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', clip]), 10);
}

// The trace exactly as the run tracked it: the pose pass, then each plate pass merged in order. Never a re-serialised
// copy: JSON drops what parseTraceJson read from the native output (0591 went from 0 misses to 2 that way).
function loadTrace(dir: string, passes = Infinity): Trace {
  let trace = parseTraceJson(gz(join(dir, 'pose.trace.json.gz'))) as Trace;
  for (let pass = 1; pass <= passes && existsSync(join(dir, `pix${pass}.trace.json.gz`)); pass++) {
    trace = mergeCalls(trace, parseTraceJson(gz(join(dir, `pix${pass}.trace.json.gz`))) as Trace);
  }
  return trace;
}

function rowOf(tracked: ReturnType<typeof trackTrace>, truth?: Record<number, Plate | null>, srcFrames?: number): Row {
  const a = tracked.analysis as {
    failure: { code?: string } | null;
    video: { fps: number; frameCount: number; width: number; height: number };
    lift?: { startFrame: number; endFrame: number };
    reps: { path: { frame: number; x: number; y: number; src?: string }[] }[];
    traceKind?: 'bar' | 'hip';
  };
  const path = a.reps[0]?.path ?? [];
  const frames = tracked.body?.frames ?? [];
  const seen = frames.reduce((n, r) => n + r.filter((v) => v != null).length, 0);
  return {
    tracked: !a.failure,
    failure: a.failure?.code ?? null,
    pathPts: path.length,
    traceKind: a.traceKind,
    plateShare: path.length ? Math.round((100 * path.filter((p) => p.src === 'plate').length) / path.length) : 0,
    jointsSeen: frames.length ? Math.round((100 * seen) / (frames.length * frames[0].length)) : 0,
    lift: a.lift ? [a.lift.startFrame, a.lift.endFrame] : null,
    frames: a.video.frameCount,
    fps: Math.round(a.video.fps * 100) / 100,
    missesLeft: tracked.misses.length,
    srcFrames,
    ...onLabels(path, a.video, srcFrames, truth),
  };
}

function onLabels(path: { frame: number; x: number; y: number }[], v: { frameCount: number; width: number; height: number }, srcFrames?: number, truth?: Record<number, Plate | null>) {
  const plates = Object.entries(truth ?? {}).flatMap(([f, l]) => (l ? [[Number(f), l] as const] : []));
  if (!plates.length) return {};
  const scale = srcFrames && srcFrames !== v.frameCount ? v.frameCount / srcFrames : 1;
  const at = new Map(path.map((p) => [p.frame, p]));
  const hit = plates.filter(([f, l]) => {
    const p = at.get(Math.round(f * scale));
    return p != null && Math.hypot((p.x - l.cx) * v.width, (p.y - l.cy) * v.height) <= LABEL_R * l.r * v.height;
  }).length;
  return { labelled: plates.length, onLabels: Math.round((100 * hit) / plates.length) };
}

const failed = (error: string): Row => ({ tracked: false, failure: null, error, pathPts: 0, plateShare: 0, jointsSeen: 0, lift: null, frames: 0, fps: 0, missesLeft: 0 });

// src/data/prepare.ts prepareClip, with the harness in place of the native module and the whole clip as the trim.
function prepare(transcoder: string, clip: string, out: string): { size: string } | { tooLong: true } {
  const src = JSON.parse(sh(transcoder, ['probe', clip]));
  let plan = planEncode(src, fullTrim(src.durationS));
  for (let attempt = 0; ; attempt++) {
    if (plan.kind === 'too_long') return { tooLong: true };
    const { kind: _kind, ...o } = plan;
    const made = JSON.parse(sh(transcoder, ['transcode', clip, '--opts', JSON.stringify(o), '--out', out]));
    const retry = retryPlan(plan, made.size);
    if (!retry) return { size: `${made.width}x${made.height}` };
    plan = attempt === 0 ? retry : { kind: 'too_long', maxS: 0 };
  }
}

function runClip(c: Clip, work: string, source: Result['source'], labels: Labels): Row {
  const dir = join(work, c.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const original = c.path.replace(/^~/, homedir());
  if (!existsSync(original)) return failed(`clip not found: ${c.path}`);
  const [harness, models] = [need('harness'), need('models')];
  // the trained plate model (PlateNet.mlmodelc), as the app bundles it; without it the native side uses the rule stages
  const plate = opt('plate') ? ['--plate', need('plate')] : [];
  const srcFrames = labels[c.id] ? packets(original) : undefined;
  const t0 = Date.now();
  let clip = original;
  let size: string | undefined;
  if (source === 'prepared') {
    clip = join(dir, 'prepared.mp4');
    const p = prepare(need('transcoder'), original, clip);
    if ('tooLong' in p) return { ...failed(''), error: undefined, failure: 'too_long' };
    size = p.size;
  }
  const prepS = secs(t0);
  const t1 = Date.now();
  sh(harness, ['pose', clip, '--models', models, '--out', join(dir, 'pose.trace.json.gz'), '--run-out', join(dir, 'run.json'), '--movement', 'snatch', ...plate]);
  const poseS = secs(t1);
  let tracked = trackTrace(loadTrace(dir), { analysisId: c.id, assetPrefix: c.id });
  for (let pass = 1; pass < MAX_PASSES && tracked.misses.length; pass++) {
    const planFile = join(dir, `plan${pass}.json`);
    writeFileSync(planFile, JSON.stringify(tracked.plan));
    sh(harness, ['analyse', clip, '--models', models, '--plan', planFile, '--run-in', join(dir, 'run.json'), '--out', join(dir, `pix${pass}.trace.json.gz`), '--stills', join(dir, 'stills'), '--movement', 'snatch', ...plate]);
    tracked = trackTrace(loadTrace(dir, pass), { analysisId: c.id, assetPrefix: c.id });
  }
  writeFileSync(join(dir, 'analysis.json'), JSON.stringify(tracked.analysis));
  writeFileSync(join(dir, 'body.json'), JSON.stringify(tracked.body));
  return { ...rowOf(tracked, labels[c.id], srcFrames), size, prepS, poseS, allS: secs(t0) };
}

function replayClip(c: Clip, work: string, labels: Labels): Row {
  const dir = join(work, c.id);
  // A clip the run refused before tracking (too long) or could not track has no trace: its row stands as recorded.
  const kept = existsSync(join(work, 'result.json')) ? (JSON.parse(readFileSync(join(work, 'result.json'), 'utf8')) as Result).clips[c.id] : undefined;
  if (!existsSync(join(dir, 'pose.trace.json.gz'))) return kept ?? failed('no saved trace');
  const tracked = trackTrace(loadTrace(dir), { analysisId: c.id, assetPrefix: c.id });
  writeFileSync(join(dir, 'replay.analysis.json'), JSON.stringify(tracked.analysis));
  writeFileSync(join(dir, 'replay.body.json'), JSON.stringify(tracked.body));
  return rowOf(tracked, labels[c.id], kept?.srcFrames);
}

const hasPlatePath = (r: Row) => r.pathPts > 0 && r.plateShare > 0;
const cell = (r: Row | undefined) =>
  !r ? '-' : r.error ? 'CRASH' : r.failure ? r.failure : `${r.pathPts}pt ${r.plateShare}% j${r.jointsSeen}${r.onLabels != null ? ` L${r.onLabels}` : ''}`;

export function compare(base: Result, now: Result, clips: Clip[]): { lines: string[]; regressions: string[] } {
  const lines: string[] = [];
  const regressions: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);
  lines.push(`${pad('clip', 26)}${pad('baseline', 28)}${pad('now', 28)}${pad('lift', 12)}${pad('miss', 5)}${pad('secs', 7)}verdict`);
  for (const c of clips) {
    const [b, n] = [base.clips[c.id], now.clips[c.id]];
    const bad: string[] = [];
    const good: string[] = [];
    if (!n) bad.push('not run');
    else {
      if (n.error) bad.push(`crashed: ${n.error}`);
      const barPts = n.traceKind === 'hip' ? 0 : n.pathPts;
      if ((c.expect === 'no-path' || c.expect === 'hip-path') && barPts > 0) bad.push('drew a bar path on a clip with no barbell lift');
      if (c.expect === 'hip-path' && (n.traceKind !== 'hip' || n.pathPts === 0)) bad.push('a hanging clip lost its hip trail');
      if (b) {
        if (b.tracked && !n.tracked && !n.error) bad.push(`tracked before, now fails (${n.failure})`);
        if (hasPlatePath(b) && !hasPlatePath(n)) bad.push('lost its plate path');
        else if (b.plateShare - n.plateShare > LIMITS.plateShare) bad.push(`plate share ${b.plateShare} -> ${n.plateShare}`);
        if (b.jointsSeen - n.jointsSeen > LIMITS.jointsSeen) bad.push(`joints seen ${b.jointsSeen} -> ${n.jointsSeen}`);
        const [bl, nl] = [b.onLabels, n.onLabels];
        if (bl != null && nl != null && bl - nl > LIMITS.onLabels) bad.push(`on the labelled plate ${bl}% -> ${nl}%`);
        if (bl != null && nl != null && nl - bl > LIMITS.onLabels) good.push(`on the labelled plate ${bl}% -> ${nl}%`);
        if (now.mode === 'replay' && n.missesLeft > b.missesLeft) bad.push(`the rules now ask for ${n.missesLeft - b.missesLeft} reads the saved trace lacks: run --check`);
        if (!b.tracked && n.tracked) good.push('now tracks');
        if (!hasPlatePath(b) && hasPlatePath(n) && c.expect === undefined) good.push('gained a plate path');
        if (n.plateShare - b.plateShare > LIMITS.plateShare && hasPlatePath(b)) good.push(`plate share ${b.plateShare} -> ${n.plateShare}`);
        if (n.jointsSeen - b.jointsSeen > LIMITS.jointsSeen) good.push(`joints seen ${b.jointsSeen} -> ${n.jointsSeen}`);
      }
    }
    const verdict = bad.length ? `REGRESSED: ${bad.join('; ')}` : good.length ? `improved: ${good.join('; ')}` : b ? 'same' : 'new';
    for (const m of bad) regressions.push(`${c.id}: ${m}`);
    lines.push(`${pad(c.id.slice(0, 24), 26)}${pad(cell(b), 28)}${pad(cell(n), 28)}${pad(n?.lift ? n.lift.join('-') : '-', 12)}${pad(String(n?.missesLeft ?? '-'), 5)}${pad(String(n?.allS ?? '-'), 7)}${verdict}`);
  }
  return { lines, regressions };
}

function main() {
  const command = args[0];
  if (command === 'compare') {
    const base = JSON.parse(readFileSync(need('baseline'), 'utf8')) as Result & { clipList?: Clip[] };
    const now = JSON.parse(readFileSync(need('result'), 'utf8')) as Result;
    const clips = JSON.parse(readFileSync(need('clips'), 'utf8')) as Clip[];
    const { lines, regressions } = compare(base, now, clips);
    console.log(lines.join('\n'));
    if (args.includes('--report')) return;
    console.log(regressions.length ? `\ngate: FAILED, ${regressions.length} regression(s):\n  ${regressions.join('\n  ')}` : `\ngate: passed (${clips.length} clips, ${now.mode}).`);
    process.exit(regressions.length ? 1 : 0);
  }
  if (command !== 'run' && command !== 'replay') die('usage: gate.cjs run|replay|compare ...');
  const clips = JSON.parse(readFileSync(need('clips'), 'utf8')) as Clip[];
  const work = need('work');
  const source = opt('source') === 'original' ? 'original' : 'prepared';
  const labels = loadLabels(opt('labels') ?? join(homedir(), 'catchline-plate-data'));
  const result: Result = { mode: command === 'run' ? 'full' : 'replay', source, at: new Date().toISOString(), clips: {} };
  for (const c of clips) {
    let row: Row;
    try {
      row = command === 'run' ? runClip(c, work, source, labels) : replayClip(c, work, labels);
    } catch (e) {
      row = failed(firstLines(e));
    }
    result.clips[c.id] = row;
    console.log(`row ${c.id} ${JSON.stringify(row)}`);
  }
  writeFileSync(need('out'), JSON.stringify(result, null, 1) + '\n');
}

main();
