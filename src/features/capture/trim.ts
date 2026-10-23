import { maxDurationS } from './compress';

export type Trim = { start: number; end: number };

export const MIN_TRIM_S = 1;
// One tap of ‹ or ›: about three frames at 30 fps.
export const NUDGE_S = 0.1;
// Past this a clip is more than one lift: still analysable, just slower and less sharp.
export const LONG_FOR_ONE_LIFT_S = 20;

export function fullTrim(durationS: number): Trim {
  return { start: 0, end: durationS };
}

export function moveHandle(trim: Trim, handle: 'start' | 'end', t: number, durationS: number): Trim {
  const min = Math.min(MIN_TRIM_S, durationS);
  if (handle === 'start') return { start: clamp(t, 0, trim.end - min), end: trim.end };
  return { start: trim.start, end: clamp(t, trim.start + min, durationS) };
}

// Dragging the middle of the selection moves it whole, keeping its length.
export function slideTrim(trim: Trim, dt: number, durationS: number): Trim {
  const len = trim.end - trim.start;
  const start = round2(clamp(trim.start + dt, 0, Math.max(durationS - len, 0)));
  return { start, end: round2(start + len) };
}

export function nudgeHandle(trim: Trim, handle: 'start' | 'end', direction: 1 | -1, durationS: number): Trim {
  const next = moveHandle(trim, handle, trim[handle] + direction * NUDGE_S, durationS);
  return { start: round2(next.start), end: round2(next.end) };
}

// too_long would fail after preparing (prepareClip's ClipTooLongError), so it is caught here instead.
export function trimProblem(trim: Trim, maxS: number = maxDurationS()): 'too_long' | 'long' | null {
  const len = trimLength(trim);
  if (len > maxS) return 'too_long';
  return len > LONG_FOR_ONE_LIFT_S ? 'long' : null;
}

export function trimLength(trim: Trim): number {
  return trim.end - trim.start;
}

// Playback stays inside the trim: past the end, jump back to the start.
export function loopTime(t: number, trim: Trim): number {
  return t < trim.start || t >= trim.end ? trim.start : t;
}

// The playhead lives inside the trim: a drag past a handle stops at it.
export function clampToTrim(t: number, trim: Trim): number {
  return round2(clamp(t, trim.start, trim.end));
}

export function playheadAt(x: number, trim: Trim, durationS: number, width: number): number {
  return clampToTrim(xToTime(x, durationS, width), trim);
}

// A handle that has hit the clip's edge or the minimum length: the moment for one haptic tick.
export function atLimit(trim: Trim, handle: 'start' | 'end', durationS: number): boolean {
  const min = Math.min(MIN_TRIM_S, durationS);
  if (handle === 'start') return trim.start <= 0 || trim.start >= trim.end - min;
  return trim.end >= durationS || trim.end <= trim.start + min;
}

// One filmstrip frame from the middle of each cell, so every time sits strictly inside
// the clip: AVAssetImageGenerator only decodes exact frames for times before the end.
export function thumbTimes(durationS: number, count: number): number[] {
  if (durationS <= 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => round2(((i + 0.5) / count) * durationS));
}

export function timeToX(t: number, durationS: number, width: number): number {
  return durationS > 0 ? (t / durationS) * width : 0;
}

export function xToTime(x: number, durationS: number, width: number): number {
  return width > 0 ? clamp(x / width, 0, 1) * durationS : 0;
}

// 00:01.4
export function trimClock(t: number): string {
  const tenths = Math.round(t * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
