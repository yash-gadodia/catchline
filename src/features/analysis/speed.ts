import type { TracePoint } from '../../analysis/types';

// Bar speed from the plate's own size (owner, 12-11: parity with WL Analysis). A standard bumper or competition
// plate is 450 mm across, so on any frame the plate model read, metres per pixel = 0.225 / its radius in pixels.
// Each frame's own radius is used, smoothed over SCALE_S, so a plate that comes nearer or goes further from the camera
// (close filming: a third smaller overhead) keeps the right scale. Vertical speed only, up positive, in m/s.
export const PLATE_RADIUS_M = 0.225;
const SCALE_S = 0.25;
// the speed at a frame is the bar's movement across about a fifteenth of a second either side of it
const SPAN_S = 1 / 15;
// no barbell moves faster than this: a faster reading is the tracker jumping between plates, and gets no number
const MAX_MS = 3.5;

export type BarSpeed = { at: Map<number, number>; peak: { frame: number; v: number } | null };

// The fastest upward speed of the pull between two frames (a rep of a set, or the lift), or null where nothing was
// measured: only up to the bar's highest point between them (the catch, or the top of the jerk), so the bar dropped
// after the lift and bouncing off the floor never gives the number (#253: a 2.2 m/s bounce headlined a 2.0 pull).
function pullPeak(at: Map<number, number>, path: TracePoint[], from: number, to: number): { frame: number; v: number } | null {
  const y = new Map(path.map((p) => [p.frame, p.y]));
  let top = -1;
  let topY = Infinity;
  for (const frame of at.keys()) {
    const h = y.get(frame);
    if (frame >= from && frame < to && h !== undefined && h < topY) [top, topY] = [frame, h];
  }
  let best: { frame: number; v: number } | null = null;
  for (const [frame, v] of at) if (frame >= from && frame <= top && v > 0 && (best === null || v > best.v)) best = { frame, v };
  return best;
}

export function peakIn(at: Map<number, number>, path: TracePoint[], from: number, to: number): number | null {
  return pullPeak(at, path, from, to)?.v ?? null;
}

// The rep on screen in numbers: the mean of its upward speeds (the pull, not the drop), and its slowest and fastest.
export function speedStats(at: Map<number, number>, from: number, to: number): { avgUp: number | undefined; min: number; max: number } | null {
  const vs = [...at].filter(([f]) => f >= from && f < to).map(([, v]) => v);
  if (!vs.length) return null;
  const up = vs.filter((v) => v > 0);
  return { avgUp: up.length ? up.reduce((a, b) => a + b, 0) / up.length : undefined, min: Math.min(...vs), max: Math.max(...vs) };
}

export function barSpeed(path: TracePoint[], fps: number, window?: { startFrame: number; endFrame: number }): BarSpeed | null {
  const read = path.filter((p) => p.r !== undefined && p.r > 0);
  if (read.length < 2 || !(fps > 0)) return null;
  const reach = Math.max(1, Math.round(SCALE_S * fps));
  // the radius at a frame: the median of the readings within SCALE_S of it
  const radius = (frame: number): number | null => {
    const near = read.filter((p) => Math.abs(p.frame - frame) <= reach).map((p) => p.r as number).sort((a, b) => a - b);
    return near.length ? near[Math.floor(near.length / 2)] : null;
  };
  const byFrame = new Map(path.map((p) => [p.frame, p]));
  const k = Math.max(1, Math.round(SPAN_S * fps));
  const at = new Map<number, number>();
  for (const p of path) {
    const a = byFrame.get(p.frame - k);
    const b = byFrame.get(p.frame + k);
    const r = radius(p.frame);
    if (!a || !b || r === null) continue;
    // y is a fraction of the picture's height and so is r: the height cancels
    const v = (-(b.y - a.y) * PLATE_RADIUS_M) / r / ((b.frame - a.frame) / fps);
    if (Math.abs(v) <= MAX_MS) at.set(p.frame, Math.round(v * 100) / 100);
  }
  if (!at.size) return null;
  return { at, peak: pullPeak(at, path, window?.startFrame ?? -Infinity, (window?.endFrame ?? Infinity) + 1) };
}
