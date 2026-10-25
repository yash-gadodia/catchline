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
