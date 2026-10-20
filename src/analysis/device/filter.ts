// geometry.lowpass: scipy's butter(2) + filtfilt (odd padding of 3 x taps, lfilter_zi start), NaNs interpolated first.

import { interp } from './num';

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
// numpy's complex divide (Smith's method)
function cdiv(a: C, b: C): C {
  if (Math.abs(b[0]) >= Math.abs(b[1])) {
    const rat = b[1] / b[0];
    const scl = 1.0 / (b[0] + b[1] * rat);
    return [(a[0] + a[1] * rat) * scl, (a[1] - a[0] * rat) * scl];
  }
  const rat = b[0] / b[1];
  const scl = 1.0 / (b[1] + b[0] * rat);
  return [(a[0] * rat + a[1]) * scl, (a[1] * rat - a[0]) * scl];
}

// scipy.signal.butter(2, wn): analog prototype, lp2lp, bilinear (fs = 2), zpk2tf
export function butter2(wn: number): { b: number[]; a: number[] } {
  const fs = 2.0;
  const warped = 2 * fs * Math.tan((Math.PI * wn) / fs);
  const poles: C[] = [-1, 1].map((m) => {
    const t = (Math.PI * m) / 4;
    return [-Math.cos(t), -Math.sin(t)];
  });
  const p = poles.map((q): C => [q[0] * warped, q[1] * warped]);
  const k = warped ** 2;
  const fs2 = 2.0 * fs;
  const pz = p.map((q) => cdiv([fs2 + q[0], q[1]], [fs2 - q[0], -q[1]]));
  const den = cmul([fs2 - p[0][0], -p[0][1]], [fs2 - p[1][0], -p[1][1]]);
  const kz = k * cdiv([1, 0], den)[0];
  const b = [kz * 1, kz * 2, kz * 1];
  const a = [1, -(pz[1][0] + pz[0][0]), cmul(pz[0], pz[1])[0]];
  return { b, a };
}

function lfilter(b: number[], a: number[], x: number[], zi: number[]): number[] {
  const z = [...zi];
  const y = new Array<number>(x.length);
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = z[0] + b[0] * xn;
    z[0] = z[1] + xn * b[1] - yn * a[1];
    z[1] = xn * b[2] - yn * a[2];
    y[i] = yn;
  }
  return y;
}

// scipy.signal.lfilter_zi for a second-order filter: solve (I - companion(a).T) zi = b[1:] - a[1:] b[0]
function lfilterZi(b: number[], a: number[]): number[] {
  const m = [
    [1 + a[1], -1],
    [a[2], 1],
  ];
  const r = [b[1] - a[1] * b[0], b[2] - a[2] * b[0]];
  if (Math.abs(m[1][0]) > Math.abs(m[0][0])) {
    [m[0], m[1]] = [m[1], m[0]];
    [r[0], r[1]] = [r[1], r[0]];
  }
  const l = m[1][0] / m[0][0];
  const u = m[1][1] - l * m[0][1];
  const z1 = (r[1] - l * r[0]) / u;
  const z0 = (r[0] - m[0][1] * z1) / m[0][0];
  return [z0, z1];
}

export function filtfilt(b: number[], a: number[], x: number[]): number[] {
  const edge = 3 * Math.max(a.length, b.length);
  if (x.length <= edge) throw new Error(`The length of the input vector x must be greater than padlen, which is ${edge}.`);
  const n = x.length;
  const left = [];
  for (let i = edge; i > 0; i--) left.push(2 * x[0] - x[i]);
  const right = [];
  for (let i = n - 2; i > n - 2 - edge; i--) right.push(2 * x[n - 1] - x[i]);
  const ext = [...left, ...x, ...right];
  const zi = lfilterZi(b, a);
  let y = lfilter(b, a, ext, zi.map((v) => v * ext[0]));
  const y0 = y[y.length - 1];
  y = lfilter(b, a, y.reverse(), zi.map((v) => v * y0)).reverse();
  return y.slice(edge, y.length - edge);
}

export function fillNans(x: number[]): number[] {
  const idx: number[] = [];
  const val: number[] = [];
  x.forEach((v, i) => {
    if (Number.isFinite(v)) {
      idx.push(i);
      val.push(v);
    }
  });
  if (!idx.length) return [...x];
  return x.map((v, i) => (Number.isFinite(v) ? v : interp(i, idx, val)));
}

const cache = new Map<number, { b: number[]; a: number[] }>();

export function lowpass(x: number[], fps: number, cutoff = 6.0): number[] {
  const f = fillNans(x);
  if (f.length < 16 || !f.every(Number.isFinite)) return f;
  const wn = cutoff / (fps / 2);
  let c = cache.get(wn);
  if (!c) {
    c = butter2(wn);
    cache.set(wn, c);
  }
  return filtfilt(c.b, c.a, f);
}

// lowpass along axis 0 of points (n, 2)
export function lowpassPts(p: [number, number][], fps: number, cutoff = 6.0): [number, number][] {
  const xs = lowpass(
    p.map((q) => q[0]),
    fps,
    cutoff,
  );
  const ys = lowpass(
    p.map((q) => q[1]),
    fps,
    cutoff,
  );
  return xs.map((v, i) => [v, ys[i]]);
}
