// numpy / Python numerics the measurement code relies on, with numpy's conventions: NaN propagates through max/min/
// argmax, the nan* variants skip it, sums are pairwise (numpy's order), percentiles interpolate linearly, and Python's
// round() and format() round the exact binary value half to even.

export type Pt = [number, number];
export type Affine = number[][];

const isNum = (v: number) => !Number.isNaN(v);
export const finite = (v: number) => Number.isFinite(v);

// numpy's pairwise summation (umath loops: 8 accumulators per 128-block, halves above that)
function pairwise(a: ArrayLike<number>, lo: number, n: number): number {
  if (n < 8) {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[lo + i];
    return s;
  }
  if (n <= 128) {
    const r = [a[lo], a[lo + 1], a[lo + 2], a[lo + 3], a[lo + 4], a[lo + 5], a[lo + 6], a[lo + 7]];
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += a[lo + i + j];
    let s = r[0] + r[1] + (r[2] + r[3]) + (r[4] + r[5] + (r[6] + r[7]));
    for (; i < n; i++) s += a[lo + i];
    return s;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwise(a, lo, n2) + pairwise(a, lo + n2, n - n2);
}

export const sum = (a: ArrayLike<number>) => pairwise(a, 0, a.length);
export const mean = (a: ArrayLike<number>) => sum(a) / a.length;

// np.nanmean: NaNs summed as zeros, divided by the count of the rest
export function nanmean(a: number[]): number {
  const c = a.filter(isNum).length;
  return c ? sum(a.map((v) => (isNum(v) ? v : 0))) / c : NaN;
}

export function max(a: number[]): number {
  let m = -Infinity;
  for (const v of a) {
    if (Number.isNaN(v)) return NaN;
    if (v > m) m = v;
  }
  return a.length ? m : NaN;
}

export function min(a: number[]): number {
  let m = Infinity;
  for (const v of a) {
    if (Number.isNaN(v)) return NaN;
    if (v < m) m = v;
  }
  return a.length ? m : NaN;
}

export const nanmax = (a: number[]) => max(a.filter(isNum));
export const nanmin = (a: number[]) => min(a.filter(isNum));

// first index of the max; a NaN wins (numpy)
export function argmax(a: number[]): number {
  let b = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isNaN(a[i])) return i;
    if (a[i] > a[b]) b = i;
  }
  return b;
}

export function argmin(a: number[]): number {
  let b = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isNaN(a[i])) return i;
    if (a[i] < a[b]) b = i;
  }
  return b;
}

export function nanargmax(a: number[]): number {
  let b = -1;
  for (let i = 0; i < a.length; i++) if (isNum(a[i]) && (b < 0 || a[i] > a[b])) b = i;
  if (b < 0) throw new Error('All-NaN slice encountered');
  return b;
}

export function nanargmin(a: number[]): number {
  let b = -1;
  for (let i = 0; i < a.length; i++) if (isNum(a[i]) && (b < 0 || a[i] < a[b])) b = i;
  if (b < 0) throw new Error('All-NaN slice encountered');
  return b;
}

// numpy linear percentile (numpy._lerp)
function lerp(a: number, b: number, t: number): number {
  const d = b - a;
  return t >= 0.5 ? b - d * (1 - t) : a + d * t;
}

export function percentile(a: number[], q: number): number {
  if (a.some((v) => Number.isNaN(v))) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const idx = (q / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, s.length - 1);
  return lerp(s[lo], s[hi], idx - lo);
}

export const nanpercentile = (a: number[], q: number) => {
  const v = a.filter(isNum);
  return v.length ? percentile(v, q) : NaN;
};

export function median(a: number[]): number {
  if (!a.length || a.some((v) => Number.isNaN(v))) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const nanmedian = (a: number[]) => median(a.filter(isNum));

// np.gradient, unit spacing, first-order edges
export function gradient(a: number[]): number[] {
  const n = a.length;
  if (n < 2) throw new Error('gradient needs 2 samples');
  const out = new Array<number>(n);
  out[0] = a[1] - a[0];
  out[n - 1] = a[n - 1] - a[n - 2];
  for (let i = 1; i < n - 1; i++) out[i] = (a[i + 1] - a[i - 1]) / 2;
  return out;
}

export function interp(x: number, xp: number[], fp: number[]): number {
  if (x <= xp[0]) return fp[0];
  if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
  let j = 0;
  while (xp[j + 1] <= x) j++;
  if (x === xp[j]) return fp[j];
  const slope = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
  return slope * (x - xp[j]) + fp[j];
}

export function corrcoef(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  const dx = x.map((v) => v - mx);
  const dy = y.map((v) => v - my);
  const f = x.length - 1;
  const dot = (a: number[], b: number[]) => sum(a.map((v, i) => v * b[i]));
  const cxx = dot(dx, dx) / f;
  const cyy = dot(dy, dy) / f;
  const cxy = dot(dx, dy) / f;
  const r = cxy / Math.sqrt(cxx) / Math.sqrt(cyy);
  return Math.min(1, Math.max(-1, r));
}

export const ptp = (a: number[]) => max(a) - min(a);
export const fmax = (a: number[], b: number[]) =>
  a.map((v, i) => (Number.isNaN(v) ? b[i] : Number.isNaN(b[i]) ? v : Math.max(v, b[i])));
export const fmin = (a: number[], b: number[]) =>
  a.map((v, i) => (Number.isNaN(v) ? b[i] : Number.isNaN(b[i]) ? v : Math.min(v, b[i])));

export const range = (a: number, b: number, step = 1) => {
  const out: number[] = [];
  for (let i = a; step > 0 ? i < b : i > b; i += step) out.push(i);
  return out;
};

// np.where(mask)[0]
export const where = (m: boolean[]) => m.flatMap((v, i) => (v ? [i] : []));

// Python slice a[lo:hi] (negative and out-of-range bounds clamp as Python does)
export function sl<T>(a: T[], lo?: number, hi?: number): T[] {
  const n = a.length;
  const fix = (v: number) => (v < 0 ? Math.max(0, n + v) : Math.min(v, n));
  return a.slice(lo === undefined ? 0 : fix(lo), hi === undefined ? n : fix(hi));
}

export const degrees = (r: number) => r * (180 / Math.PI);
export const radians = (d: number) => d * (Math.PI / 180);
export const clip = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
export const norm = (p: Pt) => Math.sqrt(p[0] * p[0] + p[1] * p[1]);
export const int = (v: number) => Math.trunc(v);

// Python's round(x, nd) / f"{x:.{nd}f}": the exact decimal value of the double, half to even
function exactDecimal(x: number): string {
  // toFixed(100) prints the double's exact binary value for |x| >= 2^-47 (enough for every measured value)
  return Math.abs(x).toFixed(100);
}

export function pyFixed(x: number, nd: number): string {
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan';
  const s = exactDecimal(x);
  const dot = s.indexOf('.');
  const keep = s.slice(0, dot + 1 + nd).replace('.', '');
  const rest = s.slice(dot + 1 + nd);
  const digits = keep.split('').map(Number);
  const first = Number(rest[0] ?? '0');
  const tail = rest.slice(1).replace(/0+$/, '');
  const up = first > 5 || (first === 5 && (tail.length > 0 || digits[digits.length - 1] % 2 === 1));
  if (up) {
    let i = digits.length - 1;
    while (i >= 0 && digits[i] === 9) digits[i--] = 0;
    if (i < 0) digits.unshift(1);
    else digits[i] += 1;
  }
  let str = digits.join('');
  const intLen = str.length - nd;
  str = nd > 0 ? `${str.slice(0, intLen)}.${str.slice(intLen)}` : str;
  str = str.replace(/^0+(?=\d)/, '');
  const neg = x < 0 || Object.is(x, -0);
  return neg ? `-${str}` : str;
}

export const pyRound = (x: number, nd: number): number => (Number.isFinite(x) ? Number(pyFixed(x, nd)) : x);
// round(x) with no digits: int, half to even
export const pyRoundInt = (x: number): number => Math.trunc(pyRound(x, 0));
// f"{x:+.nf}"
export const pyFixedSigned = (x: number, nd: number) => {
  const s = pyFixed(x, nd);
  return s.startsWith('-') ? s : `+${s}`;
};
