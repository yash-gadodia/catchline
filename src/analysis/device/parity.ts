// Parity of the device port against Python on a lift trace (expected values from cv/scripts/dump_device_parity.py):
// numbers within a relative 1e-6 (absolute 1e-9 near zero), everything else (frames, phases, flags, strings, the cue)
// exact.
import { analyse } from './analyse';
import { elbows, hipAngles, kneeAngles } from './body';
import { detect } from './detect';
import { toWorld } from './geometry';
import { signals } from './movement';
import { fmax } from './num';
import { RepInfo } from './pipeline';
import { Trace, traceInput } from './trace';

export type Fixture = {
  name: string;
  movement: string;
  forced: [number, number, number][] | null;
  expected: {
    analysis: unknown;
    repCalls: { fn: string; result: unknown }[];
    signals: unknown;
    detected: unknown;
    world: unknown;
    misses: string[];
  };
};

export const REL = 1e-6;
const ABS = 1e-9;

export type Diff = { mismatches: string[]; maxRel: number };

export function compare(expected: unknown, actual: unknown, path = '', out: Diff = { mismatches: [], maxRel: 0 }): Diff {
  const isMissing = (v: unknown) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
  if (isMissing(expected) || isMissing(actual)) {
    if (!(isMissing(expected) && isMissing(actual))) out.mismatches.push(`${path}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`);
    return out;
  }
  if (typeof expected === 'number' && typeof actual === 'number') {
    const d = Math.abs(expected - actual);
    const scale = Math.max(Math.abs(expected), Math.abs(actual));
    const rel = scale > 0 ? d / scale : 0;
    out.maxRel = Math.max(out.maxRel, rel);
    if (d > ABS && rel > REL) out.mismatches.push(`${path}: ${expected} != ${actual}`);
    return out;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) out.mismatches.push(`${path}: length ${expected.length} != ${actual.length}`);
    else expected.forEach((v, i) => compare(v, actual[i], `${path}[${i}]`, out));
    return out;
  }
  if (typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual)) {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    for (const k of new Set([...Object.keys(e), ...Object.keys(a)])) compare(e[k], a[k], `${path}.${k}`, out);
    return out;
  }
  if (expected !== actual) out.mismatches.push(`${path}: ${JSON.stringify(expected)} != ${JSON.stringify(actual)}`);
  return out;
}

// the device rep in the shape of the Python rep record (only the keys Python kept for that rep are compared)
function repSummary(r: RepInfo, keys: string[]): Record<string, unknown> {
  const sn = r.snatch;
  const plates = (sn?.plates ?? []).map((p) => ({
    centre: p.centre,
    axes: p.axes,
    score: p.score,
    side: p.side,
    ...(p.fitInliers !== undefined ? { fit_inliers: p.fitInliers } : {}),
    diameter_px: p.diameter_px,
    refined: p.refined,
  }));
  const all: Record<string, unknown> = {
    ...r,
    ...(sn ?? {}),
    plates,
    detail: Object.fromEntries(
      Object.entries(r.detail).map(([k, d]) => [
        k,
        Object.fromEntries(Object.entries(d).filter(([kk]) => ['frame', 'from_frame', 'to_frame'].includes(kk))),
      ]),
    ),
    bar: r.track,
    knee_ang: kneeAngles(r.ksm),
    hip_ang: hipAngles(r.ksm),
    elbow: sn ? sn.ref.elbow : fmax(...elbows(r.ksm)),
  };
  return Object.fromEntries(keys.map((k) => [k, all[k]]));
}

export function runFixture(fx: Fixture, trace: Trace): { diffs: Record<string, Diff>; ms: number; analysis: unknown } {
  const input = traceInput(trace, fx.movement);
  const t0 = Date.now();
  const res = analyse(input, fx.movement, { forceReps: fx.forced ?? undefined });
  const ms = Date.now() - t0;
  const world = toWorld(input.lifter.k, input.cameraPath);
  const diffs: Record<string, Diff> = {
    analysis: compare(fx.expected.analysis, res.analysis),
    world: compare(fx.expected.world, world),
    signals: compare(fx.expected.signals, signals(world, input.meta.fps)),
    detected: compare(fx.expected.detected, detect(world, input.meta.fps, true)),
    misses: compare(fx.expected.misses, input.replayer.misses),
  };
  const calls = fx.expected.repCalls;
  const mine = res.repCalls;
  const reps: Diff = { mismatches: [], maxRel: 0 };
  if (calls.length !== mine.length) reps.mismatches.push(`rep calls ${calls.length} != ${mine.length}`);
  calls.forEach((c, i) => {
    const m = mine[i];
    if (c.result === null || c.result === false || !m) {
      if (c.result !== m) reps.mismatches.push(`rep ${i}: ${JSON.stringify(c.result)} != ${m ? 'a rep' : JSON.stringify(m)}`);
      return;
    }
    const e = c.result as Record<string, unknown>;
    compare(e, repSummary(m, Object.keys(e)), `rep${i}`, reps);
  });
  diffs.reps = reps;
  return { diffs, ms, analysis: res.analysis };
}

// what the analysis says, in one word: the cue, the reason there is none, or the failure
export function headline(a: unknown): string {
  const x = a as { cue?: { faultId: string } | null; noCueReason?: { code: string }; failure?: { code: string } | null };
  return x.cue ? `cue:${x.cue.faultId}` : x.noCueReason ? `noCue:${x.noCueReason.code}` : x.failure ? `fail:${x.failure.code}` : 'none';
}
