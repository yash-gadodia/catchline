// cv/catchline_cv/gym.py (hanging movements) and scipy.signal.find_peaks with prominence and distance.
import { sustainedBelow } from './body';
import { PhaseOut } from './phases';
import { argmax, argmin, gradient, where } from './num';

export const KIP_PHASES = ['arch', 'hollow', 'hip_drive', 'recovery'];

// scipy.signal.find_peaks(x, prominence=pmin, distance=d)
export function findPeaks(x: number[], prominence: number, distance: number): number[] {
  const peaks: number[] = [];
  let i = 1;
  const iMax = x.length - 1;
  while (i < iMax) {
    if (x[i - 1] < x[i]) {
      let ahead = i + 1;
      while (ahead < iMax && x[ahead] === x[i]) ahead++;
      if (x[ahead] < x[i]) {
        peaks.push(Math.floor((i + ahead - 1) / 2));
        i = ahead;
      }
    }
    i++;
  }
  // distance: highest peaks first, drop the ones too close to a kept one
  const d = Math.ceil(distance);
  const keep = peaks.map(() => true);
  const order = peaks.map((_, j) => j).sort((a, b) => x[peaks[a]] - x[peaks[b]] || a - b);
  for (let r = order.length - 1; r >= 0; r--) {
    const j = order[r];
    if (!keep[j]) continue;
    for (let k = j - 1; k >= 0 && peaks[j] - peaks[k] < d; k--) keep[k] = false;
    for (let k = j + 1; k < peaks.length && peaks[k] - peaks[j] < d; k++) keep[k] = false;
  }
  const kept = peaks.filter((_, j) => keep[j]);
  return kept.filter((p) => {
    let leftMin = x[p];
    for (let q = p; q >= 0 && x[q] <= x[p]; q--) if (x[q] < leftMin) leftMin = x[q];
    let rightMin = x[p];
    for (let q = p; q <= iMax && x[q] <= x[p]; q++) if (x[q] < rightMin) rightMin = x[q];
    return x[p] - Math.max(leftMin, rightMin) >= prominence;
  });
}

export type Cycle = [number, number, number];

export function cycleTops(h: number[], scale: number, fps: number, prominence = 0.4, minGapS = 0.6): Cycle[] {
  const tops = findPeaks(h, prominence * scale, Math.max(1, Math.trunc(minGapS * fps)));
  return tops.map((t, i) => {
    const lo = i ? tops[i - 1] : 0;
    const hi = i + 1 < tops.length ? tops[i + 1] : h.length - 1;
    const a = lo + argmin(h.slice(lo, t + 1));
    const b = t + argmin(h.slice(t, hi + 1));
    return [a, t, b];
  });
}

export function mergeCycles(cycles: Cycle[], h: number[], rel: number[], hangLevel: number): Cycle[] {
  const out: Cycle[] = [];
  for (const c of cycles) {
    const last = out[out.length - 1];
    if (last && rel[last[2]] > hangLevel && c[0] <= last[2] + 1) {
      const t = h[c[1]] >= h[last[1]] ? c[1] : last[1];
      out[out.length - 1] = [last[0], t, c[2]];
    } else out.push(c);
  }
  return out;
}

export type KipEvents = { arch_start: number; hollow_start: number; hip_tight: number; hip_open: number; elbow_break: number; top: number };

export function kipEvents(legsFwd: number[], hipAng: number[], elbow: number[], a: number, t: number): KipEvents {
  let hollowStart: number | null = null;
  for (let f = t; f > a; f--)
    if (legsFwd[f] > 0 && legsFwd[f - 1] <= 0) {
      hollowStart = f;
      break;
    }
  const hs = hollowStart ?? a;
  let archStart = hs;
  while (archStart > a && legsFwd[archStart - 1] <= 0) archStart--;
  const tight = hs + argmin(hipAng.slice(hs, t + 1));
  const v = gradient(hipAng);
  const hipOpen = t > tight ? tight + argmax(v.slice(tight, t + 1)) : tight;
  const brk = sustainedBelow(elbow, 160.0, archStart, t);
  return { arch_start: archStart, hollow_start: hs, hip_tight: tight, hip_open: hipOpen, elbow_break: brk !== null ? brk : t, top: t };
}

export function pushAway(shoXFwd: number[], t: number, fps: number, windowS = 0.4): number {
  const w = shoXFwd.slice(t, Math.min(shoXFwd.length, t + Math.trunc(windowS * fps) + 1));
  if (!w.length) return 0.0;
  let m = -Infinity;
  for (const v of w) {
    const d = shoXFwd[t] - v;
    if (Number.isNaN(d)) return NaN;
    if (d > m) m = d;
  }
  return m;
}

export function kipPhases(ev: KipEvents, end: number): PhaseOut[] {
  const b = [ev.arch_start, ev.hollow_start, ev.hip_open, ev.top, end];
  for (let i = 1; i < b.length; i++) b[i] = Math.max(b[i], b[i - 1] + 1);
  const spans: [number, number][] = [
    [b[0], b[1] - 1],
    [b[1], b[2] - 1],
    [b[2], b[3]],
    [b[3] + 1, b[4]],
  ];
  return KIP_PHASES.map((name, i) => ({ name, startFrame: spans[i][0], endFrame: Math.max(spans[i][0], spans[i][1]) }));
}

export type BmuEvents = KipEvents & { cross: number | null; support: number | null; lockout: number | null };

export function bmuEvents(kip: KipEvents, elbowHL: number[], elbowHR: number[], shoH: number[], elbow: number[], barH: number, scale: number, end: number): BmuEvents {
  const t0 = kip.hip_open;
  const el = elbowHL.map((v, i) => (Number.isNaN(v) ? elbowHR[i] : Number.isNaN(elbowHR[i]) ? v : Math.max(v, elbowHR[i])));
  const over = where(el.slice(t0, end + 1).map((v) => v > barH));
  const cross = over.length ? t0 + over[0] : null;
  const start = cross !== null ? cross : t0;
  const sup = where(shoH.slice(start, end + 1).map((v) => v > barH + 0.1 * scale));
  const support = sup.length ? start + sup[0] : null;
  let lock: number | null = null;
  if (support !== null) {
    const lk = where(elbow.slice(support, end + 1).map((v) => v >= 160));
    lock = lk.length ? support + lk[0] : null;
  }
  return { ...kip, cross, support, lockout: lock };
}

export function bmuPhases(ev: BmuEvents, end: number): PhaseOut[] {
  const marks = [ev.arch_start, ev.hollow_start, ev.hip_open];
  const names = ['arch', 'hollow', 'hip_drive'];
  for (const [n, key] of [
    ['transition', 'cross'],
    ['support', 'support'],
    ['lockout', 'lockout'],
  ] as const) {
    const v = ev[key];
    if (v !== null) {
      marks.push(v);
      names.push(n);
    }
  }
  marks.push(end);
  for (let i = 1; i < marks.length; i++) marks[i] = Math.max(marks[i], marks[i - 1] + 1);
  return names.map((name, i) => ({
    name,
    startFrame: marks[i],
    endFrame: Math.max(marks[i], marks[i + 1] - (i + 1 < names.length ? 1 : 0)),
  }));
}

export function shouldersCutOff(shoYs: number[], height: number, edge = 0.03): boolean {
  let m = Infinity;
  for (const v of shoYs) if (!Number.isNaN(v) && v < m) m = v;
  return m < edge * height;
}
