// The lifter's plate from PlateNet's peaks (native Stages/PlateNet.swift: per frame up to six plate centres with a
// confidence and a radius, three from a square around the hands and three from a square on the plate last seen).
// Which peak is the lifter's is decided here, frame after frame, from where the plate was, where it was heading and
// how big it is: started on the lifter's own mark, or without one on the first sure plate on the line of the hands.
// A short run of frames with no peak that fits is bridged once the plate is found again; a longer one is left empty,
// and the plate is then taken up again only where it plainly is (sure, its size, on the line of the hands), never
// drifted to. It never moves to a peak much smaller than the plate it holds (the far end of the bar reads smaller).
import { NAN_PT, dist, finitePt } from './geometry';
import { Pt } from './num';

// [confidence, x, y, radius] in inference px; NaN where the model gave no such peak
export type Peak = [number, number, number, number];
// the plate on one frame, inference px
export type Mark = { frame: number; centre: Pt; r: number };
// the lifter's wrists per frame and body height, inference px: where the plate is looked for without a mark
export type Hands = { a: Pt[]; b: Pt[]; bodyH: number };

// a peak under this is no plate (the model's evaluation: 0.3 keeps 93% of hand-labelled phone frames)
export const NET_CONF = 0.3;
// starting without a mark, and taking the plate up again after a long gap, ask for this much
const SURE = 0.5;
// a mark's plate is looked for within this many of its radii, at this size against it
const SEED_REACH = 1.0;
const SEED_SIZE: [number, number] = [0.6, 1.6];
// with no mark: a plate within LINE body heights (plus half its radius) of the line through the wrists, or within
// NEAR body heights of the hands when they overlap; held AUTO_RUN frames in a row
const LINE = 0.15;
const NEAR = 0.5;
const AUTO_RUN = 5;
// frame to frame the plate lands within REACH radii of where its speed puts it (REACH_LOST more for every frame it
// was not seen, to at most REACH_MAX), at a size within SIZE_STEP of the last (SIZE_LOST more per unseen frame, to
// SIZE_MAX), and no smaller than SHRINK of its first: filmed close, a plate overhead reads up to 45% smaller than on
// the floor (and filmed bar-end-on, it grows as the bar comes towards the phone)
const REACH = 1.5;
const REACH_LOST = 0.5;
const REACH_MAX = 4.0;
const SIZE_STEP = 0.2;
const SIZE_LOST = 0.05;
const SIZE_MAX = 0.4;
const SHRINK = 0.55;
// unseen up to COAST frames, the gap is drawn on a straight line once the plate is found again; unseen for
// LOST_S seconds, the plate is only taken up again as REGAIN describes: a sure peak on the line of the hands within
// REGAIN of the last size
const COAST = 6;
const LOST_S = 0.5;
const REGAIN = 0.25;

const ok = (p: Peak | undefined): p is Peak => p !== undefined && p[0] >= NET_CONF && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[3] > 0;
const at = (p: Peak): Pt => [p[1], p[2]];
const sizeOff = (r: number, ref: number) => Math.abs(Math.log(r / ref));

type Seed = { frame: number; peak: Peak };

function seedFrom(peaks: Peak[][], mark: Mark, fps: number): Seed | null {
  // the mark is made on a frame where the bar is at rest, so the plate is there for the next half second too
  for (let f = Math.max(0, mark.frame); f < Math.min(peaks.length, mark.frame + Math.round(fps / 2) + 1); f++) {
    const near = peaks[f]
      .filter((p) => ok(p) && dist(at(p), mark.centre) <= SEED_REACH * mark.r && p[3] >= SEED_SIZE[0] * mark.r && p[3] <= SEED_SIZE[1] * mark.r)
      .sort((a, b) => dist(at(a), mark.centre) / mark.r + sizeOff(a[3], mark.r) - dist(at(b), mark.centre) / mark.r - sizeOff(b[3], mark.r))[0];
    if (near) return { frame: f, peak: near };
  }
  return null;
}

function onHandsLine(p: Peak, a: Pt, b: Pt, bodyH: number): boolean {
  if (!finitePt(a) && !finitePt(b)) return false;
  if (!finitePt(a) || !finitePt(b) || dist(a, b) < 0.1 * bodyH) {
    const m: Pt = finitePt(a) && finitePt(b) ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : finitePt(a) ? a : b;
    return dist(at(p), m) <= NEAR * bodyH;
  }
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const off = Math.abs(dx * (p[2] - a[1]) - dy * (p[1] - a[0])) / Math.hypot(dx, dy);
  return off <= LINE * bodyH + 0.5 * p[3];
}

function seedAuto(peaks: Peak[][], hands: Hands, fps: number): Seed | null {
  for (let f = 0; f + AUTO_RUN <= peaks.length; f++) {
    const sure = peaks[f].filter((p) => ok(p) && p[0] >= SURE && onHandsLine(p, hands.a[f], hands.b[f], hands.bodyH)).sort((a, b) => b[3] - a[3]);
    for (const p of sure) {
      const run = follow(peaks, { frame: f, peak: p }, 1, fps, hands, f + AUTO_RUN);
      if (run.every((c, g) => g < f || g >= f + AUTO_RUN || finitePt(c.centre))) return { frame: f, peak: p };
    }
  }
  return null;
}

type Held = { centre: Pt; r: number };

// The plate from the seed one way (dir 1 forwards, -1 backwards) up to frame `end` (exclusive going forwards).
function follow(peaks: Peak[][], seed: Seed, dir: 1 | -1, fps: number, hands: Hands, end = dir > 0 ? peaks.length : -1): Held[] {
  const out: Held[] = Array.from({ length: peaks.length }, () => ({ centre: NAN_PT, r: NaN }));
  const r0 = seed.peak[3];
  let last = at(seed.peak);
  let lastF = seed.frame;
  let r = r0;
  let v: Pt = [0, 0];
  out[seed.frame] = { centre: last, r };
  const gone = Math.max(COAST + 1, Math.round(LOST_S * fps));
  for (let f = seed.frame + dir; f !== end && f >= 0 && f < peaks.length; f += dir) {
    const lost = Math.abs(f - lastF) - 1;
    if (lost >= gone) {
      const again = peaks[f]
        .filter((p) => ok(p) && p[0] >= SURE && sizeOff(p[3], r) <= Math.log(1 + REGAIN) && p[3] >= SHRINK * r0 && onHandsLine(p, hands.a[f], hands.b[f], hands.bodyH))
        .sort((a, b) => sizeOff(a[3], r) - sizeOff(b[3], r))[0];
      if (again) {
        last = at(again);
        lastF = f;
        r = again[3];
        v = [0, 0];
        out[f] = { centre: last, r };
      }
      continue;
    }
    const pred: Pt = [last[0] + v[0] * (lost + 1), last[1] + v[1] * (lost + 1)];
    const reach = Math.min(REACH + REACH_LOST * lost, REACH_MAX) * r;
    const sizeTol = Math.log(1 + Math.min(SIZE_STEP + SIZE_LOST * lost, SIZE_MAX));
    const cost = (p: Peak) => dist(at(p), pred) / r + 2 * sizeOff(p[3], r);
    const next = peaks[f]
      .filter((p) => ok(p) && (lost < COAST || p[0] >= SURE) && dist(at(p), pred) <= reach && sizeOff(p[3], r) <= sizeTol && p[3] >= SHRINK * r0)
      .sort((a, b) => cost(a) - cost(b))[0];
    if (!next) continue;
    const c = at(next);
    if (lost > 0 && lost <= COAST)
      for (let g = 1; g <= lost; g++) {
        const t = g / (lost + 1);
        out[lastF + dir * g] = { centre: [last[0] + (c[0] - last[0]) * t, last[1] + (c[1] - last[1]) * t], r: r + (next[3] - r) * t };
      }
    const step: Pt = [(c[0] - last[0]) / (lost + 1), (c[1] - last[1]) / (lost + 1)];
    v = lastF === seed.frame && lost === 0 && v[0] === 0 && v[1] === 0 ? step : [0.5 * v[0] + 0.5 * step[0], 0.5 * v[1] + 0.5 * step[1]];
    last = c;
    lastF = f;
    r = next[3];
    out[f] = { centre: c, r };
  }
  return out;
}

// Per frame the plate's centre (NaN where it is not held) and radius. Null when the plate is never found.
export function netTrack(peaks: Peak[][], mark: Mark | null, fps: number, hands: Hands): { centres: Pt[]; radii: number[] } | null {
  const seed = mark ? seedFrom(peaks, mark, fps) : seedAuto(peaks, hands, fps);
  if (!seed) return null;
  const fwd = follow(peaks, seed, 1, fps, hands);
  const back = follow(peaks, seed, -1, fps, hands);
  const held = fwd.map((h, f) => (f < seed.frame ? back[f] : h));
  const centres = held.map((h) => h.centre);
  return centres.some(finitePt) ? { centres, radii: held.map((h) => h.r) } : null;
}
