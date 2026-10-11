export type Trim = { start: number; end: number };

export const MIN_TRIM_S = 1;

export function fullTrim(durationS: number): Trim {
  return { start: 0, end: durationS };
}

export function moveHandle(trim: Trim, handle: 'start' | 'end', t: number, durationS: number): Trim {
  const min = Math.min(MIN_TRIM_S, durationS);
  if (handle === 'start') return { start: clamp(t, 0, trim.end - min), end: trim.end };
  return { start: trim.start, end: clamp(t, trim.start + min, durationS) };
}

export function trimLength(trim: Trim): number {
  return trim.end - trim.start;
}

// Playback stays inside the trim: past the end, jump back to the start.
export function loopTime(t: number, trim: Trim): number {
  return t < trim.start || t >= trim.end ? trim.start : t;
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
