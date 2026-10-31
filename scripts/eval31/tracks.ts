// Track eval (27-10, tracking first; 29-10 any camera angle): the phone pipeline over the eval clips (cached pose and
// pixel stages, the harness for what is missing) and the prod lift traces. Per clip: the camera angle the clip list
// labels it with and the yaw the pipeline read, whether a path was produced and how much of it came from the plate,
// the bar error against the dataset's plate labels where they exist (px and plate radii), how often the plate finder
// saw a plate, and the feet / hip track continuity (missing frames, jumps over a torso fraction). The pass condition:
// every clip with a person produces a path. Feet and hips have no ground truth: continuity is all that can be reported.
//   npx tsx scripts/eval31/tracks.ts --clips clips.json --cache DIR [--harness BIN --models DIR] --traces DIR...
//     --labels DIR --out DIR [--only id,id] [--also id:movement ...]
// --also runs a clip as another movement too (a snatch as a jerk finds no jerk), to exercise the path-only result on
// real pose data when no eval clip fails a gate on its own.
// --joint-labels DIR (30-10) scores the joint tracks against hand-checked labels (DIR/<id>.json: per labelled frame the
// left/right joints and their mid-points in clip px): per clip and joint the median and p90 error in px and in torso
// lengths and the labelled frames with no track point; and each track reading (hip rise, knee at the catch, ...) put
// through its own formula from the labels and from the smoothed keypoints at the frames the reading is taken at.
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import { analyseTraceResult, planFromMisses } from '../../src/analysis/device/analyseTrace';
import { angle1, applyAffine, dist, midPt } from '../../src/analysis/device/geometry';
import { K, L_ANK, L_ELB, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_ELB, R_HIP, R_KNEE, R_SHO, R_WRI } from '../../src/analysis/device/movement';
import { Pt, degrees, nanmedian, radians } from '../../src/analysis/device/num';
import type { RepInfo } from '../../src/analysis/device/pipeline';
import { VALUE_MAX_DEG } from '../../src/analysis/device/rules';
import { Trace, parseTraceJson, traceInput } from '../../src/analysis/device/trace';
import { pointAt } from '../../src/analysis/timeline';
import type { Rep, TracePoint, TrackName } from '../../src/analysis/types';

type Clip = { id: string; set: string; file: string; movement: string; angle?: string };
type Label = { frame: number; x: number; y: number; r: number };
type Labels = { width: number; height: number; reps: { labels: Label[] }[] };
type JointLabels = { width: number; height: number; frames: { frame: number; joints: Partial<Record<TrackName, Pt | null>>; sides: Record<string, Pt> }[] };
type JointErr = { n: number; missing: number; medianPx: number; p90Px: number; median: number; p90: number };
type JointRow = { torsoPx: number; torsoFrom: 'labels' | 'track'; joints: Partial<Record<TrackName, JointErr>> };
type Reading = { id: string; frame: number; value: number; track: number; truth: number };
type Row = {
  id: string;
  set: string;
  movement: string;
  angle: string;
  yaw: number | null;
  status: string;
  person: boolean;
  path: boolean;
  reps: number;
  pathFrames: number;
  plateShare: number;
  bar: { n: number; medianPx: number; p90Px: number; medianRadii: number; medianDx: number; medianDy: number } | null;
  plates: { seen: number; searched: number; refined: number };
  feet: { gaps: number; jumps: number; frames: number } | null;
  hips: { gaps: number; jumps: number; frames: number } | null;
  misses: number;
  joints?: JointRow;
  readings?: Reading[];
};

const JUMP_TORSO = 0.35;
// a lifter under this many px of torso is too small for the labels to be placed within the pass bar (0.08 torso is
// under 10 px): scored, but not judged
const LOW_RES_TORSO = 120;
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
const r3 = (v: number) => Math.round(v * 1000) / 1000;

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

const JOINTS: TrackName[] = ['feet', 'knees', 'hips', 'shoulders', 'elbows'];
const SIDES: Record<string, number> = {
  l_ankle: L_ANK, r_ankle: R_ANK, l_knee: L_KNEE, r_knee: R_KNEE, l_hip: L_HIP, r_hip: R_HIP,
  l_shoulder: L_SHO, r_shoulder: R_SHO, l_elbow: L_ELB, r_elbow: R_ELB, l_wrist: L_WRI, r_wrist: R_WRI,
};

// the drawn joint tracks against the labels, clip px; the torso is the labels' mid-shoulder to mid-hip (90th
// percentile over the labelled frames, near standing), the drawn tracks' when under 3 frames label both
function jointErrors(reps: Rep[], labels: JointLabels): JointRow {
  const W = labels.width;
  const H = labels.height;
  const labelled = labels.frames.flatMap((l) => (l.joints.shoulders && l.joints.hips ? [dist(l.joints.shoulders, l.joints.hips)] : []));
  const tracked = reps.flatMap((r) => {
    const hips = new Map((r.tracks?.hips ?? []).map((p) => [p.frame, p]));
    return (r.tracks?.shoulders ?? []).flatMap((p) => {
      const h = hips.get(p.frame);
      return h ? [Math.hypot((p.x - h.x) * W, (p.y - h.y) * H)] : [];
    });
  });
  const torsoFrom = labelled.length >= 3 ? 'labels' : 'track';
  const torso = p90(torsoFrom === 'labels' ? labelled : tracked);
  const joints: JointRow['joints'] = {};
  for (const name of JOINTS) {
    const px: number[] = [];
    let missing = 0;
    for (const l of labels.frames) {
      const t = l.joints[name];
      if (!t) continue;
      const p = reps.flatMap((r) => r.tracks?.[name] ?? []).find((q) => q.frame === l.frame);
      if (!p) {
        missing++;
        continue;
      }
      px.push(Math.hypot(p.x * W - t[0], p.y * H - t[1]));
    }
    joints[name] = { n: px.length, missing, medianPx: r1(median(px)), p90Px: r1(p90(px)), median: r3(median(px) / torso), p90: r3(p90(px) / torso) };
  }
  return { torsoPx: r1(torso), torsoFrom, joints };
}

// Each track reading of the best rep through its own formula, once from the labels (taken into the rep's stabilised
// window px) and once from the smoothed keypoints, at the frames the reading is taken at. Point values: a reading the
// pipeline takes as a minimum or a windowed median is read at its own frame here, so `track` can differ from `value`.
function trackReadings(movement: string, r: RepInfo | undefined, labels: JointLabels, shape: [number, number]): Reading[] {
  if (!r?.track_meas) return [];
  const sx = shape[1] / labels.width;
  const sy = shape[0] / labels.height;
  const ev = r.events as Record<string, number>;
  const jerk = movement === 'jerk';
  const lo = jerk ? ev.dip_start : ev.liftoff;
  const caught = jerk ? ev.land : ev.caught;
  const off = r.off_side_deg ?? 0;
  const fs = 1 / Math.cos(radians(jerk ? Math.min(off, 60) : off));
  const lateral = 1 / Math.sin(radians(Math.min(90, Math.max(off, VALUE_MAX_DEG))));
  const left = nanmedian(r.ksm.map((q) => q[L_SHO][0] - q[R_SHO][0])) >= 0 ? 1 : -1;
  const cm = (px: number) => px / (r.px_per_cm ?? NaN);
  const truthRow = (f: number): Pt[] => {
    const l = labels.frames.find((x) => x.frame === f);
    const row: Pt[] = r.ksm[0].map((): Pt => [NaN, NaN]);
    if (l)
      for (const [name, j] of Object.entries(SIDES)) if (l.sides[name]) row[j] = applyAffine(r.Ms[f - r.s0], [l.sides[name][0] * sx, l.sides[name][1] * sy]);
    return row;
  };
  const sources: [(f: number) => Pt[], (f: number, row: Pt[]) => Pt][] = [
    [truthRow, (_f, row) => midPt(row[L_WRI], row[R_WRI])],
    [(f) => r.ksm[f - r.s0], (f) => r.track[f - r.s0]],
  ];
  const formula = (id: string, frame: number, rowAt: (f: number) => Pt[], barAt: (f: number, row: Pt[]) => Pt): number => {
    const at = (f: number) => {
      const row = rowAt(f);
      return { row, m: (a: number, b: number) => midPt(row[a], row[b]), bar: () => barAt(f, row) };
    };
    const angles = (q: Pt[], a: number[], b: number[]) => [angle1(q[a[0]], q[a[1]], q[a[2]]), angle1(q[b[0]], q[b[1]], q[b[2]])];
    const x = at(frame);
    switch (id) {
      case 'hip_rise':
        return cm(at(lo).m(L_HIP, R_HIP)[1] - at(ev.second_ext).m(L_HIP, R_HIP)[1]);
      case 'bar_over_shoulder':
        return cm(r.fwd * (x.bar()[0] - x.m(L_SHO, R_SHO)[0])) * fs;
      case 'knee_catch': {
        const [a, b] = angles(x.row, [L_HIP, L_KNEE, L_ANK], [R_HIP, R_KNEE, R_ANK]);
        return (a + b) / 2;
      }
      case 'elbow_pull':
        return 180 - Math.min(...angles(x.row, [L_SHO, L_ELB, L_WRI], [R_SHO, R_ELB, R_WRI]));
      case 'bar_tilt_catch': {
        const c = at(caught).row;
        return degrees(Math.asin(Math.max(-1, Math.min(1, (c[R_WRI][1] - c[L_WRI][1]) / Math.max(1e-6, dist(c[L_WRI], c[R_WRI]))))));
      }
      case 'bar_drift_lateral':
        return left * cm(at(caught).bar()[0] - at(lo).bar()[0]) * lateral;
      case 'hip_shift': {
        const d = (f: number) => at(f).m(L_HIP, R_HIP)[0] - at(f).m(L_ANK, R_ANK)[0];
        return left * cm(d(caught) - d(lo)) * lateral;
      }
      case 'stance_setup':
      case 'stance_catch': {
        const q = at(id === 'stance_setup' ? lo : caught).row;
        return cm(Math.abs(q[L_ANK][0] - q[R_ANK][0])) * lateral;
      }
    }
    return NaN;
  };
  const out: Reading[] = [];
  for (const m of r.track_meas) {
    const [truth, track] = sources.map(([rowAt, barAt]) => formula(m.id, m.frame, rowAt, barAt));
    if (Number.isFinite(truth) && Number.isFinite(track)) out.push({ id: m.id, frame: m.frame, value: m.value as number, track: r1(track), truth: r1(truth) });
  }
  return out;
}

function evaluate(id: string, set: string, movement: string, angle: string, trace: Trace, misses: number, labels: Labels | null, jointLabels: JointLabels | null = null): Row {
  const res = analyseTraceResult(trace, movement, { assetPrefix: 'kf' });
  const a = res.analysis as { failure: { code: string } | null; cue: { faultId: string } | null; noCueReason: { code: string; gate?: string; offSideDeg?: number } | null; reps: Rep[]; bestRepIndex: number };
  const status = a.failure ? `fail:${a.failure.code}` : a.cue ? `cue:${a.cue.faultId}` : a.noCueReason ? `${a.noCueReason.code}${a.noCueReason.gate ? `:${a.noCueReason.gate}` : ''}` : 'clean';
  const reps = a.reps ?? [];
  const shape = trace.pose.False?.shape as [number, number] | null;
  const torso = torsoPx(trace, movement);
  // the camera's yaw off side-on: the reps' own estimate, else the one the path-only or off-side result carries
  const offs = res.reps.map((r) => r.off_side_deg).filter((v): v is number => v !== null && Number.isFinite(v));
  const yaw = offs.length ? Math.round(median(offs)) : (a.noCueReason?.offSideDeg ?? null);
  const pathPts = reps.reduce((s, r) => s + r.path.length, 0);
  return {
    id,
    set,
    movement,
    angle,
    yaw,
    status,
    person: a.failure?.code !== 'no_person',
    path: reps.some((r) => r.path.length >= 2),
    reps: reps.length,
    pathFrames: pathPts,
    plateShare: pathPts ? Math.round((100 * reps.reduce((s, r) => s + r.path.filter((p) => p.src === 'plate').length, 0)) / pathPts) : 0,
    bar: barError(reps, labels, trace.meta),
    plates: platesSeen(trace),
    feet: shape ? continuity(reps, 'feet', shape, torso) : null,
    hips: shape ? continuity(reps, 'hips', shape, torso) : null,
    misses: res.misses.length || misses,
    ...(jointLabels && shape
      ? {
          joints: jointErrors(reps, jointLabels),
          readings: trackReadings(movement, res.reps.find((r) => r.start === reps[a.bestRepIndex - 1]?.startFrame), jointLabels, shape),
        }
      : {}),
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
  const jointDir = opt('joint-labels');
  const jointLabelsFor = (id: string): JointLabels | null => {
    const p = jointDir ? join(jointDir, `${id}.json`) : '';
    return p && existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as JointLabels) : null;
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
        rows.push(evaluate(c.id, c.set, c.movement, c.angle ?? '', trace, misses, labelsFor(c.id.split(' as ')[0]), c.id.includes(' as ') ? null : jointLabelsFor(c.id)));
      } catch (e) {
        rows.push({ id: c.id, set: c.set, movement: c.movement, angle: c.angle ?? '', yaw: null, status: `error:${String((e as Error).message).slice(0, 80)}`, person: true, path: false, reps: 0, pathFrames: 0, plateShare: 0, bar: null, plates: { seen: 0, searched: 0, refined: 0 }, feet: null, hips: null, misses: 0 });
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
      rows.push(evaluate(name, 'trace', movement, '', trace, 0, null));
    }
  }
  writeFileSync(join(out, 'tracks.json'), JSON.stringify(rows, null, 1));
  const cell = (r: Row['feet']) => (r ? `${r.gaps} gap / ${r.jumps} jump of ${r.frames}` : '-');
  const lines = [
    '| clip | set | angle | run as | result | yaw | path | plate % | reps | bar vs plate label | plate seen | feet | hips |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      `| ${r.id} | ${r.set} | ${r.angle || '-'} | ${r.movement} | ${r.status} | ${r.yaw ?? '-'} | ${r.path ? 'yes' : r.person ? '**NO**' : 'no person'} | ${r.plateShare} | ${r.reps} | ${
        r.bar ? `${r.bar.medianPx} px med (dx ${r.bar.medianDx}, dy ${r.bar.medianDy}), ${r.bar.p90Px} px p90, ${r.bar.medianRadii} r (${r.bar.n} fr)` : 'no labels'
      } | ${r.plates.seen}/${r.plates.searched} (${r.plates.refined} fit) | ${cell(r.feet)} | ${cell(r.hips)} |`,
    ),
  ];
  const withPerson = rows.filter((r) => r.person);
  const pass = withPerson.every((r) => r.path);
  lines.push('', `Pass (every clip with a person produces a path): **${pass ? 'yes' : 'NO'}** (${withPerson.filter((r) => r.path).length}/${withPerson.length})`);
  const scored = rows.filter((r) => r.joints);
  if (scored.length) {
    const jc = (e: JointErr | undefined) => (e && e.n ? `${e.medianPx} / ${e.p90Px} px, ${e.median} / ${e.p90} t${e.missing ? `, ${e.missing} no pt` : ''}` : e?.missing ? `${e.missing} no pt` : '-');
    lines.push(
      '',
      'Joint tracks vs labels (median / p90 error, px and torso lengths t; "no pt": labelled frames with no track point):',
      '',
      `| clip | angle | torso px | ${JOINTS.join(' | ')} |`,
      `|---|---|---|${JOINTS.map(() => '---').join('|')}|`,
      ...scored.map((r) => `| ${r.id}${r.set === 'duplicate' ? ' (duplicate)' : ''} | ${r.angle || '-'} | ${r.joints!.torsoPx}${r.joints!.torsoFrom === 'track' ? ' (track)' : ''} | ${JOINTS.map((j) => jc(r.joints!.joints[j])).join(' | ')} |`),
    );
    const bar = 0.08;
    const groupOf = (r: Row) => (r.joints!.torsoPx < LOW_RES_TORSO ? 'low-res' : r.angle);
    for (const group of ['side', '45', 'low-res']) {
      const g = scored.filter((r) => groupOf(r) === group && r.set !== 'duplicate');
      if (!g.length) continue;
      const pooled = JOINTS.map((j) => median(g.map((r) => r.joints!.joints[j]?.median ?? NaN)));
      const worst = JOINTS.map((j) => Math.max(...g.map((r) => r.joints!.joints[j]?.median ?? NaN).filter(Number.isFinite)));
      lines.push(
        '',
        `${group} (${g.length} clips${group === 'low-res' ? `, torso under ${LOW_RES_TORSO} px, not judged` : ''}): median of the clip medians ${JOINTS.map((j, i) => `${j} ${r3(pooled[i])} t`).join(', ')}; worst clip ${JOINTS.map((j, i) => `${j} ${r3(worst[i])}`).join(', ')}${
          group === 'side' ? `. Pass (every clip's median under ${bar} t per joint): **${worst.every((w) => w < bar) ? 'yes' : 'NO'}**` : ''
        }`,
      );
    }
    const readings = scored.flatMap((r) => (r.readings ?? []).map((x) => ({ ...x, clip: r.id })));
    if (readings.length) {
      lines.push('', 'Track readings, best rep (value: as listed; track and truth: the same formula at the same frame from the smoothed keypoints and from the labels):', '', '| reading | clip | frame | value | track | truth | error |', '|---|---|---|---|---|---|---|');
      for (const x of readings.sort((p, q) => p.id.localeCompare(q.id))) lines.push(`| ${x.id} | ${x.clip} | ${x.frame} | ${x.value} | ${x.track} | ${x.truth} | ${r1(x.track - x.truth)} |`);
      // the trust rule (30-10): a reading whose typical error is over a quarter of its typical value is not a key number
      const pooled = scored.filter((r) => r.set !== 'duplicate').flatMap((r) => (r.readings ?? []).map((x) => ({ ...x, clip: r.id })));
      lines.push('', '| reading | clips | median abs error | p90 abs error | median abs truth | error / value | key number |', '|---|---|---|---|---|---|---|');
      for (const id of [...new Set(pooled.map((x) => x.id))].sort()) {
        const xs = pooled.filter((x) => x.id === id);
        const errs = xs.map((x) => Math.abs(x.track - x.truth));
        const val = median(xs.map((x) => Math.abs(x.truth)));
        const ratio = median(errs) / val;
        lines.push(`| ${id} | ${xs.length} | ${r1(median(errs))} | ${r1(p90(errs))} | ${r1(val)} | ${Math.round(100 * ratio) / 100} | ${ratio > 0.25 ? '**hide**' : 'keep'} |`);
      }
    }
  }
  const md = lines.join('\n');
  writeFileSync(join(out, 'tracks.md'), md + '\n');
  process.stdout.write(md + '\n');
  if (!pass) process.exit(1);
}

main();
