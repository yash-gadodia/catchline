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
export type Hands = { a: Pt[]; b: Pt[]; bodyH: number; shoulders?: Pt[] };

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
// LOST_S seconds, the plate is only taken up again as REGAIN describes: a sure peak on the line of the hands at
// REGAIN times the last size (it may have come nearer; smaller is the far plate's way)
const COAST = 6;
const LOST_S = 0.5;
const REGAIN: [number, number] = [0.8, 1.6];
// a peak the model is less sure of (down to FAINT) still carries the plate when it is where the plate should be: within
// FAINT_REACH radii of where its speed puts it, at a size within FAINT_SIZE of the last
const FAINT = 0.12;
const FAINT_REACH = 0.5;
const FAINT_SIZE = 0.15;

const seen = (p: Peak | undefined): p is Peak => p !== undefined && p[0] >= FAINT && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[3] > 0;
const ok = (p: Peak | undefined): p is Peak => seen(p) && p[0] >= NET_CONF;
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

export type Held = { centre: Pt; r: number };

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
        .filter((p) => ok(p) && p[0] >= SURE && p[3] >= REGAIN[0] * r && p[3] <= REGAIN[1] * r && p[3] >= SHRINK * r0 && onHandsLine(p, hands.a[f], hands.b[f], hands.bodyH))
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
      .filter((p) => (ok(p) || (seen(p) && dist(at(p), pred) <= FAINT_REACH * r && sizeOff(p[3], r) <= Math.log(1 + FAINT_SIZE))) && (lost < COAST || p[0] >= SURE) && dist(at(p), pred) <= reach && sizeOff(p[3], r) <= sizeTol && p[3] >= SHRINK * r0)
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

// A plate is a barbell's only when the lifter's hands show it. Either it rises with them: over some LIFT_S stretch the
// plate climbs at least LIFT_RISE body heights and the hands climb with it (HANDS_RISE of its climb, at most
// 1 / HANDS_RISE); a pull-up lifts the body under still hands, a wall walk moves the hips while the hands push the
// floor. Or it is gripped: for GRIP_S the plate stays put (within GRIP_STILL radii) with a wrist on it (within a radius
// plus GRIP_NEAR body heights), the wrists below the shoulders and the plate not above the hands; hanging from a
// pull-up bar the hands are above the shoulders. Without either there is no plate at all. With it, a frame where no
// wrist is within a radius plus REACH body heights of the plate is drawn only while the plate is at rest (moving under
// GRIP_STILL radii over REST_S either side, the bar on the floor between lifts): not the bar dropped and falling away,
// nor whatever the follow finds in the air after it. (Front rack and overhead the wrists sit under the bar, at the
// floor over it, so the reach is to the nearest wrist, not to a fixed place against the hands.)
const LIFT_S = 0.5;
const LIFT_RISE = 0.2;
const HANDS_RISE = 0.5;
const GRIP_S = 1.0;
const GRIP_STILL = 0.3;
const GRIP_NEAR = 0.15;
const REACH_HANDS = 0.35;
const REST_S = 0.25;

function nearestWrist(hands: Hands, f: number, p: Pt): number {
  const d = [hands.a[f], hands.b[f]].filter(finitePt).map((w) => dist(w, p));
  return d.length ? Math.min(...d) : NaN;
}

function rises(held: Held[], hands: Hands, fps: number): boolean {
  const mid = (f: number): Pt => {
    const [a, b] = [hands.a[f], hands.b[f]];
    return finitePt(a) && finitePt(b) ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : finitePt(a) ? a : b ?? NAN_PT;
  };
  const w = Math.max(2, Math.round(LIFT_S * fps));
  for (let f = 0; f + w < held.length; f++) {
    const [p0, p1, h0, h1] = [held[f].centre, held[f + w].centre, mid(f), mid(f + w)];
    if (![p0, p1, h0, h1].every(finitePt)) continue;
    const rise = p0[1] - p1[1];
    const handsRise = h0[1] - h1[1];
    if (rise >= LIFT_RISE * hands.bodyH && handsRise >= HANDS_RISE * rise && handsRise <= rise / HANDS_RISE) return true;
  }
  return false;
}

function gripped(held: Held[], hands: Hands, fps: number): boolean {
  const g = Math.max(2, Math.round(GRIP_S * fps));
  const on = (f: number, at: Pt) => {
    const h = held[f];
    const wrists = [hands.a[f], hands.b[f]].filter(finitePt);
    const sh = hands.shoulders?.[f];
    if (!finitePt(h.centre) || !wrists.length || !sh || !finitePt(sh) || dist(h.centre, at) > GRIP_STILL * h.r) return false;
    return nearestWrist(hands, f, h.centre) <= h.r + GRIP_NEAR * hands.bodyH && wrists.every((w) => w[1] > sh[1]) && h.centre[1] >= Math.min(...wrists.map((w) => w[1])) - h.r;
  };
  for (let f = 0; f + g < held.length; f++) {
    const at = held[f].centre;
    if (!finitePt(at)) continue;
    let all = true;
    for (let k = f; k <= f + g && all; k++) all = on(k, at);
    if (all) return true;
  }
  return false;
}

export function inHands(held: Held[], hands: Hands, fps: number): Held[] | null {
  if (!rises(held, hands, fps) && !gripped(held, hands, fps)) return null;
  const q = Math.max(1, Math.round(REST_S * fps));
  const atRest = (f: number) => {
    for (let k = Math.max(0, f - q); k <= Math.min(held.length - 1, f + q); k++)
      if (!finitePt(held[k].centre) || dist(held[k].centre, held[f].centre) > GRIP_STILL * held[f].r) return false;
    return true;
  };
  // where no wrist is seen nothing says the plate left the hands
  return held.map((h, f) => (finitePt(h.centre) && nearestWrist(hands, f, h.centre) > h.r + REACH_HANDS * hands.bodyH && !atRest(f) ? { centre: NAN_PT, r: NaN } : h));
}

// The plate followed both ways from its seed, before asking whether it is in the lifter's hands.
export function followed(peaks: Peak[][], mark: Mark | null, fps: number, hands: Hands): Held[] | null {
  const seed = mark ? seedFrom(peaks, mark, fps) : seedAuto(peaks, hands, fps);
  if (!seed) return null;
  const fwd = follow(peaks, seed, 1, fps, hands);
  const back = follow(peaks, seed, -1, fps, hands);
  return fwd.map((h, f) => (f < seed.frame ? back[f] : h));
}

// Per frame the plate's centre (NaN where it is not held, or not in the lifter's hands) and radius. Null when no
// plate is found that rises with the hands.
export function netTrack(peaks: Peak[][], mark: Mark | null, fps: number, hands: Hands): { centres: Pt[]; radii: number[] } | null {
  const all = followed(peaks, mark, fps, hands);
  const held = all && inHands(all, hands, fps);
  const centres = held?.map((h) => h.centre);
  return centres && centres.some(finitePt) ? { centres, radii: held!.map((h) => h.r) } : null;
}
