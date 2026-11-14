// The frames a chart shows: the whole lift, or the part of it the lifter pinched in to.
export type FrameWindow = { first: number; last: number };

const STEPS = [1, 2, 2.5, 5, 10];

// Round values to label an axis from lo to hi: the smallest 1 / 2 / 2.5 / 5 step that needs no more than `max` gaps.
export function ticks(lo: number, hi: number, max: number): number[] {
  if (!(hi > lo) || max < 1) return [];
  const raw = (hi - lo) / max;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = (STEPS.find((s) => s * pow >= raw - 1e-12) ?? 10) * pow;
  const out: number[] = [];
  // + 0 turns a -0 into 0
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push(Math.round(k * step * 1e6) / 1e6 + 0);
  return out;
}

// The window after a pinch. `from` is the window when the fingers landed and `anchor` how far across it they were
// (0 to 1); `at` is how far across the chart they are now and `scale` their spread now over their spread then. The
// frame under the fingers stays under them, so spreading zooms in and sliding both fingers pans. Null is the whole
// lift again.
export function pinched(from: FrameWindow, anchor: number, at: number, scale: number, full: FrameWindow, minSpan: number): FrameWindow | null {
  const whole = full.last - full.first;
  if (!(scale > 0) || whole <= 0) return null;
  const span = Math.round(Math.max((from.last - from.first) / scale, minSpan));
  if (span >= whole) return null;
  const frame = from.first + anchor * (from.last - from.first);
  const first = Math.round(Math.min(Math.max(frame - at * span, full.first), full.last - span));
  return { first, last: first + span };
}
