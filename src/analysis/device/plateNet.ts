// The lifter's plate from PlateNet's peaks (native Stages/PlateNet.swift: per frame up to three plate centres with a
// confidence and a radius, read in a square around the hands). Which peak is the lifter's is decided here, frame
// after frame, from where the plate was and how big it is: started on the lifter's own mark, or without one on the
// model's surest stretch. A frame with no peak that fits is not held (nothing is drawn there); the plate is taken
// up again only near where it was lost, never on a plate of another size (the far end of the bar reads smaller).
import { NAN_PT, dist, finitePt } from './geometry';
import { Pt } from './num';

// [confidence, x, y, radius] in inference px; NaN where the model gave no such peak
export type Peak = [number, number, number, number];
// the plate on one frame, inference px
export type Mark = { frame: number; centre: Pt; r: number };

// a peak under this is no plate (the model's own evaluation: 0.3 keeps 93% of hand-labelled phone frames)
export const NET_CONF = 0.3;
// a mark's plate is looked for within this many of its radii of the mark, at this size against it
const SEED_REACH = 0.6;
const SEED_SIZE: [number, number] = [0.6, 1.6];
// with no mark the plate is the largest one the model is this sure of for this many frames in a row
const AUTO_CONF = 0.6;
const AUTO_RUN = 5;
// frame to frame the plate moves under this many radii (growing a little with every frame it was not seen, to at
// most REACH_MAX), keeps its size within STEP of the last and within SIZE of the first: filmed close a plate
// overhead reads up to 45% smaller than on the floor
const REACH = 0.9;
const REACH_LOST = 0.25;
const REACH_MAX = 3.0;
const SIZE_STEP = 0.25;
const SIZE: [number, number] = [0.5, 1.7];

const ok = (p: Peak | undefined): p is Peak => p !== undefined && p[0] >= NET_CONF && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[3] > 0;

function seedFrom(peaks: Peak[][], mark: Mark, fps: number): { frame: number; peak: Peak } | null {
  // the mark is made on a frame where the bar is at rest, so the plate is there for the next half second too
  for (let f = Math.max(0, mark.frame); f < Math.min(peaks.length, mark.frame + Math.round(fps / 2) + 1); f++) {
    const near = peaks[f]
      .filter((p) => ok(p) && dist([p[1], p[2]], mark.centre) <= SEED_REACH * mark.r && p[3] >= SEED_SIZE[0] * mark.r && p[3] <= SEED_SIZE[1] * mark.r)
      .sort((a, b) => dist([a[1], a[2]], mark.centre) - dist([b[1], b[2]], mark.centre))[0];
    if (near) return { frame: f, peak: near };
  }
  return null;
}

function seedAuto(peaks: Peak[][]): { frame: number; peak: Peak } | null {
  const sure = (p: Peak | undefined): p is Peak => ok(p) && p[0] >= AUTO_CONF;
  let best: { frame: number; peak: Peak } | null = null;
  for (let f = 0; f + AUTO_RUN <= peaks.length; f++) {
    for (const first of peaks[f]) {
      // the nearest plate is the largest
      if (!sure(first) || (best && first[3] <= best.peak[3])) continue;
      let at = first;
      let held = true;
      for (let g = f + 1; g < f + AUTO_RUN && held; g++) {
        const next = peaks[g].find((p) => sure(p) && dist([p[1], p[2]], [at[1], at[2]]) <= 0.5 * at[3] && Math.abs(p[3] / at[3] - 1) <= SIZE_STEP);
        if (next) at = next;
        else held = false;
      }
      if (held) best = { frame: f, peak: first };
    }
  }
  return best;
}

// Per frame the plate's centre (NaN where it is not held) and radius. Null when the plate is never found.
export function netTrack(peaks: Peak[][], mark: Mark | null, fps: number): { centres: Pt[]; radii: number[] } | null {
  const seed = mark ? seedFrom(peaks, mark, fps) : seedAuto(peaks);
  if (!seed) return null;
  const n = peaks.length;
  const centres: Pt[] = Array.from({ length: n }, () => NAN_PT);
  const radii = new Array<number>(n).fill(NaN);
  const r0 = mark ? mark.r : seed.peak[3];
  centres[seed.frame] = [seed.peak[1], seed.peak[2]];
  radii[seed.frame] = seed.peak[3];
  for (const dir of [1, -1]) {
    let at: Pt = centres[seed.frame];
    let r = seed.peak[3];
    let lost = 0;
    for (let f = seed.frame + dir; f >= 0 && f < n; f += dir) {
      const reach = Math.min(REACH + REACH_LOST * lost, REACH_MAX) * r;
      const next = peaks[f]
        .filter((p) => ok(p) && dist([p[1], p[2]], at) <= reach && Math.abs(p[3] / r - 1) <= SIZE_STEP * (1 + Math.min(lost, 4)) && p[3] >= SIZE[0] * r0 && p[3] <= SIZE[1] * r0)
        .sort((a, b) => dist([a[1], a[2]], at) - dist([b[1], b[2]], at))[0];
      if (!next) {
        lost += 1;
        continue;
      }
      at = [next[1], next[2]];
      r = next[3];
      lost = 0;
      centres[f] = at;
      radii[f] = r;
    }
  }
  return centres.some(finitePt) ? { centres, radii } : null;
}
