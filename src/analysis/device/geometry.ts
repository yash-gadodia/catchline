// cv/catchline_cv/geometry.py and the point helpers of track.py
import { Affine, Pt, clip, degrees, pyRound, sum } from './num';

export const NAN_PT: Pt = [NaN, NaN];
export const finitePt = (p: Pt) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const midPt = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const dist = (a: Pt, b: Pt) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
};

// angle ABC in degrees
export function angle1(a: Pt, b: Pt, c: Pt): number {
  const v1x = a[0] - b[0];
  const v1y = a[1] - b[1];
  const v2x = c[0] - b[0];
  const v2y = c[1] - b[1];
  const cos = (v1x * v2x + v1y * v2y) / (Math.sqrt(v1x * v1x + v1y * v1y) * Math.sqrt(v2x * v2x + v2y * v2y));
  return degrees(Math.acos(clip(cos, -1.0, 1.0)));
}

export const angle = (a: Pt[], b: Pt[], c: Pt[]) => a.map((p, i) => angle1(p, b[i], c[i]));

export function trunkAngle1(s: Pt, h: Pt): number {
  const dx = s[0] - h[0];
  const dy = s[1] - h[1];
  return degrees(Math.atan2(-dy, Math.abs(dx)));
}

export const trunkAngle = (s: Pt[], h: Pt[]) => s.map((p, i) => trunkAngle1(p, h[i]));

export function normalise(pt: Pt, width: number, height: number, nd = 4): { x: number; y: number } {
  return { x: pyRound(clip(pt[0] / width, 0, 1), nd), y: pyRound(clip(pt[1] / height, 0, 1), nd) };
}

export const applyAffine = (M: Affine, p: Pt): Pt => [
  p[0] * M[0][0] + p[1] * M[0][1] + M[0][2],
  p[0] * M[1][0] + p[1] * M[1][1] + M[1][2],
];

export function invertAffine(M: Affine): Affine {
  const [[a, b, c], [d, e, f]] = M;
  const det = a * e - b * d;
  return [
    [e / det, -b / det, (b * f - c * e) / det],
    [-d / det, a / det, (c * d - a * f) / det],
  ];
}

export function riseRatio(refY: number[], otherY: number[]): number | null {
  const a0: number[] = [];
  const b0: number[] = [];
  refY.forEach((v, i) => {
    if (Number.isFinite(v) && Number.isFinite(otherY[i])) {
      a0.push(v);
      b0.push(otherY[i]);
    }
  });
  if (a0.length < 3) return null;
  const ma = sum(a0) / a0.length;
  const mb = sum(b0) / b0.length;
  const a = a0.map((v) => v - ma);
  const b = b0.map((v) => v - mb);
  const den = sum(a.map((v) => v * v));
  return den > 0 ? sum(a.map((v, i) => v * b[i])) / den : null;
}

// One wrist stands for the bar where the other is missing or more than maxGap off in height, at its own height but
// moved across by its offset from the midpoint on the last frame both agreed: off side-on the hands are a grip apart,
// and a lone wrist read as the bar moves it half a grip sideways, which reads as forward or back. Where both are seen
// and still within half to 1.5 grips apart across the frame, the bar keeps their midpoint across: the grip looks wider
// as the bar rises above a low camera, and the frozen offset read that as the bar moving forward.
export function barFromWrists(lw: Pt[], rw: Pt[], maxGap: number): Pt[] {
  const out: Pt[] = lw.map((p, i) => midPt(p, rw[i]));
  let toMid = [0, 0];
  for (let f = 0; f < out.length; f++) {
    const l: Pt = [lw[f][0] + toMid[0], lw[f][1]];
    const r: Pt = [rw[f][0] + toMid[1], rw[f][1]];
    if (!(finitePt(lw[f]) && finitePt(rw[f]))) {
      out[f] = finitePt(lw[f]) ? l : r;
    } else if (Math.abs(lw[f][1] - rw[f][1]) <= maxGap) {
      toMid = [out[f][0] - lw[f][0], out[f][0] - rw[f][0]];
    } else if (f > 0 && finitePt(out[f - 1])) {
      const prev = out[f - 1];
      // min() keeps the first on a tie
      const pick = dist(l, prev) <= dist(r, prev) ? l : r;
      const grips = (lw[f][0] - rw[f][0]) / (toMid[1] - toMid[0]);
      out[f] = grips >= 0.5 && grips <= 1.5 ? [out[f][0], pick[1]] : pick;
    }
  }
  return out;
}

const med3 = (a: number, b: number, c: number) => {
  const v = [a, b, c].filter(Number.isFinite).sort((x, y) => x - y);
  return v.length ? v[(v.length - 1) >> 1] : NaN;
};
// 3-frame running median per coordinate (the end frames keep their own value)
export const median3 = (p: Pt[]): Pt[] =>
  p.map((q, i) => {
    const a = p[Math.max(0, i - 1)];
    const c = p[Math.min(p.length - 1, i + 1)];
    return [med3(a[0], q[0], c[0]), med3(a[1], q[1], c[1])];
  });

// The bar is the hands (design 2.1): barFromWrists over 3-frame medians of the wrists, so a one-frame wrist flip never
// reaches the low-pass, and a frame whose bar jumps more than 0.25 body heights from the last good one is left out
// (NaN, interpolated by the low-pass); after 3 left-out frames in a row the track follows the wrists again.
export function barTrack(lw: Pt[], rw: Pt[], bodyH: number): Pt[] {
  const bar = barFromWrists(median3(lw), median3(rw), 0.12 * bodyH);
  let last: Pt | null = null;
  let skipped = 0;
  return bar.map((p) => {
    if (!finitePt(p)) return p;
    if (last && skipped < 3 && dist(p, last) > 0.25 * bodyH) {
      skipped += 1;
      return NAN_PT;
    }
    last = p;
    skipped = 0;
    return p;
  });
}

// A followed plate frame is drawn from the plate only when the follower detected the plate there (not carried it on
// optical flow), inside a run of at least PLATE_RUN such frames that each look like the setup plate: the rim has edges
// (median over +-2 frames), of one polarity unless the rim is strong on its own, the size holds, the plate stays about
// as far from the hands as at setup (a track that slid onto the hands or the body reads nearer; one that wandered off
// reads further), and its inside keeps the setup plate's grey. A run in which the hands travel over half a plate width
// must also move with them: a plate that does not rise and fall with the hands is not the lifter's (measured
// 29-10 against an independent plate truth on 12 clips: these rules keep 87% of the frames within 0.25 radii of the
// plate and 16% of those further than 0.5 radii off; the polarity-only rule lost a sixth of the good frames).
const PLATE_RIM = 0.3;
const PLATE_RIM_SURE = 0.5;
const PLATE_POLARITY = 0.5;
const PLATE_GREY = 40;
const PLATE_SIZE: [number, number] = [0.9, 1.3];
const PLATE_LEASH: [number, number] = [-0.35, 0.5];
const PLATE_RUN = 4;
const PLATE_TRAVEL = 0.5;
const PLATE_COMOTION = 0.3;
const PLATE_TRAVEL_RATIO: [number, number] = [0.4, 2.5];

export function onPlate(src: number[], fit: [number, number, number, number][], centres: Pt[], wrists: Pt[], seed: number): boolean[] {
  const M0 = fit[seed][0], home = dist(centres[seed], wrists[seed]);
  const med = (k: number, f: number) => {
    const v: number[] = [];
    for (let i = f; i >= Math.max(0, f - 2) && src[i] > 0; i--) v.push(fit[i][k]);
    for (let i = f + 1; i <= Math.min(src.length - 1, f + 2) && src[i] > 0; i++) v.push(fit[i][k]);
    const s = v.filter(Number.isFinite).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : NaN;
  };
  const pass = src.map((s, f) => {
    if (s !== 1 || !finitePt(wrists[f])) return false;
    const size = fit[f][0] / M0;
    const leash = (dist(centres[f], wrists[f]) - home) / M0;
    const rim = med(1, f);
    return rim >= PLATE_RIM && (med(2, f) >= PLATE_POLARITY || rim >= PLATE_RIM_SURE) && Math.abs(med(3, f) - fit[seed][3]) <= PLATE_GREY &&
      size >= PLATE_SIZE[0] && size <= PLATE_SIZE[1] && leash >= PLATE_LEASH[0] && leash <= PLATE_LEASH[1];
  });
  const ok = new Array<boolean>(src.length).fill(false);
  // a run: passing frames, flow-carried frames allowed between them (bridged, not drawn)
  for (let f = 0; f < pass.length; ) {
    if (!pass[f]) {
      f++;
      continue;
    }
    let e = f;
    while (e < pass.length && (pass[e] || src[e] === 2)) e++;
    while (!pass[e - 1]) e--;
    const run = [];
    for (let i = f; i < e; i++) if (pass[i]) run.push(i);
    if (run.length >= PLATE_RUN && movesWithHands(run, centres, wrists, M0)) for (const i of run) ok[i] = true;
    f = e;
  }
  return ok;
}

function movesWithHands(run: number[], centres: Pt[], wrists: Pt[], M0: number): boolean {
  const wy = run.map((i) => wrists[i][1]);
  const py = run.map((i) => centres[i][1]);
  const range = (v: number[]) => Math.max(...v) - Math.min(...v);
  if (range(wy) < PLATE_TRAVEL * M0) return true;
  const mw = wy.reduce((a, b) => a + b, 0) / wy.length;
  const mp = py.reduce((a, b) => a + b, 0) / py.length;
  let sxy = 0, sxx = 0, syy = 0;
  wy.forEach((w, i) => {
    sxy += (w - mw) * (py[i] - mp);
    sxx += (w - mw) ** 2;
    syy += (py[i] - mp) ** 2;
  });
  const corr = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  const ratio = range(py) / range(wy);
  return corr >= PLATE_COMOTION && ratio >= PLATE_TRAVEL_RATIO[0] && ratio <= PLATE_TRAVEL_RATIO[1];
}

export function fusePath(plate: Pt[], wrist: Pt[]): { path: Pt[]; plate: boolean[] } {
  const isPlate = plate.map(finitePt);
  const known = plate.flatMap((p, i) => (isPlate[i] && finitePt(wrist[i]) ? [i] : []));
  if (!known.length) return { path: wrist, plate: plate.map(() => false) };
  const d = (i: number, j: number) => plate[i][j] - wrist[i][j];
  const off = (f: number, j: number) => {
    const k = known.findIndex((i) => i >= f);
    if (k <= 0) return d(known[k === 0 ? 0 : known.length - 1], j);
    const a = known[k - 1], b = known[k];
    return d(a, j) + ((d(b, j) - d(a, j)) * (f - a)) / (b - a);
  };
  return { path: plate.map((p, f): Pt => (isPlate[f] ? p : [wrist[f][0] + off(f, 0), wrist[f][1] + off(f, 1)])), plate: isPlate };
}

export const toRef =(points: Pt[], Ms: Affine[]): Pt[] =>
  points.map((p, i) => (finitePt(p) ? applyAffine(Ms[i], p) : NAN_PT));

export const fromRef = (p: Pt, M: Affine): Pt => applyAffine(invertAffine(M), p);

// (n, J) keypoints through per-frame affines (frames past the end of Ms keep the last one)
export const toWorld = (k: Pt[][], Ms: Affine[]): Pt[][] =>
  k.map((row, f) => {
    const M = Ms[Math.min(f, Ms.length - 1)];
    return row.map((p) => applyAffine(M, p));
  });
