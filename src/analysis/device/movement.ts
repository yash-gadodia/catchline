// cv/catchline_cv/movement.py (+ the Halpe26 indices of pose.py and keypoint helpers)
import { lowpass, lowpassPts } from './filter';
import { finitePt, midPt } from './geometry';
import { Pt, nanmedian, nanpercentile, sum, where } from './num';

export const L_SHO = 5, R_SHO = 6, L_ELB = 7, R_ELB = 8, L_WRI = 9, R_WRI = 10;
export const L_HIP = 11, R_HIP = 12, L_KNEE = 13, R_KNEE = 14, L_ANK = 15, R_ANK = 16;
export const L_BIGTOE = 20, R_BIGTOE = 21, L_HEEL = 24, R_HEEL = 25;
export const JOINTS = 26;

// (n, 26) keypoints, image px, NaN where missing
export type K = Pt[][];

export const col = (k: K, j: number): Pt[] => k.map((r) => r[j]);
export const mid = (k: K, a: number, b: number): Pt[] => k.map((r) => midPt(r[a], r[b]));
export const ys = (p: Pt[]) => p.map((q) => q[1]);
export const xs = (p: Pt[]) => p.map((q) => q[0]);

// lowpass every joint coordinate along time (pipeline: lowpass(kr.reshape(n, -1)))
export function lowpassK(k: K, fps: number, cutoff = 6.0): K {
  const cols = Array.from({ length: JOINTS }, (_, j) => lowpassPts(col(k, j), fps, cutoff));
  return k.map((_, f) => cols.map((c) => c[f]));
}

export const FAMILY: Record<string, string> = {
  snatch: 'barbell',
  clean: 'barbell',
  jerk: 'barbell',
  kipping_pull_up: 'hanging',
  bar_muscle_up: 'hanging',
  kipping_hspu: 'inverted',
};
const NAMES: Record<string, string> = {
  snatch: 'snatch',
  clean: 'clean',
  jerk: 'jerk',
  kipping_pull_up: 'kipping pull-up',
  bar_muscle_up: 'bar muscle-up',
  kipping_hspu: 'kipping handstand push-up',
  barbell: 'a barbell lift',
  hanging: 'a bar movement (hanging)',
  inverted: 'a handstand movement',
};

const segLen = (a: Pt, b: Pt) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);

export function torsoPx(k: K): number {
  const s = mid(k, L_SHO, R_SHO);
  const h = mid(k, L_HIP, R_HIP);
  return nanmedian(s.map((p, i) => segLen(p, h[i])));
}

export function headY(k: K, torso?: number): number[] {
  const t = torso === undefined || torso === 0 ? torsoPx(k) : torso;
  const sho = mid(k, L_SHO, R_SHO);
  const hip = mid(k, L_HIP, R_HIP);
  return sho.map((s, i) => {
    const dx = s[0] - hip[i][0];
    const dy = s[1] - hip[i][1];
    const n = Math.sqrt(dx * dx + dy * dy);
    return s[1] + (0.2 * t * dy) / (n > 0 ? n : NaN);
  });
}

export type Signals = {
  inverted_s: number;
  overhead_s: number;
  hanging: boolean;
  floor_lift: boolean;
  at_shoulders_s: number;
  torso_px: number;
  seconds: number;
};

const torsoOk = (r: Pt[]) => [L_SHO, R_SHO, L_HIP, R_HIP].every((j) => finitePt(r[j]));

export function signals(k0: K, fps: number): Signals | null {
  const k = k0.filter(torsoOk);
  if (k.length < fps) return null;
  const t = torsoPx(k);
  const up = (y: number[]) => lowpass(y, fps).map((v) => -v);
  const sho = up(ys(mid(k, L_SHO, R_SHO)));
  const hip = up(ys(mid(k, L_HIP, R_HIP)));
  const knee = up(ys(mid(k, L_KNEE, R_KNEE)));
  const ank = up(ys(mid(k, L_ANK, R_ANK)));
  const wri = up(ys(mid(k, L_WRI, R_WRI)));
  const head = up(headY(k, t));
  const wriXy = mid(k, L_WRI, R_WRI);
  const ankXy = mid(k, L_ANK, R_ANK);
  const inverted = ank.map((a, i) => a > sho[i] + 0.3 * t);
  const overhead = wri.map((w, i) => w > head[i] && !inverted[i]);
  let hang = false;
  const on = where(wri.map((w, i) => w > hip[i] + 0.3 * t && !inverted[i]));
  if (on.length >= fps) {
    const spread = (p: Pt[]) => {
      const sel = on.map((i) => p[i]);
      const m: Pt = [nanmedian(sel.map((q) => q[0])), nanmedian(sel.map((q) => q[1]))];
      return 2 * nanpercentile(sel.map((q) => segLen(q, m)), 90);
    };
    const hand = spread(wriXy);
    const foot = spread(ankXy);
    hang = foot > 0.5 * t && foot > 2.0 * hand;
  }
  const over = where(overhead);
  if (!hang && over.length >= 0.75 * k.length) {
    const smooth = (p: Pt[]) => {
      const sx = lowpass(p.map((q) => q[0]), fps);
      const sy = lowpass(p.map((q) => q[1]), fps);
      return over.map((i): Pt => [sx[i], sy[i]]);
    };
    const contiguous = over.slice(1).map((v, i) => v - over[i] === 1);
    const step = (p: Pt[]) => {
      const d = p.slice(1).map((q, i) => Math.min(segLen(q, p[i]), 0.15 * t));
      return sum(d.filter((_, i) => contiguous[i]));
    };
    const hands = smooth(wriXy);
    const shoulders = smooth(mid(k, L_SHO, R_SHO));
    hang = step(hands.map((h, i): Pt => [h[0] - shoulders[i][0], h[1] - shoulders[i][1]])) > 1.2 * step(hands);
  }
  const floorLift = wri.some((w, i) => w < knee[i] && !inverted[i]) && wri.some((w, i) => w > hip[i] + 0.3 * t);
  const atSho = wri.map((w, i) => Math.abs(w - sho[i]) < 0.35 * t && !inverted[i]);
  const count = (m: boolean[]) => m.filter(Boolean).length;
  return {
    inverted_s: count(inverted) / fps,
    overhead_s: count(overhead) / fps,
    hanging: hang,
    floor_lift: floorLift,
    at_shoulders_s: count(atSho) / fps,
    torso_px: t,
    seconds: k.length / fps,
  };
}

export function family(sig: Signals | null): string | null {
  if (sig === null) return null;
  if (sig.inverted_s >= Math.max(1.0, 0.1 * sig.seconds)) return 'inverted';
  if (sig.hanging) return 'hanging';
  if (sig.floor_lift || sig.at_shoulders_s >= 0.5) return 'barbell';
  return null;
}

export function check(movement: string, sig: Signals | null): [boolean, string | null] {
  if (!(movement in FAMILY)) return [false, `${movement.replace(/_/g, ' ')} analysis is not available.`];
  if (sig === null) return [false, 'Could not find a person in this clip.'];
  const fam = family(sig);
  const want = FAMILY[movement];
  if (fam !== null && fam !== want)
    return [false, `This clip looks like ${NAMES[fam]}, not a ${NAMES[movement]}. Pick the movement you filmed and try again.`];
  return [true, null];
}
