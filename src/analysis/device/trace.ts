// A lift trace (cv/catchline_cv/trace.py, TRACE_VERSION 1) as the measurement's input: the pipeline's reads of the
// video, replayed from the trace the way trace.Replayer does it, including its stand-ins when the current code asks
// for a window or a frame the trace never recorded (the nearest plate frame, affines composed from the camera path,
// a plate track stitched from the recorded one).
import { Affine, Pt } from './num';
import { FAMILY } from './movement';
import { DeviceInput, FrameSource, PlateFollow, PlateObservation, PlateTrack } from './source';

export const TRACE_VERSION = 1;

export class TraceMissing extends Error {}

// what the native pixel stages must add to the trace so the next replay has no misses (the plan of
// PoseCoreML.analyseOnDevice(uri, movement, plan)); wrist coordinates are null where the pose has none
type N = number | null;
export type Plan = {
  windows: { s0: number; count: number }[];
  plates: { frame: number; wristA: [N, N]; wristB: [N, N]; bodyH: number; setupH: N }[];
  tracks: { s0: number; n: number; start: number; plate: { centre: Pt; axes: [number, number]; score: number } }[];
  follows: { s0: number; n: number; seed: number; wrists: [N, N][]; wristA: [N, N]; wristB: [N, N]; bodyH: number; setupH: number }[];
  keyframes: { name: string; frame: number }[];
};
type PlateArgs = { wristA: Pt; wristB: Pt; bodyH: number; setupH: number };
const nn = (v: number): N => (Number.isFinite(v) ? v : null);

type Calls = Record<string, Record<string, unknown[]>>;
export type Trace = {
  traceVersion: number;
  meta: { width: number; height: number; fps: number; frameCount: number | null };
  pose: Record<string, { shape: number[] | null; n: number }>;
  calls: Calls;
};

// Python's json.dumps writes NaN and Infinity bare; JSON.parse refuses them
export function parseTraceJson(text: string): unknown {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i];
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === 'N' && text.startsWith('NaN', i)) {
      out += '"$NaN"';
      i += 2;
    } else if (c === 'I' && text.startsWith('Infinity', i)) {
      out += '"$Inf"';
      i += 7;
    } else if (c === '-' && text.startsWith('-Infinity', i)) {
      out += '"$-Inf"';
      i += 8;
    } else out += c;
  }
  return JSON.parse(out, (_, v) => (v === '$NaN' ? NaN : v === '$Inf' ? Infinity : v === '$-Inf' ? -Infinity : v));
}

function reshape(flat: unknown[], shape: number[]): unknown {
  if (shape.length <= 1) return flat;
  const step = flat.length / shape[0];
  const out: unknown[] = [];
  for (let i = 0; i < shape[0]; i++) out.push(reshape(flat.slice(i * step, (i + 1) * step), shape.slice(1)));
  return out;
}

// trace.dec: numpy arrays, scalars and tuples back to plain values (arrays nested by shape)
export function dec(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(dec);
  if (o && typeof o === 'object') {
    const r = o as Record<string, unknown>;
    if ('$nd' in r) {
      const [, shape, flat] = r.$nd as [string, number[], unknown[]];
      return reshape(flat, shape);
    }
    if ('$ns' in r) return (r.$ns as [string, unknown])[1];
    if ('$t' in r) return (r.$t as unknown[]).map(dec);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, dec(v)]));
  }
  return o;
}

type RawPlate = { centre: Pt; axes: [number, number]; score: number; side: PlateObservation['side']; fit_inliers?: number };

const plateObs = (p: RawPlate): PlateObservation => ({
  centre: [p.centre[0], p.centre[1]],
  axes: [p.axes[0], p.axes[1]],
  score: p.score,
  side: p.side,
  ...(p.fit_inliers !== undefined ? { fitInliers: p.fit_inliers } : {}),
});

const samePlate = (a: RawPlate, b: PlateObservation) =>
  a.centre[0] === b.centre[0] && a.centre[1] === b.centre[1] && a.axes[0] === b.axes[0] && a.axes[1] === b.axes[1] && a.score === b.score && a.side === b.side;

const mul3 = (A: number[][], B: number[][]): number[][] =>
  A.map((row) => B[0].map((_, j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));

function inv3(M: Affine): number[][] {
  const [[a, b, c], [d, e, f]] = M;
  const det = a * e - b * d;
  return [
    [e / det, -b / det, (b * f - c * e) / det],
    [-d / det, a / det, (c * d - a * f) / det],
    [0, 0, 1],
  ];
}

// trace.rebase: affines frame -> clip reference re-expressed as frame -> the first of these frames
export function rebase(Ms: Affine[]): Affine[] {
  if (!Ms.length) return [];
  const inv0 = inv3(Ms[0]);
  return Ms.map((M) => mul3(inv0, [M[0], M[1], [0, 0, 1]]).slice(0, 2));
}

export class Replayer {
  calls: Calls;
  used = new Map<string, number>();
  misses: string[] = [];
  plan: Plan = { windows: [], plates: [], tracks: [], follows: [], keyframes: [] };
  trace: Trace;

  constructor(trace: Trace) {
    if (trace.traceVersion !== TRACE_VERSION) throw new TraceMissing(`trace version ${trace.traceVersion}`);
    this.trace = trace;
    this.calls = trace.calls;
  }

  get(name: string, k: string): unknown {
    const outs = this.calls[name]?.[k];
    if (!outs || !outs.length) return undefined;
    const i = this.used.get(`${name}\0${k}`) ?? 0;
    this.used.set(`${name}\0${k}`, i + 1);
    return dec(outs[Math.min(i, outs.length - 1)]);
  }

  nearest(name: string, index: number): number | null {
    const keys = Object.keys(this.calls[name] ?? {}).map(Number);
    if (!keys.length) return null;
    return keys.reduce((a, b) => (Math.abs(b - index) < Math.abs(a - index) || (Math.abs(b - index) === Math.abs(a - index) && b < a) ? b : a));
  }

  miss(what: string) {
    this.misses.push(what);
  }

  pose(twoPass: boolean) {
    const p = this.trace.pose[twoPass ? 'True' : 'False'];
    if (!p) throw new TraceMissing(`no pose for two_pass=${twoPass}`);
    return { key: twoPass ? 'True' : 'False', shape: p.shape, n: p.n };
  }

  planWindow(s0: number, count: number) {
    if (!this.plan.windows.some((w) => w.s0 === s0 && w.count === count)) this.plan.windows.push({ s0, count });
  }

  planPlates(frame: number, a: PlateArgs) {
    if (this.plan.plates.some((p) => p.frame === frame)) return;
    this.plan.plates.push({ frame, wristA: [nn(a.wristA[0]), nn(a.wristA[1])], wristB: [nn(a.wristB[0]), nn(a.wristB[1])], bodyH: a.bodyH, setupH: nn(a.setupH) });
  }

  frames(height: number, start: number, count: number): number {
    const n = this.get('frames', `${height}:${start}:${count}`) as number | undefined;
    if (n !== undefined) return n;
    this.miss(`frames ${start}+${count}`);
    this.planWindow(start, count);
    const total = this.trace.meta.frameCount || Object.values(this.trace.pose)[0].n;
    return Math.max(0, Math.min(count || total, total - start));
  }

  composed(s0: number, n: number): Affine[] {
    for (const [k, outs] of Object.entries(this.calls.stabilise ?? {})) {
      const [a, m] = k.split(':').map(Number);
      if (a <= s0 && s0 + n <= a + m) {
        const Ms = (dec(outs[0]) as [Affine[], number[]])[0];
        return rebase(Ms.slice(s0 - a, s0 - a + n));
      }
    }
    const path = dec(Object.values(this.calls.camera_path)[0][0]) as Affine[];
    const out: Affine[] = [];
    for (let f = s0; f < s0 + n; f++) out.push(path[Math.min(f, path.length - 1)]);
    return rebase(out);
  }

  stabilise(s0: number, n: number, count: number): { Ms: Affine[]; inliers: number[] } {
    const out = this.get('stabilise', `${s0}:${n}`) as [Affine[], number[]] | undefined;
    if (out) return { Ms: out[0], inliers: out[1] };
    this.miss(`stabilise ${s0}+${n}`);
    this.planWindow(s0, count);
    return { Ms: this.composed(s0, n), inliers: new Array<number>(Math.max(0, n - 1)).fill(0) };
  }

  findPlates(frame: number, args: PlateArgs): RawPlate[] {
    const out = this.get('find_plates', String(frame)) as RawPlate[] | undefined;
    if (out) return out;
    const near = this.nearest('find_plates', frame);
    this.miss(`find_plates ${frame}`);
    this.planPlates(frame, args);
    return near !== null ? (dec(this.calls.find_plates[String(near)][0]) as RawPlate[]) : [];
  }

  refinePlate(frame: number, plate: PlateObservation, args: PlateArgs): RawPlate | null {
    for (const [k, outs] of Object.entries(this.calls.refine_plate ?? {})) {
      if (outs.length && samePlate(dec(parseTraceJson(k)) as RawPlate, plate)) return this.get('refine_plate', k) as RawPlate | null;
    }
    this.miss(`refine_plate ${frame}`);
    this.planPlates(frame, args);
    return null;
  }

  trackPlate(s0: number, n: number, start: number, plate: PlateObservation, stop: number | null): PlateTrack {
    const out = this.get('track_plate', `${s0}:${n}:${start}:${stop === null ? 'None' : stop}`) as [Pt[], number[]] | undefined;
    if (out) return { centres: out[0], scores: out[1] };
    this.miss(`track_plate ${s0 + start}`);
    this.plan.tracks.push({ s0, n, start, plate: { centre: [plate.centre[0], plate.centre[1]], axes: [plate.axes[0], plate.axes[1]], score: plate.score } });
    const centres: Pt[] = Array.from({ length: n }, () => [NaN, NaN]);
    const scores = new Array<number>(n).fill(NaN);
    for (const [k, outs] of Object.entries(this.calls.track_plate ?? {})) {
      const [a, m, st] = k.split(':').slice(0, 3).map(Number);
      const [c, s] = dec(outs[0]) as [Pt[], number[]];
      for (let f = Math.max(s0 + start, a + st); f < Math.min(s0 + n, a + m); f++) {
        centres[f - s0] = c[f - a];
        scores[f - s0] = s[f - a];
      }
      break;
    }
    centres[start] = [plate.centre[0], plate.centre[1]];
    scores[start] = plate.score;
    return { centres, scores };
  }

  followPlate(s0: number, n: number, seed: number, wrists: Pt[], hands: [Pt, Pt], bodyH: number, setupH: number): PlateFollow {
    const out = this.get('follow_plate', `${s0}:${n}:${seed}`) as [Pt[], number[], [number, number, number, number][], unknown] | undefined;
    if (out) return { centres: out[0], src: out[1], fit: out[2] };
    this.miss(`follow_plate ${s0 + seed}`);
    const w = (p: Pt): [N, N] => [nn(p[0]), nn(p[1])];
    this.plan.follows.push({ s0, n, seed, wrists: wrists.map(w), wristA: w(hands[0]), wristB: w(hands[1]), bodyH, setupH });
    return { centres: Array.from({ length: n }, (): Pt => [NaN, NaN]), src: new Array<number>(n).fill(0), fit: Array.from({ length: n }, (): [number, number, number, number] => [NaN, NaN, NaN, NaN]) };
  }
}

// pipeline.run's reads of the video for one movement, answered from the trace
export function traceInput(trace: Trace, movement: string): DeviceInput & { replayer: Replayer } {
  const rp = new Replayer(trace);
  const pose = rp.pose(movement === 'kipping_hspu');
  if (pose.shape === null) throw new TraceMissing('no frames decoded');
  const hanging = FAMILY[movement] === 'hanging';
  const lifter = rp.get('select_lifter', `${pose.key}:${hanging ? 'True' : 'False'}`) as [Pt[][], number[][], number[][]] | undefined;
  if (!lifter) throw new TraceMissing(`no lifter for ${pose.key}:${hanging}`);
  const cameraPath = rp.get('camera_path', pose.key) as Affine[] | undefined;
  if (!cameraPath) throw new TraceMissing('no camera path');
  const H = pose.shape[0];
  const source: FrameSource = {
    window(start, count) {
      return rp.stabilise(start, rp.frames(H, start, count), count);
    },
    plates(frame, wristA, wristB, bodyH, setupH) {
      const args = { wristA, wristB, bodyH, setupH };
      return rp.findPlates(frame, args).map((p) => plateObs(rp.refinePlate(frame, plateObs(p), args) ?? p));
    },
    trackPlate(windowStart, windowLength, seed, plate, stop) {
      return rp.trackPlate(windowStart, windowLength, seed, plate, stop);
    },
    followPlate(windowStart, windowLength, seed, wrists, hands, bodyH, setupH) {
      return rp.followPlate(windowStart, windowLength, seed, wrists, hands, bodyH, setupH);
    },
    platesSearched(frame) {
      return Boolean(rp.calls.find_plates?.[String(frame)]?.length);
    },
  };
  return {
    meta: { width: trace.meta.width, height: trace.meta.height, fps: trace.meta.fps, frameCount: trace.meta.frameCount },
    shape: [pose.shape[0], pose.shape[1]],
    lifter: { k: lifter[0], scores: lifter[1], boxes: lifter[2] },
    cameraPath,
    source,
    replayer: rp,
  };
}
