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

// speed.py
const PLAUSIBLE: [number, number] = [0.5, 4.0];

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

export type SpeedRow = { id: string; label: string; value: number; unit: 'm/s'; frame: number; status: string; note: string };

export function speedMeasurement(barSpeed: [number, number] | null, scaleMethod: string, secondExt: number): SpeedRow {
  const hidden = (note: string): SpeedRow => ({ id: 'bar_speed', label: 'Peak bar speed', value: 0, unit: 'm/s', frame: secondExt, status: 'not_seen', note });
  if (barSpeed === null || scaleMethod.startsWith('near plate only') || scaleMethod.startsWith('body segments'))
    return hidden('scale too uncertain to time the bar');
  if (!(PLAUSIBLE[0] <= barSpeed[0] && barSpeed[0] <= PLAUSIBLE[1])) return hidden('bar track too unsteady to time');
  return { id: 'bar_speed', label: 'Peak bar speed', value: pyRound(barSpeed[0], 2), unit: 'm/s', frame: barSpeed[1], status: 'normal', note: 'peak upward speed in the pull' };
}
