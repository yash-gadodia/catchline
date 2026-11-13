// The part of a clip that is the lift (4.0, owner 11-11: "everything else is noise"): from a little before the hands
// last leave the floor-level bar to a little after the work is over. Read from the hands' height above the feet in
// standing heights, per frame (NaN where unseen). Null when the clip shows no pick-up from low (a squat from a rack,
// a clip trimmed to mid-lift, gymnastics): then the whole clip is the lift.
const LOW = 0.26; // hands on a bar on the floor or low blocks
const UP = 0.36; // clearly off it
const HANG = 0.56; // above where the arms hang at the hips: the bar is racked, overhead or in the pull
const LEAD_S = 1.2;
const TAIL_S = 1.0;
const MIN_S = 1.0;
const LAST_S = 3.0;

export type LiftWindow = { startFrame: number; endFrame: number };

export function liftWindow(h: number[], fps: number): LiftWindow | null {
  const n = h.length;
  let lastLow = -1;
  let firstOff = -1;
  let lastOff = -1;
  let lastHigh = -1;
  let lastBack = -1;
  let up = false;
  for (let f = 0; f < n; f++) {
    const v = h[f];
    if (!Number.isFinite(v)) continue;
    if (v < LOW) {
      if (up) lastBack = f;
      up = false;
      lastLow = f;
    } else if (v > UP && !up && lastLow >= 0) {
      up = true;
      if (firstOff < 0) firstOff = lastLow;
      lastOff = f;
    }
    if (up && v > HANG) lastHigh = f;
  }
  if (firstOff < 0) return null;
  // over when the bar is last above the hips (a snatch, clean or jerk, dropped or lowered) or the hands are last back
  // at the floor, whichever is later; a last rise that is neither (a deadlift held at the top, or the lifter letting
  // go and standing up, which look the same) gets LAST_S
  const over = lastHigh >= 0 ? Math.max(lastHigh, lastBack) : lastBack > lastOff ? lastBack : Math.min(n - 1, Math.round(lastOff + LAST_S * fps));
  const start = Math.max(0, Math.round(firstOff - LEAD_S * fps));
  const end = Math.min(n - 1, Math.round(over + TAIL_S * fps));
  if (end - start < MIN_S * fps || end - start >= n - 1 - Math.round(0.5 * fps)) return null;
  // the highest the hands go must be inside it: a pull-up clip whose only "pick-up" is a crouch after the set is not cut
  let top = -1;
  for (let f = 0; f < n; f++) if (Number.isFinite(h[f]) && (top < 0 || h[f] > h[top])) top = f;
  if (top < start || top > end) return null;
  return { startFrame: start, endFrame: end };
}

// A hanging movement (pull-ups, muscle-ups, toes-to-bar), from the hands' height above the shoulders in standing
// heights per frame: from a little before the hands first stay above the shoulders to a little after they last do, so
// the walk up to the bar and away from it are cut (owner, 12-11). On the bar the hands are above the shoulders even
// at the top of a pull-up; walking or chalking up they are not. The top of a muscle-up (hands at the hips) falls
// between and stays in. Null when the hands are never up for BAR_S.
const ON_BAR = 0.05;
const BAR_S = 0.5;
const PAD_S = 0.5;
// after the last stretch on the bar: the top of a muscle-up (hands at the hips) and the drop to the floor
const DROP_S = 1.5;
export function hangWindow(h: number[], fps: number): LiftWindow | null {
  const need = Math.max(1, Math.round(BAR_S * fps));
  let first = -1;
  let last = -1;
  let run = 0;
  for (let f = 0; f < h.length; f++) {
    run = Number.isFinite(h[f]) && h[f] >= ON_BAR ? run + 1 : 0;
    if (run >= need) {
      if (first < 0) first = f - run + 1;
      last = f;
    }
  }
  if (first < 0) return null;
  return { startFrame: Math.max(0, first - Math.round(PAD_S * fps)), endFrame: Math.min(h.length - 1, last + Math.round(DROP_S * fps)) };
}
