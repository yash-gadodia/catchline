import type { ClipSet } from './store';

// Finds the sets in a long library clip. TODO(on-device pose): segment on
// motion; until then a clip is one set and the lifter trims it by hand.
export function detectSets(_uri: string | null, _durationS: number): ClipSet[] {
  return [];
}

// The design's 01:42 muscle-up clip, for dev links and tests.
export const DEMO_SETS: ClipSet[] = [
  { start: 3, end: 8, reps: 2 },
  { start: 14, end: 32, reps: 5 },
  { start: 41, end: 59, reps: 4 },
  { start: 66, end: 81, reps: 3 },
];

export const DEMO_IMPORT = { durationS: 102, fps: 30, setIndex: 1 };

export type StripCell = { kind: 'gap'; seconds: number } | { kind: 'set'; seconds: number; index: number };

export function setStrip(sets: ClipSet[], durationS: number): StripCell[] {
  const cells: StripCell[] = [];
  let t = 0;
  sets.forEach((s, index) => {
    if (s.start > t) cells.push({ kind: 'gap', seconds: s.start - t });
    cells.push({ kind: 'set', seconds: s.end - s.start, index });
    t = s.end;
  });
  if (durationS > t) cells.push({ kind: 'gap', seconds: durationS - t });
  return cells;
}

export function repOptions(reps: number | null): number[] {
  return Array.from({ length: reps ?? 5 }, (_, i) => i + 1);
}
