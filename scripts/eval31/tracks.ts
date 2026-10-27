// Track eval (27-10, tracking first): the phone pipeline over the eval clips (cached pose and pixel stages, the harness
// for what is missing) and the prod lift traces. Per clip: whether a path was produced, the bar error against the
// dataset's plate labels where they exist (px and plate radii), how often the plate finder saw a plate, and the
// feet / hip track continuity (missing frames, jumps over a torso fraction). The pass condition: every clip with a
// person produces a path. Feet and hips have no ground truth: continuity is all that can be reported.
//   npx tsx scripts/eval31/tracks.ts --clips clips.json --cache DIR [--harness BIN --models DIR] --traces DIR...
//     --labels DIR --out DIR [--only id,id] [--also id:movement ...]
// --also runs a clip as another movement too (a snatch as a jerk finds no jerk), to exercise the path-only result on
// real pose data when no eval clip fails a gate on its own.
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import { analyseTraceResult, planFromMisses } from '../../src/analysis/device/analyseTrace';
import { L_HIP, L_SHO, R_HIP, R_SHO } from '../../src/analysis/device/movement';
import { Trace, parseTraceJson, traceInput } from '../../src/analysis/device/trace';
import { pointAt } from '../../src/analysis/timeline';
import type { Rep, TracePoint } from '../../src/analysis/types';

type Clip = { id: string; set: string; file: string; movement: string };
type Label = { frame: number; x: number; y: number; r: number };
type Labels = { width: number; height: number; reps: { labels: Label[] }[] };
type Row = {
  id: string;
  set: string;
  movement: string;
  status: string;
  person: boolean;
  path: boolean;
  reps: number;
  pathFrames: number;
  bar: { n: number; medianPx: number; p90Px: number; medianRadii: number; medianDx: number; medianDy: number } | null;
  plates: { seen: number; searched: number; refined: number };
  feet: { gaps: number; jumps: number; frames: number } | null;
  hips: { gaps: number; jumps: number; frames: number } | null;
  misses: number;
};

const JUMP_TORSO = 0.35;
const OWNER_MOVEMENT: Record<string, string> = { EDF10BB7: 'bar_muscle_up', BD1AE773: 'bar_muscle_up', A1F2F738: 'kipping_pull_up', '21B27BAF': 'snatch', E0DF8887: 'snatch' };

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const opts = (k: string) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []));
const log = (s: string) => process.stderr.write(s + '\n');
const gz = (p: string) => gunzipSync(readFileSync(p)).toString();
const median = (v: number[]) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const p90 = (v: number[]) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(0.9 * (s.length - 1))] : NaN;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

function sh(bin: string, a: string[]): void {
  try {
    execFileSync(bin, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error((err.stderr ?? '').split('\n').filter((l) => /error|Error/.test(l)).slice(-3).join(' | ') || err.message);
  }
}

function mergeCalls(a: Trace, b: Trace): Trace {
  const calls = { ...a.calls } as Trace['calls'];
  for (const [k, v] of Object.entries(b.calls)) calls[k] = { ...(calls[k] ?? {}), ...v };
  return { ...b, calls };
}

// the cached pose trace plus the pixel stages the replay asks for, from the cache or the harness
function replayClip(c: Clip, cache: string, harness: string | undefined, models: string | undefined): { trace: Trace; misses: number } {
  const movement = c.movement;
  const cls = movement === 'kipping_hspu' ? 'inverted' : movement === 'kipping_pull_up' || movement === 'bar_muscle_up' ? 'hanging' : 'barbell';
  const key = `${c.id}.${cls}`;
  const poseTrace = join(cache, 'pose', `${key}.trace.json.gz`);
  const runFile = join(cache, 'pose', `${key}.run.json`);
  if (!existsSync(poseTrace)) {
    if (!harness || !models) throw new Error(`no cached pose for ${key} and no harness`);
    sh(harness, ['pose', c.file, '--models', models, '--out', poseTrace, '--run-out', runFile, '--movement', movement]);
  }
  let trace = parseTraceJson(gz(poseTrace)) as Trace;
  let misses = 0;
  for (let round = 0; round < 4; round++) {
    const plan = planFromMisses(trace, movement, { assetPrefix: 'kf' });
    misses = plan.misses.length;
    if (!misses) break;
    const { misses: _m, ...p } = plan;
    const hash = createHash('sha1').update(JSON.stringify(p)).digest('hex').slice(0, 12);
    const pix = join(cache, 'pixels', `${key}.${hash}.trace.json.gz`);
    if (!existsSync(pix)) {
      if (!harness || !models) break;
      const planFile = join(cache, 'pixels', `${key}.${hash}.plan.json`);
      writeFileSync(planFile, JSON.stringify(p));
      log(`  harness: ${plan.misses.slice(0, 3).join(', ')}${plan.misses.length > 3 ? ` +${plan.misses.length - 3}` : ''}`);
      sh(harness, ['analyse', c.file, '--models', models, '--plan', planFile, '--run-in', runFile, '--out', pix, '--stills', join(cache, 'stills', `${key}.${hash}`), '--movement', movement]);
    }
    trace = mergeCalls(trace, parseTraceJson(gz(pix)) as Trace);
  }
  return { trace, misses };
}

// the lifter's torso in inference px, for the jump threshold
function torsoPx(trace: Trace, movement: string): number {
  const k = traceInput(trace, movement).lifter.k;
  return median(
    k.map((r) => {
      const s = [(r[L_SHO][0] + r[R_SHO][0]) / 2, (r[L_SHO][1] + r[R_SHO][1]) / 2];
      const h = [(r[L_HIP][0] + r[R_HIP][0]) / 2, (r[L_HIP][1] + r[R_HIP][1]) / 2];
      return Math.hypot(s[0] - h[0], s[1] - h[1]);
    }),
  );
}

function continuity(reps: Rep[], name: 'feet' | 'hips', shape: [number, number], torso: number): Row['feet'] {
  let gaps = 0;
  let jumps = 0;
  let frames = 0;
  let any = false;
  for (const rep of reps) {
    const track = rep.tracks?.[name];
    if (!track) continue;
    any = true;
    const span = rep.path.length ? rep.path[rep.path.length - 1].frame - rep.path[0].frame + 1 : 0;
    gaps += Math.max(0, span - track.length);
    frames += track.length;
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1];
      const b = track[i];
      const d = Math.hypot((b.x - a.x) * shape[1], (b.y - a.y) * shape[0]) / Math.max(1, b.frame - a.frame);
      if (Number.isFinite(torso) && d > JUMP_TORSO * torso) jumps++;
    }
  }
  return any ? { gaps, jumps, frames } : null;
}

function barError(reps: Rep[], labels: Labels | null, meta: Trace['meta']): Row['bar'] {
  if (!labels) return null;
  const px: number[] = [];
  const radii: number[] = [];
  const dxs: number[] = [];
  const dys: number[] = [];
  const sx = meta.width / labels.width;
  const sy = meta.height / labels.height;
  for (const rep of reps) {
    const path: TracePoint[] = rep.path;
    if (path.length < 2) continue;
    const f0 = path[0].frame;
    const f1 = path[path.length - 1].frame;
    for (const r of labels.reps) {
      for (const l of r.labels) {
        if (l.frame < f0 || l.frame > f1) continue;
        const p = pointAt(path, l.frame);
        if (!p) continue;
        const dx = p.x * meta.width - l.x * sx;
        const dy = p.y * meta.height - l.y * sy;
        const d = Math.hypot(dx, dy);
        px.push(d);
        radii.push(d / (l.r * sx));
        dxs.push(dx);
        dys.push(dy);
      }
    }
  }
  return { n: px.length, medianPx: r1(median(px)), p90Px: r1(p90(px)), medianRadii: Math.round(median(radii) * 100) / 100, medianDx: r1(median(dxs)), medianDy: r1(median(dys)) };
}

function platesSeen(trace: Trace): Row['plates'] {
  const finds = Object.values(trace.calls.find_plates ?? {});
  const seen = finds.filter((outs) => ((outs[0] as unknown[]) ?? []).length > 0).length;
  const refined = Object.values(trace.calls.refine_plate ?? {}).filter((outs) => outs[0] !== null).length;
  return { seen, searched: finds.length, refined };
}

function evaluate(id: string, set: string, movement: string, trace: Trace, misses: number, labels: Labels | null): Row {
  const res = analyseTraceResult(trace, movement, { assetPrefix: 'kf' });
  const a = res.analysis as { failure: { code: string } | null; cue: { faultId: string } | null; noCueReason: { code: string; gate?: string } | null; reps: Rep[] };
  const status = a.failure ? `fail:${a.failure.code}` : a.cue ? `cue:${a.cue.faultId}` : a.noCueReason ? `${a.noCueReason.code}${a.noCueReason.gate ? `:${a.noCueReason.gate}` : ''}` : 'clean';
  const reps = a.reps ?? [];
  const shape = trace.pose.False?.shape as [number, number] | null;
  const torso = torsoPx(trace, movement);
  return {
    id,
    set,
    movement,
    status,
    person: a.failure?.code !== 'no_person',
    path: reps.some((r) => r.path.length >= 2),
    reps: reps.length,
    pathFrames: reps.reduce((s, r) => s + r.path.length, 0),
    bar: barError(reps, labels, trace.meta),
    plates: platesSeen(trace),
    feet: shape ? continuity(reps, 'feet', shape, torso) : null,
    hips: shape ? continuity(reps, 'hips', shape, torso) : null,
    misses: res.misses.length || misses,
  };
}

function main() {
  const out = opt('out')!;
  mkdirSync(out, { recursive: true });
  const labelsDir = opt('labels');
  const labelsFor = (id: string): Labels | null => {
    const p = labelsDir ? join(labelsDir, `${id}.json`) : '';
    return p && existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Labels) : null;
  };
  const only = opt('only')?.split(',');
  const rows: Row[] = [];
  const clipsPath = opt('clips');
  if (clipsPath) {
    const cache = opt('cache')!;
    for (const d of ['pose', 'pixels', 'stills']) mkdirSync(join(cache, d), { recursive: true });
    const all = JSON.parse(readFileSync(clipsPath, 'utf8')) as Clip[];
    const also = opts('also').map((a) => a.split(':')).flatMap(([id, movement]) => {
      const c = all.find((x) => x.id === id);
      return c ? [{ ...c, id: `${c.id} as ${movement}`, set: 'forced', movement }] : [];
    });
    const clips = [...all, ...also].filter((c) => !only || only.includes(c.id));
    for (const c of clips) {
      log(`${c.id} (${c.movement})`);
      try {
        const { trace, misses } = replayClip({ ...c, id: c.id.split(' as ')[0] }, cache, opt('harness'), opt('models'));
        rows.push(evaluate(c.id, c.set, c.movement, trace, misses, labelsFor(c.id.split(' as ')[0])));
      } catch (e) {
        rows.push({ id: c.id, set: c.set, movement: c.movement, status: `error:${String((e as Error).message).slice(0, 80)}`, person: true, path: false, reps: 0, pathFrames: 0, bar: null, plates: { seen: 0, searched: 0, refined: 0 }, feet: null, hips: null, misses: 0 });
      }
    }
  }
  const seenTraces = new Set<string>();
  for (const dir of opts('traces')) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.trace.json.gz')).sort()) {
      const name = f.replace('.trace.json.gz', '');
      if (seenTraces.has(name) || (only && !only.includes(name))) continue;
      seenTraces.add(name);
      const movement = OWNER_MOVEMENT[name.split('.')[0].slice(-8)] ?? 'snatch';
      log(`${name} (${movement}, trace)`);
      const trace = parseTraceJson(gz(join(dir, f))) as Trace;
      rows.push(evaluate(name, 'trace', movement, trace, 0, null));
    }
  }
  writeFileSync(join(out, 'tracks.json'), JSON.stringify(rows, null, 1));
  const cell = (r: Row['feet']) => (r ? `${r.gaps} gap / ${r.jumps} jump of ${r.frames}` : '-');
  const lines = [
    '| clip | set | run as | result | path | reps | bar vs plate label | plate seen | feet | hips |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      `| ${r.id} | ${r.set} | ${r.movement} | ${r.status} | ${r.path ? 'yes' : r.person ? '**NO**' : 'no person'} | ${r.reps} | ${
        r.bar ? `${r.bar.medianPx} px med (dx ${r.bar.medianDx}, dy ${r.bar.medianDy}), ${r.bar.p90Px} px p90, ${r.bar.medianRadii} r (${r.bar.n} fr)` : 'no labels'
      } | ${r.plates.seen}/${r.plates.searched} (${r.plates.refined} fit) | ${cell(r.feet)} | ${cell(r.hips)} |`,
    ),
  ];
  const withPerson = rows.filter((r) => r.person);
  const pass = withPerson.every((r) => r.path);
  lines.push('', `Pass (every clip with a person produces a path): **${pass ? 'yes' : 'NO'}** (${withPerson.filter((r) => r.path).length}/${withPerson.length})`);
  const md = lines.join('\n');
  writeFileSync(join(out, 'tracks.md'), md + '\n');
  process.stdout.write(md + '\n');
  if (!pass) process.exit(1);
}

main();
