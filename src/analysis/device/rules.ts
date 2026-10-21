// TS port of cv/catchline_cv/rules.py (fault rules over measured values), plus pipeline.cue_confidence.
// The data comes from cv/catchline_cv/rules.json, which rules.py loads too; rules.test.ts holds the two to
// rules-parity.json (written by cv/scripts/rules_parity_fixture.py). Not wired into the live flow yet.
import data from '../../../cv/catchline_cv/rules.json';

export type Rule = { threshold: number; unit: string; order: number; horizontal: boolean; below?: boolean };
export type Confidence = 'clear' | 'worth_checking' | 'low';
export type Values = Record<string, number | null | undefined>;
export type Detail = Record<string, number | string | null | undefined>;
export type Rep = { values: Values; detail: Record<string, Detail | null | undefined> };
export type Note = { faultId: string; text: string; why: string; severity: number; reps: number };
export type Alternate = { text: string; source: string };

type RulesData = {
  RULES: Record<string, Rule>;
  FAULTS: Record<string, string[]>;
  CAUSAL: string[];
  UNCALIBRATED_SNATCH: string[];
  CUES: Record<string, string>;
  WHY: Record<string, string>;
  GATES: string[][];
  PRESENT: number;
  ALTERNATES: Record<string, Alternate[]>;
};
const DATA: RulesData = data;

export const RULES = DATA.RULES;
export const FAULTS = DATA.FAULTS;
export const CAUSAL = new Set(DATA.CAUSAL);
export const UNCALIBRATED_SNATCH = new Set(DATA.UNCALIBRATED_SNATCH);
export const CUES = DATA.CUES;
export const WHY = DATA.WHY;
export const GATES: [string, string][] = DATA.GATES.map(([c, e]) => [c, e]);
export const PRESENT = DATA.PRESENT;
export const ALTERNATES = DATA.ALTERNATES;
// the camera angle off side-on reads within 10 deg of the labelled angle (cv/tests/test_camera_angle.py)
export const ANGLE_ERR_DEG = 10.0;

// Python's round(): half to even on the exact double. toFixed rounds the exact value half away from zero, and a
// double sits exactly on a tie only when x * 2^(nd+1) is an odd integer, so only those need stepping back.
export function pyRound(x: number, nd = 0): number {
  const a = Math.abs(x);
  let n = Number(a.toFixed(nd).replace('.', ''));
  const t = a * 2 ** (nd + 1);
  if (Number.isInteger(t) && t % 2 === 1 && n % 2 === 1) n -= 1;
  const r = n / 10 ** nd;
  return x < 0 ? -r : r;
}

const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;
const order = (f: string) => RULES[f].order;

export function gate(firedIds: Set<string> | string[]): Set<string> {
  const ids = new Set(firedIds);
  return new Set([...ids].filter((f) => !GATES.some(([c, e]) => e === f && ids.has(c))));
}

export function fmt(value: number, unit: string): string {
  if (unit === 's') return `${pyRound(value * 100) * 10} ms`;
  if (unit === 'deg') return `${2 * pyRound(value / 2)} deg`;
  return `${pyRound(value)} cm`;
}

export function severity(fid: string, v: number): number {
  const thr = RULES[fid].threshold;
  return RULES[fid].below ? 1.0 + (thr - v) / thr : v / thr;
}

// rules.on_screen: off side-on (20-70 deg) a forward distance is judged corrected only for the angle less its error, so a
// fault that fires on it is real; past 70 deg no forward distance is judged. Shown values stay fully corrected.
export function onScreen(values: Values, off: number | null | undefined): Values {
  if (!has(off) || off <= 20) return values;
  const out: Values = { ...values };
  const k = Math.cos(off * (Math.PI / 180)) / Math.cos((off - ANGLE_ERR_DEG) * (Math.PI / 180));
  for (const [fid, v] of Object.entries(values)) {
    const r = RULES[fid];
    if (has(v) && r && r.horizontal && r.unit === 'cm' && !r.below) out[fid] = off <= 70 ? v * k : null;
  }
  return out;
}

export function confirmedOffSide(fid: string, sev: number, off: number | null | undefined): boolean {
  const r = RULES[fid];
  return has(off) && 20 < off && off <= 70 && r.horizontal && r.unit === 'cm' && !r.below && sev >= 1.0;
}

export function fired(values: Values): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [fid, v] of Object.entries(values)) {
    if (has(v) && severity(fid, v) >= 1.0) out[fid] = severity(fid, v);
  }
  for (const [c, e] of GATES) {
    const cv = values[c];
    if (e in out && !(c in out) && has(cv) && severity(c, cv) >= PRESENT) out[c] = out[e];
  }
  return out;
}

// max() by key, first maximal element wins (Python's max keeps the first on a tie)
function maxBy<T>(xs: T[], key: (x: T) => [number, number]): T {
  let best = xs[0];
  let bk = key(best);
  for (const x of xs.slice(1)) {
    const k = key(x);
    if (k[0] > bk[0] || (k[0] === bk[0] && k[1] > bk[1])) {
      best = x;
      bk = k;
    }
  }
  return best;
}

function minBy<T>(xs: T[], key: (x: T) => number): T {
  return xs.reduce((best, x) => (key(x) < key(best) ? x : best));
}

export function chooseCue(values: Values): string | null {
  const f = fired(values);
  const keep = [...gate(Object.keys(f))];
  if (!keep.length) return null;
  return maxBy(keep, (k) => [pyRound(f[k], 2), -order(k)]);
}

export function chooseSetCue(movement: string, repsValues: Values[]): [string | null, number] {
  const all: Record<string, number[]> = {};
  for (const vals of repsValues) {
    for (const [fid, sev] of Object.entries(fired(vals))) (all[fid] ??= []).push(sev);
  }
  if (!Object.keys(all).length) return [null, 0];
  const kept = gate(Object.keys(all));
  const seen = Object.fromEntries(Object.entries(all).filter(([f]) => kept.has(f)));
  const ids = Object.keys(seen);
  let fid: string;
  if (CAUSAL.has(movement)) {
    const repeat = ids.filter((f) => seen[f].length >= 2);
    fid = minBy(repeat.length ? repeat : ids, order);
  } else {
    fid = maxBy(ids, (f) => [pyRound(Math.max(...seen[f]), 2), -order(f)]);
  }
  return [fid, seen[fid].length];
}

export function notes(movement: string, reps: Rep[], cue: { faultId: string; text: string } | null, limit = 3): Note[] {
  if (cue === null) return [];
  const seen: Record<string, [number, number][]> = {};
  reps.forEach((r, i) => {
    for (const [fid, sev] of Object.entries(fired(r.values))) (seen[fid] ??= []).push([sev, i]);
  });
  // max of (severity, rep index) tuples: the most severe rep, ties to the later one
  const top = (f: string) => seen[f].reduce((b, x) => (x[0] > b[0] || (x[0] === b[0] && x[1] > b[1]) ? x : b));
  const keep = [...gate(Object.keys(seen))].filter((f) => f !== cue.faultId && CUES[f] !== cue.text);
  const cmp = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];
  if (CAUSAL.has(movement)) {
    keep.sort((a, b) => cmp([seen[a].length < 2 ? 1 : 0, order(a)], [seen[b].length < 2 ? 1 : 0, order(b)]));
  } else {
    keep.sort((a, b) => cmp([-pyRound(top(a)[0], 2), order(a)], [-pyRound(top(b)[0], 2), order(b)]));
  }
  return keep.slice(0, limit).map((fid) => {
    const [sev, i] = top(fid);
    const r = reps[i];
    return { faultId: fid, text: CUES[fid], why: whySentence(fid, r.values, r.detail[fid]),
      severity: pyRound(sev, 2), reps: seen[fid].length };
  });
}

export function confidence(faultId: string, sev: number, sideOnOffDeg: number | null | undefined): Confidence {
  if (!has(sideOnOffDeg) || sideOnOffDeg <= 20) return sev >= 1.5 ? 'clear' : 'worth_checking';
  if (RULES[faultId].horizontal) return 'low';
  return sideOnOffDeg <= 70 || sev >= 1.5 ? 'worth_checking' : 'low';
}

export function repConfidence(conf: Confidence, seen: number, total: number): Confidence {
  if (conf === 'clear' && (seen < 2 || seen < total)) return 'worth_checking';
  return conf;
}

// pipeline.cue_confidence: repetition, the uncalibrated snatch rules and a body-sized (no plate) scale cap the cue
export function cueConfidence(cueId: string, sev: number, off: number | null | undefined, seen: number, total: number,
  scaleOk: boolean): Confidence {
  let conf = repConfidence(confidence(cueId, sev, off), seen, total);
  if (conf === 'low' && confirmedOffSide(cueId, sev, off)) conf = 'worth_checking';
  if (UNCALIBRATED_SNATCH.has(cueId) && conf === 'clear') conf = 'worth_checking';
  if (!scaleOk && RULES[cueId].unit !== 's') conf = conf !== 'low' && sev >= 1.5 ? 'worth_checking' : 'low';
  return conf;
}

export function whySentence(faultId: string, values: Values, detail?: Detail | null): string {
  const d = detail ?? {};
  const num = (k: string) => {
    const x = d[k];
    return typeof x === 'number' ? x : null;
  };
  const v = values[faultId] as number;
  const unit = RULES[faultId].unit;
  let m: string;
  if (faultId === 'hips_rise_early' && num('trunk_change') !== null) m = fmt(num('trunk_change') as number, 'deg');
  else if (faultId === 'incomplete_extension' && num('hip_max') !== null) m = fmt(180.0 - (num('hip_max') as number), 'deg');
  else if (faultId === 'press_out' && num('elbow_land') !== null) m = fmt(180.0 - (num('elbow_land') as number), 'deg');
  else if (faultId === 'chicken_wing' && num('gap_s') !== null) m = fmt(num('gap_s') as number, 's');
  else m = fmt(v, unit);
  const side = d.side ?? 'late';
  return WHY[faultId].replace(/\{m\}/g, m).replace(/\{side\}/g, String(side));
}

export function alternates(faultId: string): string[] {
  return (ALTERNATES[faultId] ?? []).map((a) => a.text);
}
