// cv/catchline_cv/phases.py
import { argmax, argmin, finite, gradient, int, max, min, nanmedian, nanmin, where } from './num';

export const SNATCH_PHASES = ['setup', 'first_pull', 'transition', 'second_pull', 'turnover', 'catch', 'recovery'];
export const JERK_PHASES = ['setup', 'drive', 'turnover', 'catch', 'recovery'];

export type PhaseOut = { name: string; startFrame: number; endFrame: number };
export type SnatchEvents = {
  liftoff: number;
  first_ext: number;
  rebend: number;
  second_ext: number;
  peak: number;
  caught: number;
  catch_bottom: number;
  recovered: number;
  hold_end: number;
  double_knee_bend: boolean;
  from_hang?: boolean;
};

export function segmentSnatch(
  barH: number[],
  knee: number[],
  fps: number,
  opts: { kneePass?: number | null; elbow?: number[]; catchMask?: boolean[]; liftoff?: number | null } = {},
  setupS = 1.0,
  minRebend = 3.0,
): [PhaseOut[], SnatchEvents] {
  const { kneePass = null, elbow, catchMask } = opts;
  const n = barH.length;
  const top = argmax(barH);
  const floor = min(barH.slice(0, top + 1));
  const rng = barH[top] - floor;
  const below = where(barH.slice(0, top + 1).map((v) => v <= floor + 0.03 * rng));
  let liftoff: number;
  if (opts.liftoff === undefined || opts.liftoff === null) {
    liftoff = below[below.length - 1];
    while (liftoff > 0 && barH[liftoff] - barH[liftoff - 1] > 0.01 * rng) liftoff -= 1;
  } else liftoff = opts.liftoff;
  const v = gradient(barH);
  let peak = top;
  let broke = false;
  for (let f = liftoff + 1; f < top; f++) {
    if (barH[f] > floor + 0.5 * rng && barH[f - 1] <= barH[f] && barH[f] > barH[f + 1]) {
      const later = barH.slice(f + 1);
      const higher = where(later.map((x) => x > barH[f]));
      const dip = higher.length ? later.slice(0, higher[0]) : later;
      if (dip.length && barH[f] - min(dip) >= 0.03 * rng) {
        peak = f;
        broke = true;
        break;
      }
    }
  }
  if (!broke) {
    const fast = liftoff + argmax(v.slice(liftoff, top + 1));
    const slow = where(v.slice(fast, top + 1).map((x) => x < 0.2 * v[fast]));
    if (slow.length) peak = fast + slow[0];
  }

  let fromHang = false;
  if (catchMask && catchMask.some(Boolean)) {
    const r0 = catchMask.indexOf(true);
    peak = argmax(barH.slice(0, r0 + 1));
    liftoff = Math.min(liftoff, peak);
    if (peak - liftoff > 2.0 * fps) {
      let f = peak;
      while (f > liftoff && barH[f - 1] < barH[f]) f -= 1;
      liftoff = f;
      fromHang = true;
    }
  }
  const s2 = liftoff + argmax(knee.slice(liftoff, peak + 1));
  const seg = knee.slice(liftoff, s2 + 1);
  let acc = -Infinity;
  const rebend = seg.map((x) => {
    acc = Number.isNaN(acc) || Number.isNaN(x) ? NaN : Math.max(acc, x);
    return acc - x;
  });
  let trans = liftoff + argmax(rebend);
  let k1: number;
  let doubleBend: boolean;
  if (max(rebend) >= minRebend && liftoff < trans && trans < s2) {
    k1 = liftoff + argmax(knee.slice(liftoff, trans + 1));
    doubleBend = true;
  } else {
    k1 = kneePass !== null && liftoff < kneePass && kneePass < s2 ? kneePass : liftoff + int(0.4 * (s2 - liftoff));
    trans = Math.floor((k1 + s2) / 2);
    doubleBend = false;
  }

  const window = Math.min(n, peak + int(1.0 * fps));
  let locked: number[];
  if (catchMask) locked = where(catchMask.slice(peak, window));
  else locked = elbow ? where(elbow.slice(peak, window).map((x) => x >= 150)) : [];
  let caught: number;
  if (locked.length) caught = peak + locked[0];
  else {
    const descent = v.slice(peak, window).map((x) => -x);
    const m = argmax(descent);
    const slow = where(descent.slice(m).map((x) => x < 0.25 * descent[m]));
    caught = peak + m + (slow.length ? slow[0] : descent.length - 1 - m);
  }
  const gone = where(barH.slice(caught).map((x) => x < floor + 0.35 * rng));
  const holdEnd = gone.length ? caught + gone[0] : n;
  const hold = barH.slice(caught, Math.max(caught + 1, Math.min(holdEnd, n)));
  const dipped = where(hold.map((x) => x < hold[0] - 0.03 * rng));
  let upAgain = where(hold.map((x) => x >= hold[0] + 0.5 * (max(hold) - hold[0])));
  const stoodFirst = max(hold) - hold[0] > 0.1 * rng && dipped.length > 0 && upAgain[0] < dipped[0];
  let stop: number;
  if (dipped.length && !stoodFirst) {
    upAgain = upAgain.filter((x) => x > dipped[0]);
    stop = upAgain.length ? upAgain[0] : int(4 * fps);
  } else stop = int(0.5 * fps);
  const bottom = caught + argmin(hold.slice(0, Math.max(1, stop)));
  const after = barH.slice(bottom, Math.max(bottom + 1, holdEnd));
  const stood = where(after.map((x) => x >= barH[bottom] + 0.9 * (max(after) - barH[bottom])));
  const recovered = stood.length && max(after) - barH[bottom] > 0.05 * rng ? bottom + stood[0] : n - 1;

  const bounds = [Math.max(0, liftoff - int(setupS * fps)), liftoff, k1, trans, s2, peak, bottom, recovered];
  for (let i = 1; i < bounds.length; i++) bounds[i] = Math.max(bounds[i], bounds[i - 1] + 1);
  const b = bounds.map((x) => Math.min(x, n - 1));
  const spans: [number, number][] = [
    [b[0], b[1] - 1],
    [b[1], b[2]],
  ];
  for (let i = 2; i < 7; i++) spans.push([b[i] + 1, b[i + 1]]);
  const phases = SNATCH_PHASES.map((name, i) => ({ name, startFrame: spans[i][0], endFrame: Math.max(spans[i][0], spans[i][1]) }));
  const events: SnatchEvents = {
    liftoff,
    first_ext: k1,
    rebend: trans,
    second_ext: s2,
    peak,
    caught,
    catch_bottom: bottom,
    recovered,
    hold_end: holdEnd,
    double_knee_bend: doubleBend,
  };
  if (catchMask) events.from_hang = fromHang;
  return [phases, events];
}

export function plateLiftoff(plateY: number[], start: number, diameter: number, rise = 0.05): number | null {
  const near = plateY.slice(Math.max(0, start - 5), start + 1);
  if (!near.some(finite)) return null;
  const base = nanmedian(near);
  for (let f = start; f < plateY.length; f++) {
    if (!finite(plateY[f])) return null;
    if (base - plateY[f] > rise * diameter) {
      while (f > start && plateY[f - 1] > plateY[f]) f -= 1;
      return f;
    }
  }
  return null;
}

export function plateFollowsBar(plateY: number[], barY: number[], start: number, end: number, diameter: number, minRatio = 0.25): boolean | null {
  if (!finite(plateY[start])) return null;
  const seen = where(plateY.slice(start, end + 1).map(finite));
  const last = start + seen[seen.length - 1];
  const hands = barY[start] - min(barY.slice(start, last + 1));
  if (hands < 0.5 * diameter) return null;
  return plateY[start] - nanmin(plateY.slice(start, last + 1)) >= minRatio * hands;
}

// whether a plate found at setup is on the bar the lifter holds: the hands and the plate's centre sit at one height
export function plateOnBar(plateY: number, handsY: number, diameter: number): boolean {
  if (!(finite(plateY) && finite(handsY))) return true;
  return Math.abs(plateY - handsY) <= diameter;
}

export function approachesCamera(shin: number[], start: number, end: number, ratio = 1.5): boolean {
  const a = shin.slice(Math.max(0, start - 5), start + 6);
  const b = shin.slice(Math.max(0, end - 5), end + 6);
  if (!(a.some(finite) && b.some(finite))) return false;
  return nanmedian(b) > ratio * nanmedian(a);
}

export function keyFrames(ev: SnatchEvents): Record<string, number> {
  return {
    setup: Math.max(0, ev.liftoff - 1),
    first_pull: ev.first_ext,
    transition: ev.rebend,
    second_pull: ev.second_ext,
    turnover: Math.floor((ev.second_ext + ev.peak) / 2),
    catch: ev.caught,
    recovery: ev.recovered,
  };
}

// A lift from the hang (design 4.3): setup (standing with the bar), hang (the bar lowered to the start height, ending
// at its lowest point, lift-off), then one pull to the second extension, turnover, catch and recovery as the snatch.
// barY is image y (down positive); with no lowering of 0.3 torso lengths in the 3 s before (blocks) the hang is a frame.
export function hangPhases(phases: PhaseOut[], ev: SnatchEvents, barY: number[], t: number, fps: number): [PhaseOut[], Record<string, number>] {
  const lo = ev.liftoff;
  const a = Math.max(phases[0].startFrame, lo - int(3 * fps));
  const top = a + argmin(barY.slice(a, lo + 1));
  const drop = barY[lo] - barY[top];
  let hs = lo;
  if (drop >= 0.3 * t) {
    hs = top;
    while (hs + 1 < lo && barY[hs + 1] <= barY[top] + 0.05 * drop) hs++;
  }
  const b = [phases[0].startFrame, hs, lo, phases[3].endFrame];
  for (let i = 1; i < b.length; i++) b[i] = Math.max(b[i], b[i - 1] + 1);
  const out: PhaseOut[] = [
    { name: 'setup', startFrame: b[0], endFrame: Math.max(b[0], b[1] - 1) },
    { name: 'hang', startFrame: b[1], endFrame: Math.max(b[1], b[2]) },
    { name: 'second_pull', startFrame: b[2] + 1, endFrame: Math.max(b[2] + 1, b[3]) },
    ...phases.slice(4),
  ];
  const k = keyFrames(ev);
  return [out, { setup: Math.max(phases[0].startFrame, hs - 1), hang: lo, second_pull: k.second_pull, turnover: k.turnover, catch: k.catch, recovery: k.recovery }];
}

export type RepWindow = [number, number, number];

export function findReps(wristH: number[], noseH: number[], kneeH: number[], fps: number, minOverheadS = 0.3, overH?: number[]): RepWindow[] {
  const over = (overH ?? wristH).map((v, i) => v > noseH[i]);
  const low = wristH.map((v, i) => v < kneeH[i]);
  const reps: RepWindow[] = [];
  const n = over.length;
  let i = 0;
  while (i < n) {
    if (over[i]) {
      let j = i;
      while (j < n && over[j]) j++;
      if (j - i >= minOverheadS * fps) {
        const lows = where(low.slice(0, i));
        const last = reps[reps.length - 1];
        if (last && !low.slice(last[1], i).some(Boolean)) {
          reps[reps.length - 1] = [last[0], j - 1, last[2]];
        } else if (lows.length) {
          const start = lows[lows.length - 1];
          if (!last || start > last[1]) reps.push([start, j - 1, i]);
        }
      }
      i = j;
    } else i++;
  }
  return reps;
}

// Where a lift starts (design 4.1): on the floor (the bar at rest below the knees), at the hang (above the knees), on
// blocks (the user's tag only; the read never says blocks) or at the shoulders (a jerk).
export type StartClass = 'floor' | 'hang' | 'blocks' | 'shoulders';
export type Lift = { window: RepWindow; startClass: StartClass };

// The last frame before a receive at `hold` where the bar sat still (under 0.3 torso lengths a second, for 0.25 s or
// more) and then rose at least 0.8 torso lengths into the receive within 2.5 s; null if there is none after `from`.
export function restThenRise(barH: number[], t: number, fps: number, from: number, hold: number, ok: (f: number) => boolean = () => true): number | null {
  const v = gradient(barH).map((x) => Math.abs((x * fps) / t));
  const need = Math.max(1, int(0.25 * fps));
  const lo = Math.max(from, hold - int(2.5 * fps));
  for (let rb = hold - 1; rb >= lo; rb--) {
    if (barH[hold] - barH[rb] < 0.8 * t || !ok(rb)) continue;
    let still = 0;
    for (let f = rb; f >= Math.max(0, rb - need + 1) && v[f] < 0.3; f--) still++;
    if (still >= need) return rb;
  }
  return null;
}

// A touch-and-go rep after a lift from the hang (a hang set): the bar turns at the bottom of the dip with no rest, so the
// start is that turn, if it is at the hips or lower and the bar rises 0.8 torso lengths from it within 2.5 s.
function touchAndGo(barH: number[], shoH: number[], t: number, fps: number, from: number, hold: number): number | null {
  const lo = Math.max(from, hold - int(2.5 * fps));
  if (hold <= lo) return null;
  const dip = lo + argmin(barH.slice(lo, hold));
  return dip > lo && barH[dip] <= shoH[dip] - 0.8 * t && barH[hold] - barH[dip] >= 0.8 * t ? dip : null;
}

// The production finders' receive holds with rest-then-rise as the start, so a lift from the hang is found as well as
// one from the floor (the last frame with the wrists below the knees stays the start where it is the later of the two).
// Holds with no new start after the previous lift are that lift's (a squat stand-up, a re-dip).
export function findLifts(
  holds: [number, number][],
  barH: number[],
  kneeH: number[],
  shoH: number[],
  t: number,
  fps: number,
): Lift[] {
  const low = barH.map((v, i) => v < kneeH[i]);
  const lifts: Lift[] = [];
  for (const [a, b] of holds) {
    const last = lifts[lifts.length - 1];
    const from = last ? last.window[1] + 1 : 0;
    const lows = where(low.slice(from, a)).map((f) => f + from);
    // a snatch or a clean starts below the shoulders: a rest in the rack or overhead (a catch before the stand-up) starts nothing
    const rest = restThenRise(barH, t, fps, from, a, (f) => barH[f] < shoH[f] - 0.35 * t) ?? (last?.startClass === 'hang' ? touchAndGo(barH, shoH, t, fps, from, a) : null);
    const lowStart = lows.length ? lows[lows.length - 1] : null;
    if (rest === null && lowStart === null) {
      if (last) last.window = [last.window[0], b, last.window[2]];
      continue;
    }
    const start = rest !== null && (lowStart === null || rest > lowStart) ? rest : (lowStart as number);
    const startClass: StartClass =
      barH[start] < kneeH[start] || (rest === null && lowStart !== null) ? 'floor' : 'hang';
    lifts.push({ window: [start, b, a], startClass });
  }
  return lifts;
}

export function catchDepth(hipH: number[], kneeH: number[], kneeAng: number[], start: number, end0: number, squatKneeDeg = 65.0): [number, number, string] {
  const end = Math.max(start, Math.min(end0, hipH.length - 1));
  const f = start + argmin(hipH.slice(start, end + 1));
  const kind = min(kneeAng.slice(start, end + 1)) < squatKneeDeg ? 'squat' : 'power';
  return [f, kneeH[f] - hipH[f], kind];
}

export function runs(m: boolean[], minLen = 1): [number, number][] {
  const out: [number, number][] = [];
  const n = m.length;
  let i = 0;
  while (i < n) {
    if (m[i]) {
      let j = i;
      while (j < n && m[j]) j++;
      if (j - i >= minLen) out.push([i, j - 1]);
      i = j;
    } else i++;
  }
  return out;
}

export function findRackReps(wristH: number[], kneeH: number[], rack: boolean[], fps: number, minRackS = 0.3): RepWindow[] {
  const low = wristH.map((v, i) => v < kneeH[i]);
  const reps: RepWindow[] = [];
  for (const [a, b] of runs(rack, Math.max(1, int(minRackS * fps)))) {
    const lows = where(low.slice(0, a));
    if (!lows.length) continue;
    const start = lows[lows.length - 1];
    const last = reps[reps.length - 1];
    if (last && start <= last[1]) {
      reps[reps.length - 1] = [last[0], b, last[2]];
      continue;
    }
    reps.push([start, b, a]);
  }
  return reps;
}

export function findJerkReps(atShoulders: boolean[], overhead: boolean[], fps: number, minS = 0.3, maxGapS = 3.0): RepWindow[] {
  const k = Math.max(1, int(minS * fps));
  const racks = runs(atShoulders, k);
  const reps: RepWindow[] = [];
  for (const [a, b] of runs(overhead, k)) {
    const before = racks.filter((r) => r[0] < a && r[1] <= a + k && a - r[1] <= maxGapS * fps);
    if (!before.length) continue;
    const start = before[before.length - 1][0];
    const last = reps[reps.length - 1];
    if (last && start <= last[1]) continue;
    reps.push([start, b, a]);
  }
  return reps;
}

export type JerkEvents = {
  dip_start: number;
  dip_bottom: number;
  leave: number;
  land: number;
  top: number;
  catch_bottom: number;
  recovered: number;
  hold_end: number;
};

export function segmentJerk(barH: number[], knee: number[], elbow: number[], fps: number, setupS = 1.0): [PhaseOut[], JerkEvents] {
  const n = barH.length;
  const top = argmax(barH);
  const dipBottom = argmin(barH.slice(0, Math.max(1, top)));
  let rng = Math.max(1e-6, barH[top] - barH[dipBottom]);
  let rackH = max(barH.slice(Math.max(0, dipBottom - int(1.5 * fps)), dipBottom + 1));
  const depth = rackH - barH[dipBottom];
  let dipStart = dipBottom;
  while (dipStart > 0 && barH[dipStart] <= rackH - 0.1 * depth) dipStart -= 1;
  if (depth > 0.6 * rng) {
    dipStart = dipBottom;
    rackH = barH[dipStart];
  }
  rng = Math.max(1e-6, barH[top] - rackH);
  const back = where(barH.slice(dipBottom, top + 1).map((x) => x >= rackH));
  const leave = dipBottom + (back.length ? back[0] : 0);
  const stopW = Math.min(n, leave + int(0.8 * fps));
  let land = stopW > leave ? leave + argmin(knee.slice(leave, stopW)) : leave;
  land = land + 1 < n ? Math.max(land, leave + 1) : land;
  const later = barH.slice(land);
  const bottom = land + argmin(later.slice(0, Math.max(1, int(0.5 * fps))));
  const after = barH.slice(bottom);
  const am = max(after);
  const stood = where(after.map((x, i) => x >= barH[bottom] + 0.9 * (am - barH[bottom]) && knee[bottom + i] > 150));
  const recovered = stood.length ? bottom + stood[0] : n - 1;
  const gone = where(barH.slice(top).map((x) => x < rackH));
  const holdEnd = gone.length ? top + gone[0] : n;
  const bounds = [Math.max(0, dipStart - int(setupS * fps)), dipStart, leave, land, bottom, recovered];
  for (let i = 1; i < bounds.length; i++) bounds[i] = Math.max(bounds[i], bounds[i - 1] + 1);
  const b = bounds.map((x) => Math.min(x, n - 1));
  const spans: [number, number][] = [[b[0], b[1] - 1]];
  for (let i = 1; i < 5; i++) spans.push([b[i] + (i > 1 ? 1 : 0), b[i + 1]]);
  const phases = JERK_PHASES.map((name, i) => ({ name, startFrame: spans[i][0], endFrame: Math.max(spans[i][0], spans[i][1]) }));
  return [
    phases,
    { dip_start: dipStart, dip_bottom: dipBottom, leave, land, top, catch_bottom: bottom, recovered, hold_end: holdEnd },
  ];
}

export const jerkKeyFrames = (ev: JerkEvents): Record<string, number> => ({
  setup: Math.max(0, ev.dip_start - 1),
  drive: ev.dip_bottom,
  turnover: ev.leave,
  catch: ev.land,
  recovery: ev.recovered,
});
