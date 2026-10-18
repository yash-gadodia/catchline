import type { PoseFrame, PosePerson, PoseResult } from '../../../modules/pose-coreml';
import type { Movement } from '../../analysis/types';

const L_SHO = 5;
const R_SHO = 6;
const L_WRI = 9;
const R_WRI = 10;
const L_HIP = 11;
const R_HIP = 12;
const L_ANK = 15;
const R_ANK = 16;

// The worker's confidence drops at 20 deg off side-on (cv/catchline_cv/rules.py confidence); the check
// leaves 5 deg for the setup-only estimate before it asks for a refilm.
export const MAX_OFF_DEG = 25;
export const MIN_SCORE = 0.3;
// cv/catchline_cv/lifts.py HANG_HIP_W: hanging from a bar the hips read narrower.
const HANG_HIP_W = 0.38;

export type Framing = { kind: 'ok'; offDeg: number | null } | { kind: 'cut_off' } | { kind: 'side_on'; offDeg: number };

// The tracked lifter the phone picked, else cv/catchline_cv/lifter.py's seed: largest box height x mean score.
export function lifterOf(frame: PoseFrame): PosePerson | null {
  if (frame.lifter != null && frame.people[frame.lifter]) return frame.people[frame.lifter];
  let best: PosePerson | null = null;
  let bestScore = -1;
  for (const p of frame.people) {
    const score = ((p.box[3] - p.box[1]) * p.kp.reduce((s, k) => s + (k ? k[2] : 0), 0)) / 26;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function asinDeg(v: number): number {
  return (Math.asin(Math.min(1, v)) * 180) / Math.PI;
}

// cv/catchline_cv/lifts.py off_side_pose: the left and right shoulders and hips overlap in x side-on and sit
// ~0.7 (shoulders) and hipW (hips) torso lengths apart front-on.
export function offSideDeg(people: PosePerson[], hipW = 0.5): number | null {
  const torso: number[] = [];
  const sho: number[] = [];
  const hip: number[] = [];
  for (const { kp } of people) {
    const [ls, rs, lh, rh] = [kp[L_SHO], kp[R_SHO], kp[L_HIP], kp[R_HIP]];
    if (ls && rs) sho.push(Math.abs(ls[0] - rs[0]));
    if (lh && rh) hip.push(Math.abs(lh[0] - rh[0]));
    if (ls && rs && lh && rh) {
      torso.push(Math.hypot((ls[0] + rs[0]) / 2 - (lh[0] + rh[0]) / 2, (ls[1] + rs[1]) / 2 - (lh[1] + rh[1]) / 2));
    }
  }
  const t = median(torso);
  const ds = median(sho);
  const dh = median(hip);
  if (t == null || t <= 0 || ds == null || dh == null) return null;
  return (asinDeg(ds / (0.7 * t)) + asinDeg(dh / (hipW * t))) / 2;
}

function seen(kp: PosePerson['kp'], joints: number[], width: number, height: number): boolean {
  return joints.some((j) => {
    const k = kp[j];
    return k != null && k[2] >= MIN_SCORE && k[0] >= 0 && k[0] <= width && k[1] >= 0 && k[1] <= height;
  });
}

// Whole body: an ankle and a wrist inside the frame with a decent score in at least half the frames.
// null when no frame has a lifter, so the check stays quiet.
export function wholeBody(people: PosePerson[], width: number, height: number): boolean | null {
  if (people.length === 0) return null;
  const ok = people.filter((p) => seen(p.kp, [L_ANK, R_ANK], width, height) && seen(p.kp, [L_WRI, R_WRI], width, height));
  return ok.length * 2 >= people.length;
}

export function assessFraming(pose: PoseResult, movement: Movement): Framing | null {
  const people = pose.frames.map(lifterOf).filter((p): p is PosePerson => p !== null);
  const body = wholeBody(people, pose.width, pose.height);
  if (body === null) return null;
  if (!body) return { kind: 'cut_off' };
  const hanging = movement === 'kipping_pull_up' || movement === 'bar_muscle_up';
  const off = offSideDeg(people, hanging ? HANG_HIP_W : 0.5);
  if (off != null && off > MAX_OFF_DEG) return { kind: 'side_on', offDeg: off };
  return { kind: 'ok', offDeg: off };
}

// "about 45°": the estimate is good to a few degrees, so it is said in steps of 5.
export function roundedDeg(deg: number): number {
  return Math.round(deg / 5) * 5;
}
