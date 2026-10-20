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

export function barFromWrists(lw: Pt[], rw: Pt[], maxGap: number): Pt[] {
  const out: Pt[] = lw.map((p, i) => midPt(p, rw[i]));
  for (let f = 0; f < out.length; f++) {
    if (!(finitePt(lw[f]) && finitePt(rw[f]))) {
      out[f] = finitePt(lw[f]) ? [...lw[f]] : [...rw[f]];
    } else if (Math.abs(lw[f][1] - rw[f][1]) > maxGap && f > 0 && finitePt(out[f - 1])) {
      const prev = out[f - 1];
      // min() keeps the first on a tie
      out[f] = dist(lw[f], prev) <= dist(rw[f], prev) ? [...lw[f]] : [...rw[f]];
    }
  }
  return out;
}

export const toRef = (points: Pt[], Ms: Affine[]): Pt[] =>
  points.map((p, i) => (finitePt(p) ? applyAffine(Ms[i], p) : NAN_PT));

export const fromRef = (p: Pt, M: Affine): Pt => applyAffine(invertAffine(M), p);

// (n, J) keypoints through per-frame affines (frames past the end of Ms keep the last one)
export const toWorld = (k: Pt[][], Ms: Affine[]): Pt[][] =>
  k.map((row, f) => {
    const M = Ms[Math.min(f, Ms.length - 1)];
    return row.map((p) => applyAffine(M, p));
  });
