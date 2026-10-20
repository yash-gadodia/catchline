// cv/catchline_cv/detect.py: which barbell lift the clip shows, from the lifter's camera-stabilised keypoints.
import { kneeAngles, rackMask } from './body';
import { finitePt } from './geometry';
import { K, L_ANK, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_HIP, R_KNEE, R_SHO, R_WRI, lowpassK, mid, torsoPx, ys } from './movement';
import { int, mean, median, nanmax, nanmin, ptp, pyRound } from './num';
import { runs } from './phases';

const HOLD_S = 0.3;
const FLOOR_S = 0.2;
const OVERHEAD_T = 0.5;
const SURE_LOCK_T = 0.7;
const RACK_T = 0.35;
const SURE_RACK_T = 0.3;
const STILL_T = 0.4;
const DIP_DEG = 15.0;
const FEET_T = 0.4;
const JERK_GAP_S = 3.0;
const STRONG = 0.9;
const WEAK = 0.7;

export type Found = { movement: string; confidence: number; from_floor: boolean; frame: number } & Record<string, unknown>;
export type Detected = { movement: string; confidence: number; lifts?: Found[] };

export function detect(k0: K, fps: number, lifts = false): Detected {
  const k = k0.filter((r) => [L_SHO, R_SHO, L_HIP, R_HIP].every((j) => finitePt(r[j])));
  if (k.length < fps) return summarise([], lifts);
  const n = k.length;
  const ks = lowpassK(k, fps);
  const t = torsoPx(ks);
  const bar = mid(ks, L_WRI, R_WRI);
  const wri = ys(bar).map((v) => -v);
  const sho = ys(mid(ks, L_SHO, R_SHO)).map((v) => -v);
  const knee = ys(mid(ks, L_KNEE, R_KNEE)).map((v) => -v);
  const ank = ys(mid(ks, L_ANK, R_ANK)).map((v) => -v);
  const h = wri.map((w, i) => (w - sho[i]) / t);
  const overhead = h.map((v) => v > OVERHEAD_T);
  const rack = rackMask(ks, bar, fps);
  const atSho = h.map((v) => Math.abs(v) < RACK_T);
  const kneeAng = kneeAngles(ks);
  const hold = Math.max(1, int(HOLD_S * fps));
  const floor = runs(
    wri.map((w, i) => w < knee[i]),
    Math.max(1, int(FLOOR_S * fps)),
  );
  const found: Found[] = [];

  const pre = floor.length ? floor[0][0] : n;
  const racks = runs(atSho.slice(0, pre), hold);
  const overs = runs(overhead.slice(0, pre), hold);
  let last = -1;
  for (const [oa, ob] of overs) {
    const before = racks.filter((r) => r[1] < oa && oa - r[1] <= JERK_GAP_S * fps);
    if (!before.length || before[before.length - 1][0] <= last) continue;
    const ra = before[before.length - 1][0];
    last = ob;
    const a = ank.slice(ra, ob + 1);
    const feet = (nanmax(a) - nanmin(a)) / t;
    if (feet > FEET_T) continue;
    const kw = kneeAng.slice(ra, oa + 1);
    const dip = nanmax(kw) - nanmin(kw);
    found.push({
      movement: 'jerk',
      confidence: dip >= DIP_DEG ? STRONG : WEAK,
      from_floor: false,
      frame: ra,
      dip_deg: pyRound(dip, 1),
      feet_torsos: pyRound(feet, 2),
    });
  }

  floor.forEach(([, fb], i) => {
    const a = fb + 1;
    const b = i + 1 < floor.length ? floor[i + 1][0] : n;
    if (b - a < hold) return;
    const over = runs(overhead.slice(a, b), hold);
    const rk = runs(rack.slice(a, b), hold).filter((r) => ptp(h.slice(a + r[0], a + r[0] + hold)) <= STILL_T);
    if (rk.length && (!over.length || rk[0][0] < over[0][0])) {
      const [s, e] = rk[0];
      const hh = median(h.slice(a + s, a + e + 1).map(Math.abs));
      found.push({ movement: 'clean', confidence: hh <= SURE_RACK_T ? STRONG : WEAK, from_floor: true, frame: a + s, hold_torsos: pyRound(hh, 2) });
    } else if (over.length) {
      const [s, e] = over[0];
      const hh = median(h.slice(a + s, a + e + 1));
      found.push({ movement: 'snatch', confidence: hh >= SURE_LOCK_T ? STRONG : WEAK, from_floor: true, frame: a + s, hold_torsos: pyRound(hh, 2) });
    }
  });
  return summarise(found, lifts);
}

function summarise(found: Found[], lifts: boolean): Detected {
  let out: Detected;
  if (!found.length) out = { movement: 'unknown', confidence: 0.0 };
  else {
    const names = found.map((f) => f.movement);
    const count = (x: string) => names.filter((v) => v === x).length;
    const top = [...new Set(names)].reduce((a, b) => (count(b) > count(a) ? b : a));
    const agree = count(top) / names.length;
    const conf = pyRound(mean(found.filter((f) => f.movement === top).map((f) => f.confidence)) * agree, 2);
    out = { movement: conf >= 0.5 ? top : 'unknown', confidence: conf };
  }
  if (lifts) out.lifts = found;
  return out;
}
