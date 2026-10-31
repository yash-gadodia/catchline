import type { Analysis } from '../types';
import { missNote } from '../format';
import { analyse } from './analyse';
import { JOINTS, L_ANK, L_BIGTOE, L_ELB, L_HEEL, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_BIGTOE, R_ELB, R_HEEL, R_HIP, R_KNEE, R_SHO, R_WRI } from './movement';
import { Pt } from './num';
import { DeviceInput, PlateObservation } from './source';

// A synthetic lifter facing +x at 30 fps, inference px (1280 tall, ~4.4 px a cm): leg and trunk angles in degrees from
// straight up (+ = forward), the bar (the hands) in px forward of and above the ankle, the elbows bent `bend` px off
// the shoulder-hand line; keyframed and interpolated.
type Pose = { shin: number; thigh: number; torso: number; bar: Pt; bend: number };
const dir = (a: number, len: number): Pt => [len * Math.sin((a * Math.PI) / 180), -len * Math.cos((a * Math.PI) / 180)];
const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];

const SET: Pose = { shin: 30, thigh: -70, torso: 55, bar: [20, 60], bend: 0 };
const KNEE: Pose = { shin: 10, thigh: -45, torso: 40, bar: [15, 200], bend: 0 };
const HIP: Pose = { shin: 5, thigh: -10, torso: 5, bar: [25, 356], bend: 0 };
const EXT: Pose = { shin: -5, thigh: 0, torso: -8, bar: [30, 420], bend: 0 };
const PULL: Pose = { shin: 10, thigh: -30, torso: 0, bar: [25, 560], bend: 60 };
const SQUAT: Pose = { shin: 35, thigh: -105, torso: 10, bar: [15, 547], bend: 0 };
const STAND: Pose = { shin: 0, thigh: 0, torso: 0, bar: [15, 820], bend: 0 };
const HANDS_DOWN: Pose = { ...STAND, bar: [25, 340] };
const TO_PULL: [Pose, number][] = [[SET, 0], [SET, 90], [KNEE, 15], [HIP, 8], [EXT, 4], [PULL, 5]];

function frames(keys: [Pose, number][]): Pose[] {
  const out: Pose[] = [keys[0][0]];
  for (let i = 1; i < keys.length; i++) {
    const [a, b] = [keys[i - 1][0], keys[i][0]];
    const at = (x: number, y: number, t: number) => x + (y - x) * t;
    for (let s = 1; s <= keys[i][1]; s++) {
      const t = s / keys[i][1];
      out.push({
        shin: at(a.shin, b.shin, t),
        thigh: at(a.thigh, b.thigh, t),
        torso: at(a.torso, b.torso, t),
        bar: [at(a.bar[0], b.bar[0], t), at(a.bar[1], b.bar[1], t)],
        bend: at(a.bend, b.bend, t),
      });
    }
  }
  return out;
}

// Side-on (yaw 0) both sides of the body coincide. Off side-on a pinhole camera `camY` px down the frame, 3.4 m away
// and turned `yaw` degrees toward the lifter's front sees each joint a half-width out to either side (a snatch grip for
// the hands).
const HALF: Record<string, number> = { ank: 50, knee: 50, hip: 55, sho: 77, elb: 140, wri: 200, toe: 50, heel: 50 };
function lifter(poses: Pose[], yaw = 0, camY = 800): DeviceInput {
  const th = (yaw * Math.PI) / 180;
  const see = (p: Pt, half: number): Pt => {
    if (!yaw) return [...p];
    const X = p[0] - 600;
    const s = 1500 / (1500 - (half * Math.cos(th) + X * Math.sin(th)));
    return [600 + (X * Math.cos(th) - half * Math.sin(th)) * s, camY + (p[1] - camY) * s];
  };
  const k = poses.map((p) => {
    const ank: Pt = [600, 1100];
    const knee = add(ank, dir(p.shin, 180));
    const hip = add(knee, dir(p.thigh, 180));
    const sho = add(hip, dir(p.torso, 220));
    const wri: Pt = [ank[0] + p.bar[0], ank[1] - p.bar[1]];
    const [dx, dy] = [wri[0] - sho[0], wri[1] - sho[1]];
    const len = Math.hypot(dx, dy) || 1;
    const elb: Pt = [(sho[0] + wri[0]) / 2 - (p.bend * dy) / len, (sho[1] + wri[1]) / 2 + (p.bend * dx) / len];
    const row: Pt[] = Array.from({ length: JOINTS }, (): Pt => [NaN, NaN]);
    const both = (l: number, r: number, q: Pt, name: string) => {
      row[l] = see(q, HALF[name]);
      row[r] = see(q, -HALF[name]);
    };
    both(L_ANK, R_ANK, ank, 'ank');
    both(L_KNEE, R_KNEE, knee, 'knee');
    both(L_HIP, R_HIP, hip, 'hip');
    both(L_SHO, R_SHO, sho, 'sho');
    both(L_ELB, R_ELB, elb, 'elb');
    both(L_WRI, R_WRI, wri, 'wri');
    both(L_BIGTOE, R_BIGTOE, [ank[0] + 60, ank[1] + 10], 'toe');
    both(L_HEEL, R_HEEL, [ank[0] - 25, ank[1] + 10], 'heel');
    return row;
  });
  const n = k.length;
  const I = () => [[1, 0, 0], [0, 1, 0]];
  return {
    meta: { width: 1080, height: 1920, fps: 30, frameCount: n },
    shape: [1280, 720],
    lifter: {
      k,
      scores: k.map(() => new Array<number>(JOINTS).fill(0.9)),
      boxes: k.map((r) => {
        const pts = r.filter((q) => Number.isFinite(q[0]));
        const xs = pts.map((q) => q[0]);
        const ys = pts.map((q) => q[1]);
        return [Math.min(...xs) - 20, Math.min(r[L_SHO][1] - 160, ...ys), Math.max(...xs) + 20, Math.max(...ys) + 20];
      }),
    },
    cameraPath: k.map(I),
    source: {
      window: (start, count) => {
        const m = Math.max(0, Math.min(count, n - start));
        return { Ms: Array.from({ length: m }, I), inliers: new Array<number>(m).fill(100) };
      },
      plates: () => [],
      trackPlate: (_s, len) => ({ centres: Array.from({ length: len }, (): Pt => [NaN, NaN]), scores: new Array<number>(len).fill(0) }),
    },
  };
}

const MADE = frames([...TO_PULL, [SQUAT, 6], [SQUAT, 10], [STAND, 30], [STAND, 30], [HANDS_DOWN, 15], [HANDS_DOWN, 30]]);
const OUT_FRONT: Pose = { ...HIP, bar: [170, 780], bend: 0 };
const ON_THIGHS: Pose = { ...STAND, bar: [60, 400] };
const DROPPED_FRONT = frames([...TO_PULL, [OUT_FRONT, 6], [OUT_FRONT, 12], [{ ...OUT_FRONT, bar: [230, 420] }, 6], [ON_THIGHS, 6], [ON_THIGHS, 45]]);
const OUT_BEHIND: Pose = { shin: 10, thigh: -20, torso: -10, bar: [-150, 760], bend: 0 };
const DROPPED_BEHIND = frames([...TO_PULL, [OUT_BEHIND, 6], [OUT_BEHIND, 12], [{ ...OUT_BEHIND, bar: [-200, 520] }, 6], [{ ...ON_THIGHS, bar: [-40, 400] }, 6], [{ ...ON_THIGHS, bar: [-40, 400] }, 45]]);

const run = (poses: Pose[], yaw = 0, camY = 800) => analyse(lifter(poses, yaw, camY), 'snatch').analysis as unknown as Analysis;
const outcome = (a: Analysis) => a.measurements.find((m) => m.id === 'outcome');
const forward = (a: Analysis) => a.measurements.find((m) => m.id === 'bar_forward_off_hips')?.value;

describe('a snatch the lifter did not hold', () => {
  it('stays made when the bar is dropped after the stand-up', () => {
    const a = run(MADE);
    expect([a.reps.map((r) => r.made), outcome(a), missNote(a), a.cue]).toEqual([[true], undefined, null, null]);
  });

  it('is missed in front when the hands come down to the thighs with the bar out front', () => {
    const a = run(DROPPED_FRONT);
    expect(a.reps.map((r) => r.made)).toEqual([false]);
    expect([outcome(a)?.label, outcome(a)?.value]).toEqual(['Missed forward', 45.3]);
    expect(missNote(a)).toBe('Missed lift: the bar came down in front.');
    expect(a.cue?.why).toBe(
      'Missed forward. The bar left you 45 cm in front of mid-foot. Earliest thing I can see: the bar flew 33 cm forward after hip contact, so you had to chase it.'
    );
  });

  it('is missed behind when the bar goes back over the head and the hands come down', () => {
    const a = run(DROPPED_BEHIND);
    expect(a.reps.map((r) => r.made)).toEqual([false]);
    expect([outcome(a)?.label, outcome(a)?.value]).toEqual(['Missed behind', -46.1]);
    expect(missNote(a)).toBe('Missed lift: the bar came down behind.');
    expect([a.cue, a.noCueReason]).toEqual([null, { code: 'unclear_miss' }]);
  });
});

// IMG_0073 (owner clip): a made snatch filmed well off side-on with the phone low got "the bar flew ~48 cm forward".
// Off side-on the hands are a grip apart and, as the bar rises above a low camera, at different heights in the frame;
// the bar fell back to one wrist, and half a grip sideways read as the bar moving forward.
describe('a snatch filmed off side-on with the phone low', () => {
  it('measures the bar off the hips as it does side-on and gives no forward cue', () => {
    const side = run(MADE);
    const angled = run(MADE, 40, 1050);
    expect([forward(side), forward(angled)]).toEqual([0.6, 0.9]);
    expect([angled.cue, angled.noCueReason]).toEqual([null, { code: 'off_side_on', offSideDeg: 40 }]);
  });
});

// A clip where the plates only come into view once the bar is moving (the bar rolled in late, or a plate stand hid it at
// setup): the lift is measured from the first frame of the pull that shows them, not failed or left unsized.
describe('a snatch whose plates first show mid-pull', () => {
  const D = 198;
  const both = (from: number) => (frame: number, a: Pt): PlateObservation[] =>
    frame < from
      ? []
      : [
          { centre: [a[0], a[1]], axes: [D, D], score: 1, side: 'a', fitInliers: 0.9 },
          { centre: [a[0] + 60, a[1]], axes: [D, D], score: 1, side: 'b', fitInliers: 0.9 },
        ];
  const withPlates = (from: number) => {
    const input = lifter(MADE);
    const asked: number[] = [];
    input.source.plates = (frame, a) => {
      asked.push(frame);
      return both(from)(frame, a);
    };
    return { res: analyse(input, 'snatch'), asked };
  };

  it('sizes the lift from the plates found in the pull', () => {
    const setup = withPlates(0).res.reps[0];
    const { res, asked } = withPlates(100);
    const late = res.reps[0];
    expect(Math.max(...asked)).toBeGreaterThanOrEqual(100);
    expect([setup.scale_method, late.scale_method]).toEqual(['harmonic mean of near and far plates', 'harmonic mean of near and far plates']);
    expect(late.snatch?.plates.length).toBe(2);
    expect(res.analysis.failure).toBeNull();
  });

  it('asks for no later frames while the setup frame itself is still unanswered (the first replay of a phone trace)', () => {
    const input = lifter(MADE);
    const asked: number[] = [];
    input.source.plates = (frame) => {
      asked.push(frame);
      return [];
    };
    input.source.platesSearched = () => false;
    analyse(input, 'snatch');
    expect(Math.max(...asked)).toBeLessThan(90);
  });

  it('falls back to the body when no frame of the lift shows a plate', () => {
    const { res } = withPlates(10_000);
    expect([res.reps[0].scale_method, res.analysis.failure]).toEqual(['body segments', null]);
  });
});

describe('the coaching guides and key numbers of a snatch', () => {
  it('places the start line, the knee, hip and peak heights and the ring at the furthest-forward bar', () => {
    const a = run(MADE);
    const g = a.reps[0].guides!;
    const path = a.reps[0].path;
    expect(g.kneeY!).toBeGreaterThan(g.hipY!);
    expect(g.hipY!).toBeGreaterThan(g.peakY!);
    expect(g.startX).toBeCloseTo(path[0].x, 1);
    expect(Math.max(...path.filter((p) => p.frame <= g.ring.frame + 1).map((p) => p.x))).toBeCloseTo(g.ring.x, 2);
    expect(a.measurements.filter((m) => ['max_forward_drift', 'catch_height'].includes(m.id)).map((m) => m.id)).toEqual(['max_forward_drift', 'catch_height']);
  });

  it('lists only the confidently measured numbers, and past 45 deg off side-on the front-view readings in place of the forward/back ones', () => {
    const side = run(MADE);
    expect(side.keyNumbers).toEqual(['max_forward_drift', 'bar_forward_off_hips', 'bar_crash', 'jump_forward', 'catch_height', 'hip_rise', 'bar_over_shoulder', 'knee_catch', 'elbow_pull']);
    expect(run(MADE, 40, 1050).keyNumbers).toEqual(side.keyNumbers);
    const front = run(MADE, 52, 1050);
    expect(front.keyNumbers).toEqual(['catch_height', 'bar_tilt_catch', 'bar_drift_lateral', 'hip_shift', 'stance_setup', 'stance_catch', 'hip_rise', 'knee_catch', 'elbow_pull']);
    expect(front.measurements.filter((m) => m.id === 'bar_tilt_catch' || m.id === 'stance_catch').map((m) => [m.unit, Number.isFinite(m.value)])).toEqual([['deg', true], ['cm', true]]);
    expect(run(DROPPED_BEHIND).keyNumbers).not.toContain('jump_forward');
  });
});

describe('the joint tracks beside the bar path', () => {
  it('follow the feet, hips, shoulders, knees and elbows over the rep frames, normalised like the path', () => {
    const a = run(MADE);
    const rep = a.reps[0];
    const tr = rep.tracks!;
    expect(Object.keys(tr)).toEqual(['feet', 'hips', 'shoulders', 'knees', 'elbows']);
    for (const t of Object.values(tr)) {
      expect([t![0].frame, t![t!.length - 1].frame]).toEqual([rep.path[0].frame, rep.path[rep.path.length - 1].frame]);
      expect(t!.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
    }
    // the hips rise from lift-off to the top of the pull and the feet stay on the floor
    const hips = tr.hips!;
    const ext = rep.phases.find((p) => p.name === 'second_pull')!.endFrame;
    expect(hips.find((p) => p.frame === ext)!.y).toBeLessThan(hips[0].y - 0.1);
    expect(Math.max(...tr.feet!.map((p) => p.y)) - Math.min(...tr.feet!.map((p) => p.y))).toBeLessThan(0.03);
    const ids = a.measurements.filter((m) => ['hip_rise', 'bar_over_shoulder', 'knee_catch', 'elbow_pull'].includes(m.id));
    expect(ids.map((m) => `${m.id} ${m.unit} ${m.status}`)).toEqual(['hip_rise cm normal', 'bar_over_shoulder cm normal', 'knee_catch deg normal', 'elbow_pull deg normal']);
    expect(ids.map((m) => m.value)).toEqual([30.9, 19.8, 38.9, 1]);
  });

  it('skip a frame whose joint the pose did not see instead of inventing it', () => {
    const input = lifter(MADE);
    const full = analyse(input, 'snatch').analysis as unknown as Analysis;
    const hips = full.reps[0].tracks!.hips!;
    const f = hips[Math.floor(hips.length / 2)].frame;
    input.lifter.k[f][L_HIP] = [NaN, NaN];
    const a = analyse(input, 'snatch').analysis as unknown as Analysis;
    const got = a.reps[0].tracks!.hips!;
    expect(got.length).toBe(hips.length - 1);
    expect(got.some((p) => p.frame === f)).toBe(false);
    expect(a.reps[0].tracks!.feet!.length).toBe(full.reps[0].tracks!.feet!.length);
  });

  it('leave out an elbow the pose read on the shoulder, as it does at a lockout (30-10 joint eval)', () => {
    const input = lifter(MADE);
    const full = analyse(input, 'snatch').analysis as unknown as Analysis;
    const elbows = full.reps[0].tracks!.elbows!;
    const f0 = elbows[Math.floor(elbows.length / 2)].frame;
    for (let f = f0; f < f0 + 6; f++) {
      input.lifter.k[f][L_ELB] = [...input.lifter.k[f][L_SHO]];
      input.lifter.k[f][R_ELB] = [...input.lifter.k[f][R_SHO]];
    }
    const a = analyse(input, 'snatch').analysis as unknown as Analysis;
    const got = a.reps[0].tracks!.elbows!.map((p) => p.frame);
    expect([f0 + 1, f0 + 2, f0 + 3, f0 + 4].filter((f) => got.includes(f))).toEqual([]);
    expect(got.length).toBeGreaterThan(elbows.length - 10);
    expect(a.reps[0].tracks!.shoulders).toEqual(full.reps[0].tracks!.shoulders);
  });
});

// 27-10: no lift found is no longer a failure screen: the bar, feet and hips were tracked, so that is the result,
// with the gate that failed as its reason (not_side_on when the body reads front or back, 26-10).
describe('no lift found: a path-only result', () => {
  const STANDING = frames([[STAND, 0], [STAND, 60]]);
  it('names the camera angle when the body reads front or back, and keeps the lines', () => {
    const a = run(STANDING, 70);
    expect(a.failure).toBeNull();
    expect(a.noCueReason).toEqual({ code: 'path_only', gate: 'not_side_on', offSideDeg: 70 });
    expect(a.yawBucket).toBe('past_60');
    expect(a.reps[0].tracks!.hips!.length).toBe(61);
  });
  it('tracks the whole clip as one rep with no phases, a setup and a peak still, the start line and the ring', () => {
    const a = run(STANDING, 0);
    expect(a.noCueReason).toEqual({ code: 'path_only', gate: 'no_reps', offSideDeg: 0 });
    expect([a.cue, a.measurements, a.keyNumbers, a.bestRepIndex, a.reps.length]).toEqual([null, [], [], 1, 1]);
    const rep = a.reps[0];
    expect([rep.index, rep.startFrame, rep.endFrame, rep.made, rep.phases]).toEqual([1, 0, 60, false, []]);
    expect(rep.keyFrames).toEqual([
      { phase: 'setup', frame: 0, image: 'kf/r1-1-setup.jpg' },
      { phase: 'peak', frame: 0, image: 'kf/r1-2-peak.jpg' },
    ]);
    expect(rep.path.length).toBe(61);
    expect(Object.keys(rep.tracks!)).toEqual(['feet', 'hips', 'shoulders', 'knees', 'elbows']);
    expect(rep.guides).toEqual({ startX: rep.path[0].x, ring: rep.path[0] });
    expect(a.pxPerCm).toBe(3.707);
  });
  it('stays a failure when the pose never saw the hands, so there is no bar to draw', () => {
    const input = lifter(STANDING);
    for (const row of input.lifter.k) row[L_WRI] = row[R_WRI] = [NaN, NaN];
    const a = analyse(input, 'snatch').analysis as unknown as Analysis;
    expect([a.failure?.reason, a.failure?.code, a.reps]).toEqual(['unsupported_movement', 'no_reps', []]);
  });
});
