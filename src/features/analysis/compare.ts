import type { Size } from '../../analysis/geometry';
import type { Analysis, Point, TracePoint } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import type { Lift } from '../library/types';
import { joints, liftRange } from './tracker';

// joints() order: shoulder, elbow, wrist, hip, knee, ankle, heel, toe, each left then right.
const SHO = 0, ANK = 10, HEEL = 12, TOE = 14;

// How tall the lifter stands in the picture, in video pixels: shoulder down to ankle, near its tallest over the clip
// (the 90th percentile, so one stretched frame does not set it). Null with fewer than five frames that show both.
export function standingHeightPx(body: Body | null, video: Size): number | null {
  if (!body) return null;
  const hs: number[] = [];
  for (let f = 0; f < body.frames.length; f++) {
    const j = joints(body, f);
    const side = [0, 1].flatMap((s) => {
      const a = j[SHO + s];
      const b = j[ANK + s];
      return a && b ? [(b.y - a.y) * video.height] : [];
    });
    if (side.length) hs.push(Math.max(...side));
  }
  if (hs.length < 5) return null;
  hs.sort((a, b) => a - b);
  const h = hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.9))];
  return h > 0 ? h : null;
}

// Which way the lifter faces across the picture: 1 to the right, -1 to the left, 0 when the feet do not say.
export function facing(body: Body | null): 1 | -1 | 0 {
  if (!body) return 0;
  let sum = 0;
  for (let f = 0; f < body.frames.length; f++) {
    const j = joints(body, f);
    for (const s of [0, 1]) {
      const heel = j[HEEL + s];
      const toe = j[TOE + s];
      if (heel && toe) sum += Math.sign(toe.x - heel.x);
    }
  }
  return sum > 0 ? 1 : sum < 0 ? -1 : 0;
}

export type TrackedLift = { analysis: Analysis; body: Body | null };

// The bar path inside the lift's own frames (the whole path when no lift is marked).
export function liftPath(analysis: Analysis): TracePoint[] {
  const path = analysis.reps[0]?.path ?? [];
  const { first, last } = liftRange(analysis.lift, Math.max(analysis.video.frameCount, 1), false);
  const inside = path.filter((p) => p.frame >= first && p.frame <= last);
  return inside.length >= 2 ? inside : path;
}

// Where two bar paths are laid together: the lowest point the bar reached before its highest (the floor for a lift
// from the floor, the bottom of a squat). The first tracked point is not used: tracking can pick the bar up late.
export function anchor(path: TracePoint[]): TracePoint | null {
  if (!path.length) return null;
  let peak = 0;
  for (let i = 1; i < path.length; i++) if (path[i].y < path[peak].y) peak = i;
  let low = 0;
  for (let i = 1; i <= peak; i++) if (path[i].y > path[low].y) low = i;
  return path[low];
}

// What kind of lift the bar path is, read from its own shape, so a squat is never laid over a snatch (owner, 12-11):
// where the bar starts (the floor, or the shoulders for a squat or a jerk), how high it goes against the lifter's own
// shoulders in the same frame (an arm's length above them: overhead; at them: a clean or a squat; well below: a
// deadlift), and whether it rests on the shoulders before going overhead (a clean and jerk, not a snatch, whose
// overhead squat is still an arm above the shoulders however deep it is). Lengths are in shoulder-to-ankle heights.
// Null when the body or the path does not say, and then there is nothing to compare with.
export type LiftShape = string;
const FLOOR_MAX = 0.4;
const OVERHEAD_MIN = 0.3;
const RACK = [-0.25, 0.15] as const;
const RACK_S = 0.4;
export function liftShape(lift: TrackedLift): LiftShape | null {
  const { analysis, body } = lift;
  if (analysis.traceKind !== 'bar') return null;
  const path = liftPath(analysis);
  const h = standingHeightPx(body, analysis.video);
  const low = anchor(path);
  if (!h || !low || path.length < 2) return null;
  const unit = h / analysis.video.height;
  const ys = (f: number, i: number) => {
    const j = joints(body, f);
    const pts = [j[i], j[i + 1]].filter((q): q is Point => q !== null);
    return pts.length ? pts.reduce((s, q) => s + q.y, 0) / pts.length : null;
  };
  const lowAnkle = ys(low.frame, ANK);
  if (lowAnkle === null) return null;
  const from = (lowAnkle - low.y) / unit <= FLOOR_MAX ? 'floor' : 'rack';
  // the bar against the shoulders, frame by frame (positive: above them)
  const rel = path.map((p) => {
    const sh = ys(p.frame, SHO);
    return sh === null ? null : (sh - p.y) / unit;
  });
  const known = rel.filter((r): r is number => r !== null);
  if (known.length < 2) return null;
  const top = Math.max(...known);
  const to = top >= OVERHEAD_MIN ? 'overhead' : top >= RACK[0] ? 'shoulders' : 'hips';
  let rack = false;
  if (from === 'floor' && to === 'overhead') {
    const fps = analysis.video.fps || 30;
    const peakAt = rel.indexOf(top);
    let run = 0;
    for (let i = 0; i < peakAt; i++) {
      const r = rel[i];
      run = r !== null && r >= RACK[0] && r <= RACK[1] ? run + 1 : 0;
      if (run >= RACK_S * fps) rack = true;
    }
  }
  return `${from}-${to}${rack ? '-jerk' : ''}`;
}

// An earlier lift's bar path laid on today's video, in today's normalised coordinates. The two paths share their
// anchor; the earlier one is scaled by how tall each lifter stands in their own picture (as filmed when a body
// was not read) and mirrored when the two clips face opposite ways. Null when either lift has no bar path (a hanging movement's hip
// trace is not one).
export function ghostPath(earlier: TrackedLift, today: TrackedLift): Point[] | null {
  if (earlier.analysis.traceKind !== 'bar' || today.analysis.traceKind !== 'bar') return null;
  const from = liftPath(earlier.analysis);
  const p0 = anchor(earlier.analysis.reps[0]?.path ?? []);
  const q0 = anchor(today.analysis.reps[0]?.path ?? []);
  if (from.length < 2 || !p0 || !q0 || (today.analysis.reps[0]?.path.length ?? 0) < 2) return null;
  const a = earlier.analysis.video;
  const b = today.analysis.video;
  const ha = standingHeightPx(earlier.body, a);
  const hb = standingHeightPx(today.body, b);
  const kx = ha && hb ? (a.width * hb) / (ha * b.width) : 1;
  const ky = ha && hb ? (a.height * hb) / (ha * b.height) : 1;
  const flip = facing(earlier.body) * facing(today.body) < 0 ? -1 : 1;
  return from.map((p) => ({ x: q0.x + flip * (p.x - p0.x) * kx, y: q0.y + (p.y - p0.y) * ky }));
}

// The lifts to compare with, newest first: finished lifts filmed before this one that have a bar path. The first of
// them with the same shape (liftShape) is the one shown.
export function liftsBefore(lifts: Lift[], id: string | undefined): Lift[] {
  const current = lifts.find((l) => l.id === id || l.analysisId === id);
  if (!current) return [];
  const when = (l: Lift) => l.at ?? l.date;
  return lifts
    .filter((l) => l.id !== current.id && l.status === 'done' && !!l.analysisId && l.shows !== 'body' && when(l) < when(current))
    .sort((a, b) => (when(a) < when(b) ? 1 : when(a) > when(b) ? -1 : 0));
}

// The frame where the bar is highest inside [first, last]: the top of the lift. Null with no path there.
export function peakFrame(path: TracePoint[], first: number, last: number): number | null {
  let top: TracePoint | null = null;
  for (const p of path) if (p.frame >= first && p.frame <= last && (!top || p.y < top.y)) top = p;
  return top ? top.frame : null;
}
