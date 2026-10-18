import { readFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import type { PosePerson, PoseResult } from '../../../modules/pose-coreml';
import { assessFraming, lifterOf, offSideDeg, roundedDeg, wholeBody } from './framing';

type Kp = [number, number, number];

// One standing lifter, torso 200 px: shoulders at y 400, hips at y 600, both centred on x 300 and
// shoSep / hipSep torso lengths apart in x (cv/tests/test_camera_angle.py pose()). Wrists and ankles
// sit inside a 720 x 1280 frame unless moved.
function person(shoSep: number, hipSep: number, over: Record<number, Kp | null> = {}): PosePerson {
  const kp: (Kp | null)[] = Array(26).fill(null);
  for (let j = 5; j < 26; j++) if (j !== 17) kp[j] = [300, 700, 0.8];
  kp[5] = [300 - shoSep * 100, 400, 0.8];
  kp[6] = [300 + shoSep * 100, 400, 0.8];
  kp[11] = [300 - hipSep * 100, 600, 0.8];
  kp[12] = [300 + hipSep * 100, 600, 0.8];
  kp[9] = [310, 620, 0.8];
  kp[10] = [312, 622, 0.8];
  kp[15] = [290, 1000, 0.8];
  kp[16] = [320, 1000, 0.8];
  for (const [j, v] of Object.entries(over)) kp[Number(j)] = v;
  return { box: [200, 350, 420, 1050], kp };
}

function clip(p: PosePerson, n = 15): PoseResult {
  return { fps: 10, width: 720, height: 1280, frames: Array.from({ length: n }, (_, i) => ({ t: i / 10, people: [p], lifter: 0 })) };
}

describe('offSideDeg (port of cv/catchline_cv/lifts.py off_side_pose)', () => {
  it('reads a side-on stance, shoulders and hips stacked in x, as 0 deg', () => {
    expect(offSideDeg([person(0, 0)])).toBe(0);
  });

  it('reads a front stance, shoulders 0.7 and hips 0.5 torso apart, as 90 deg', () => {
    expect(offSideDeg([person(0.7, 0.5)])).toBeCloseTo(90, 6);
  });

  it('reads sin 45 of each width as 45 deg', () => {
    expect(offSideDeg([person(0.7 * Math.SQRT1_2, 0.5 * Math.SQRT1_2)])).toBeCloseTo(45, 6);
  });

  it('matches the Python test cases for the old and the hanging hip width', () => {
    const cases: [number, number][] = [[0.56, 0.38], [0.59, 0.38], [0.5, 0.35]];
    expect(cases.map(([s, h]) => Math.round(offSideDeg([person(s, h)]) ?? -1))).toEqual([51, 53, 45]);
    expect(cases.map(([s, h]) => Math.round(offSideDeg([person(s, h)], 0.38) ?? -1))).toEqual([72, 74, 56]);
  });

  it('takes the median over frames, so one flicker does not move it', () => {
    expect(offSideDeg([person(0, 0), person(0, 0), person(0.7, 0.5)])).toBe(0);
  });

  it('gives null without shoulders and hips', () => {
    expect(offSideDeg([person(0, 0, { 5: null, 11: null })])).toBeNull();
    expect(offSideDeg([])).toBeNull();
  });
});

describe('lifterOf', () => {
  const small = { ...person(0, 0), box: [0, 0, 50, 100] };
  const big = person(0.7, 0.5);

  it('takes the lifter the phone tracked', () => {
    expect(lifterOf({ t: 0, people: [big, small], lifter: 1 })).toBe(small);
  });

  it('else the largest box height x mean score', () => {
    expect(lifterOf({ t: 0, people: [small, big] })).toBe(big);
    expect(lifterOf({ t: 0, people: [] })).toBeNull();
  });
});

describe('wholeBody', () => {
  it('passes with a wrist and an ankle in frame', () => {
    expect(wholeBody([person(0, 0, { 9: null, 16: null })], 720, 1280)).toBe(true);
  });

  it('fails with both ankles below the frame', () => {
    expect(wholeBody([person(0, 0, { 15: [290, 1300, 0.8], 16: [320, 1290, 0.8] })], 720, 1280)).toBe(false);
  });

  it('fails when the wrists score too low to trust', () => {
    expect(wholeBody([person(0, 0, { 9: [310, 620, 0.2], 10: [312, 622, 0.29] })], 720, 1280)).toBe(false);
  });

  it('passes when at least half the frames see the whole body', () => {
    const cut = person(0, 0, { 15: null, 16: null });
    expect(wholeBody([person(0, 0), cut], 720, 1280)).toBe(true);
    expect(wholeBody([person(0, 0), cut, cut], 720, 1280)).toBe(false);
  });

  it('says nothing without a lifter', () => {
    expect(wholeBody([], 720, 1280)).toBeNull();
  });
});

describe('assessFraming', () => {
  it('a side-on stance in frame is ok', () => {
    expect(assessFraming(clip(person(0, 0)), 'snatch')).toEqual({ kind: 'ok', offDeg: 0 });
  });

  it('a front stance asks for the side', () => {
    const f = assessFraming(clip(person(0.7, 0.5)), 'clean');
    expect(f?.kind).toBe('side_on');
    expect(f?.kind === 'side_on' ? f.offDeg : null).toBeCloseTo(90, 6);
  });

  it('24.5 deg still passes, 25.5 deg does not', () => {
    const at = (deg: number) => person(0.7 * Math.sin((deg * Math.PI) / 180), 0.5 * Math.sin((deg * Math.PI) / 180));
    expect(assessFraming(clip(at(24.5)), 'snatch')?.kind).toBe('ok');
    expect(assessFraming(clip(at(25.5)), 'snatch')?.kind).toBe('side_on');
  });

  it('hanging lifts use the narrower hip width', () => {
    // 0.5 / 0.35 reads 45 deg standing and 56 hanging
    expect(assessFraming(clip(person(0.5, 0.35)), 'bar_muscle_up')).toEqual({ kind: 'side_on', offDeg: expect.closeTo(56.33, 2) });
  });

  it('a body cut off wins over the angle', () => {
    expect(assessFraming(clip(person(0.7, 0.5, { 15: null, 16: null })), 'snatch')).toEqual({ kind: 'cut_off' });
  });

  it('no lifter in any frame: no verdict', () => {
    expect(assessFraming({ fps: 10, width: 720, height: 1280, frames: [{ t: 0, people: [] }] }, 'snatch')).toBeNull();
  });

  it('the phone pose of a real side-on squat snatch (21B27BAF) passes at the Python angle', () => {
    const gz = readFileSync(join(__dirname, '../../../cv/tests/fixtures/2026-10-05_21B27BAF.mp4.pose.json.gz'));
    const pose = JSON.parse(gunzipSync(gz).toString()) as PoseResult;
    const setup = { ...pose, frames: pose.frames.filter((f) => f.t < 1.5) };
    // cv off_side_pose on the same 45 frames: 6.4158835667
    expect(assessFraming(setup, 'snatch')).toEqual({ kind: 'ok', offDeg: expect.closeTo(6.4158835667, 6) });
  });
});

describe('roundedDeg', () => {
  it('says the angle in steps of 5', () => {
    expect([26, 43, 47.6, 90].map(roundedDeg)).toEqual([25, 45, 50, 90]);
  });
});
