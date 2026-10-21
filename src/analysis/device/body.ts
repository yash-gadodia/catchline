// The body helpers of cv/catchline_cv/lifts.py (shared by the snatch, clean, jerk, gymnastics and detect code) and
// gym.sustained_below.
import { angle } from './geometry';
import {
  K,
  L_ANK,
  L_BIGTOE,
  L_ELB,
  L_HEEL,
  L_HIP,
  L_KNEE,
  L_SHO,
  L_WRI,
  R_ANK,
  R_BIGTOE,
  R_ELB,
  R_HEEL,
  R_HIP,
  R_KNEE,
  R_SHO,
  R_WRI,
  col,
  mid,
  torsoPx,
  xs,
} from './movement';
import { Pt, degrees, fmax, mean, nanargmax, nanmax, nanmean, nanmedian, nanpercentile } from './num';

const SEGMENTS_CM = 132.0;
export const HANG_HIP_W = 0.38;

// Python's min(a, b): b only when b < a (a NaN b is never smaller)
export const pyMin = (a: number, b: number) => (b < a ? b : a);

export const elbows = (k: K): [number[], number[]] => [
  angle(col(k, L_SHO), col(k, L_ELB), col(k, L_WRI)),
  angle(col(k, R_SHO), col(k, R_ELB), col(k, R_WRI)),
];

export const meanAngle = (k: K, a: [number, number, number], b: [number, number, number]) => {
  const l = angle(col(k, a[0]), col(k, a[1]), col(k, a[2]));
  const r = angle(col(k, b[0]), col(k, b[1]), col(k, b[2]));
  return l.map((v, i) => (v + r[i]) / 2);
};
export const kneeAngles = (k: K) => meanAngle(k, [L_HIP, L_KNEE, L_ANK], [R_HIP, R_KNEE, R_ANK]);
export const hipAngles = (k: K) => meanAngle(k, [L_SHO, L_HIP, L_KNEE], [R_SHO, R_HIP, R_KNEE]);

export function facing(k: K): number {
  const toe = mid(k, L_BIGTOE, R_BIGTOE);
  const heel = mid(k, L_HEEL, R_HEEL);
  const d = toe.map((p, i) => p[0] - heel[i][0]);
  const m = d.some(Number.isFinite) ? nanmedian(d) : 0.0;
  return m >= 0 ? 1.0 : -1.0;
}

const len = (a: Pt, b: Pt) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
const mid1 = (r: Pt[], a: number, b: number): Pt => [(r[a][0] + r[b][0]) / 2, (r[a][1] + r[b][1]) / 2];
// keypoint shoulder and hip widths as a share of the standing torso, seen front-on
const SHO_W = 0.7;
const HIP_W = 0.5;

export function scaleFromBody(k: K): number | null {
  const segs = [
    [L_SHO, L_HIP, L_KNEE, L_ANK],
    [R_SHO, R_HIP, R_KNEE, R_ANK],
  ].map(([s, h, kn, a]) => k.map((r) => len(r[s], r[h]) + len(r[h], r[kn]) + len(r[kn], r[a])));
  const total = segs[0].map((v, i) => nanmean([v, segs[1][i]]));
  return total.some(Number.isFinite) ? nanpercentile(total, 90) / SEGMENTS_CM : null;
}

export function offSidePose(k: K, hipW = 0.5): number | null {
  const t = torsoPx(k);
  if (!Number.isFinite(t) || t <= 0) return null;
  const ds = nanmedian(k.map((r) => Math.abs(r[L_SHO][0] - r[R_SHO][0]))) / (0.7 * t);
  const dh = nanmedian(k.map((r) => Math.abs(r[L_HIP][0] - r[R_HIP][0]))) / (hipW * t);
  return degrees(mean([Math.asin(pyMin(1.0, ds)), Math.asin(pyMin(1.0, dh))]));
}

export const MAX_YAW_DEG = 70;

// The camera's yaw off side-on from the lifter's body (design 3.1): offSidePose over the pull, from lift-off to the
// second extension, where the lifter is upright or hinged (not stacked in a squat or overhead), with the standing
// torso (90th percentile over the window) as the length the widths are read against.
export function yawFromBody(k: K, a: number, b: number): number | null {
  const t = nanpercentile(k.map((r) => len(mid1(r, L_SHO, R_SHO), mid1(r, L_HIP, R_HIP))), 90);
  const w = k.slice(a, b + 1);
  if (!Number.isFinite(t) || t <= 0 || w.length < 3) return null;
  const ds = nanmedian(w.map((r) => Math.abs(r[L_SHO][0] - r[R_SHO][0]))) / (SHO_W * t);
  const dh = nanmedian(w.map((r) => Math.abs(r[L_HIP][0] - r[R_HIP][0]))) / (HIP_W * t);
  if (!Number.isFinite(ds) || !Number.isFinite(dh)) return null;
  return Math.min(MAX_YAW_DEG, degrees(mean([Math.asin(pyMin(1.0, ds)), Math.asin(pyMin(1.0, dh))])));
}

export function rackMask(k: K, bar: Pt[], fps: number): boolean[] {
  const t = torsoPx(k);
  const sho = mid(k, L_SHO, R_SHO);
  const ely = k.map((r) => nanmean([r[L_ELB][1], r[R_ELB][1]]));
  const elx = k.map((r) => nanmean([r[L_ELB][0], r[R_ELB][0]]));
  const off = offSidePose(k);
  const fwd = facing(k);
  const shoX = xs(sho);
  const m = k.map((_, i) => {
    const atSho = Math.abs(bar[i][1] - sho[i][1]) < 0.35 * t;
    const above = ely[i] > bar[i][1] + 0.05 * t;
    const forward = off === null || off < 60 ? fwd * (elx[i] - shoX[i]) > 0.1 * t : true;
    return atSho && above && forward;
  });
  // np.convolve(m, ones(5) / 5, mode="same") >= 0.6
  return m.map((_, i) => {
    let s = 0;
    for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < m.length && m[j]) s += 0.2;
    return s >= 0.6;
  });
}

export function sustainedBelow(x: number[], thr: number, start: number, stop: number): number | null {
  for (let f = start; f <= stop; f++) if (x.slice(f, stop + 1).every((v) => v < thr)) return f;
  return null;
}

export type PullDetail = { frame: number; from_frame: number; to_frame: number; kp: string; hip_max?: number; knee_max?: number };

export function cleanPullValues(
  ksm: K,
  hipAng: number[],
  kneeAng: number[],
  lo: number,
  peak: number,
  fps: number,
  elbowDeg = 160.0,
): [{ early_arm_bend: number; incomplete_extension: number }, { early_arm_bend: PullDetail; incomplete_extension: PullDetail }] {
  const [l, r] = elbows(ksm);
  const el = fmax(l, r);
  const b = sustainedBelow(el, elbowDeg, lo, peak);
  const brk = b === null ? peak : b;
  const hipWin = hipAng.slice(lo, peak + 1);
  const hipFull = lo + nanargmax(hipWin);
  const hipMax = nanmax(hipWin);
  return [
    { early_arm_bend: (hipFull - brk) / fps, incomplete_extension: 170.0 - hipMax },
    {
      early_arm_bend: { frame: brk, from_frame: brk, to_frame: hipFull, kp: 'elbow' },
      incomplete_extension: {
        frame: hipFull,
        from_frame: hipFull,
        to_frame: hipFull,
        kp: 'hip',
        hip_max: hipMax,
        knee_max: nanmax(kneeAng.slice(lo, peak + 1)),
      },
    },
  ];
}
