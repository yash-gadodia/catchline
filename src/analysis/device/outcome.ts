// cv/catchline_cv/outcome.py and speed.py
import { finite, gradient, int, pyFixed, pyRound } from './num';

const BAIL_BEHIND = 'To bail behind safely: keep the arms locked and jump forward.';

export function classify(made: boolean, barVsMidfoot: number, barVx: number): string {
  if (made) return 'make';
  if (barVsMidfoot < 0 && barVx <= 0) return 'missed_behind';
  if (barVsMidfoot >= 0) return 'missed_forward';
  return 'unknown';
}

const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;

export function behindCause(
  fwdExcursion: number | null,
  pvxMinus: number | null,
  hipPastAnkle: number | null,
  trunkBack: number | null,
  footDx: number | null,
  trunkFwdCatch: number | null,
  maxHip: number | null,
  barBehind: number | null,
): [string | null, number] {
  const sev: [string, number][] = [];
  if (has(fwdExcursion) && has(pvxMinus) && fwdExcursion > 10 && pvxMinus < -55)
    sev.push(['loop', Math.min(fwdExcursion / 10, pvxMinus / -55)]);
  const hips = [has(hipPastAnkle) ? hipPastAnkle / 6 : null, has(trunkBack) ? trunkBack / 10 : null, has(footDx) ? -footDx / 5 : null].filter(
    (x): x is number => x !== null && x > 1,
  );
  if (hips.length) sev.push(['hips', Math.max(...hips)]);
  if (has(trunkFwdCatch) && has(maxHip) && trunkFwdCatch > 20 && maxHip < 170)
    sev.push(['dive', Math.min(trunkFwdCatch / 20, 1 + (170 - maxHip) / 170)]);
  if (sev.length) return sev[0];
  if (has(barBehind) && barBehind > 8) return ['position', barBehind / 8];
  return [null, 0.0];
}

export const CAUSE_CUE: Record<string, string> = { loop: 'bar_forward_off_hips', hips: 'incomplete_extension', dive: 'incomplete_extension' };

export function behindCopy(barBehindMidfoot: number, cause: string | null, m: { fwd: number; hips_text: string; trunk: number; behind: number }): string {
  const head = `Missed behind. The bar finished ${pyFixed(Math.abs(barBehindMidfoot), 0)} cm behind mid-foot.`;
  const body: Record<string, string> = {
    loop: `Earliest thing I can see: the bar swung ${pyFixed(m.fwd, 0)} cm forward off your hips and came back fast, so it looped behind you.`,
    hips: `Earliest thing I can see: ${m.hips_text}, so you went back under it.`,
    dive: `Earliest thing I can see: your pull stopped short and your chest dropped ${pyFixed(m.trunk, 0)} deg forward to get under it.`,
    position: `The bar sat ${pyFixed(m.behind, 0)} cm behind your shoulder line at the top; I can't see why from this clip.`,
    none: "I can't tell why from this clip; film one more rep and I'll compare.",
  };
  return `${head} ${body[cause ?? 'none']} ${BAIL_BEHIND}`;
}

// The first frame from `from` (before `to`) where the hands, so the bar, sat below `lowY` (image y, down positive) for
// `need` frames: let go of, not held overhead or in the rack.
export function droppedAt(barY: number[], lowY: number[], from: number, to: number, need: number): number | null {
  for (let f = Math.max(0, from); f < Math.min(to, barY.length - need + 1); f++) {
    let held = 0;
    while (held < need && barY[f + held] > lowY[f + held]) held++;
    if (held === need) return f;
  }
  return null;
}

// speed.py
const PLAUSIBLE: [number, number] = [0.5, 4.0];
const AVG_PLAUSIBLE: [number, number] = [0.3, 3.0];
const PCT_PLAUSIBLE: [number, number] = [40, 110];

export function peakUpSpeed(y: number[], fps: number, pxPerCm: number, start: number, end: number): [number, number] | null {
  const lo = Math.max(0, int(start));
  const hi = Math.min(y.length - 1, int(end));
  if (hi - lo < 2 || !pxPerCm || !fps) return null;
  const v = gradient(y)
    .slice(lo, hi + 1)
    .map((g) => (((-g * fps) / pxPerCm) / 100.0));
  if (!v.some(finite)) return null;
  let i = -1;
  v.forEach((x, j) => {
    if (finite(x) && (i < 0 || x > v[i])) i = j;
  });
  return [v[i], lo + i];
}

export function pullSpeed(y: number[], fps: number, pxPerCm: number, start: number, end: number): number | null {
  const lo = Math.max(0, int(start));
  const hi = Math.min(y.length - 1, int(end));
  if (hi - lo < 2 || !pxPerCm || !fps) return null;
  const v = (y[lo] - y[hi]) / pxPerCm / 100.0 / ((hi - lo) / fps);
  return finite(v) ? v : null;
}

export type SpeedRow = { id: string; label: string; value: number; unit: 'm/s' | '%'; frame: number; status: string; note: string };
export type Speeds = { peak: [number, number] | null; avg: number | null; peakPct: number | null };

// Shown only on a scale the cue trusts (scaleOk, as cueConfidence reads it) and a plausible reading; otherwise not_seen.
export function speedMeasurements(s: Speeds, scaleOk: boolean, frames: { secondExt: number; peak: number }): SpeedRow[] {
  const row = (id: string, label: string, unit: 'm/s' | '%', v: number | null, ok: [number, number], frame: number, note: string, nd: number): SpeedRow => {
    if (v === null || !scaleOk) return { id, label, value: 0, unit, frame, status: 'not_seen', note: 'scale too uncertain to time the bar' };
    if (!(ok[0] <= v && v <= ok[1])) return { id, label, value: 0, unit, frame, status: 'not_seen', note: 'bar track too unsteady to time' };
    return { id, label, value: pyRound(v, nd), unit, frame, status: 'normal', note };
  };
  return [
    row('bar_speed', 'Peak bar speed', 'm/s', s.peak ? s.peak[0] : null, PLAUSIBLE, s.peak ? s.peak[1] : frames.secondExt, 'peak upward speed in the second pull', 2),
    row('bar_speed_avg', 'Average pull speed', 'm/s', s.avg, AVG_PLAUSIBLE, frames.secondExt, 'lift-off to full extension', 2),
    row('bar_peak_pct', 'Bar peak, % of height', '%', s.peakPct, PCT_PLAUSIBLE, frames.peak, "bar's highest point vs your standing height", 0),
  ];
}
