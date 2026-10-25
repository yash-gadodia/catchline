import { elbows } from './body';
import { overheadLockout } from './lifts';
import { JOINTS, K, L_ELB, L_SHO, L_WRI, R_ELB, R_SHO, R_WRI } from './movement';
import { Pt, fmax } from './num';

// A side-on lifter's arm, shoulder fixed, the upper arm and forearm 30 px each, frame by frame from the elbow angle
// (180 = locked) and how far the upper arm is raised from hanging (180 = straight up).
const arm = (elbowDeg: number, raiseDeg: number): [Pt, Pt, Pt] => {
  const sho: Pt = [500, 400];
  const r = (raiseDeg * Math.PI) / 180;
  const elb: Pt = [sho[0] + 30 * Math.sin(r), sho[1] + 30 * Math.cos(r)];
  const f = r + ((180 - elbowDeg) * Math.PI) / 180;
  return [sho, elb, [elb[0] + 30 * Math.sin(f), elb[1] + 30 * Math.cos(f)]];
};
const lerp = (keys: [number, number][]): number[] => {
  const out = [keys[0][0]];
  for (let i = 1; i < keys.length; i++) for (let s = 1; s <= keys[i][1]; s++) out.push(keys[i - 1][0] + ((keys[i][0] - keys[i - 1][0]) * s) / keys[i][1]);
  return out;
};
function trace(elbow: [number, number][], raise: [number, number][]): { el: number[]; overhead: boolean[] } {
  const e = lerp(elbow);
  const u = lerp(raise);
  const k: K = e.map((d, i) => {
    const row: Pt[] = Array.from({ length: JOINTS }, (): Pt => [0, 0]);
    const [s, el, w] = arm(d, u[i]);
    [row[L_SHO], row[L_ELB], row[L_WRI]] = [s, el, w];
    [row[R_SHO], row[R_ELB], row[R_WRI]] = [s, el, w];
    return row;
  });
  return { el: fmax(...elbows(k)), overhead: k.map((r) => r[L_WRI][1] < r[L_SHO][1] - 40) };
}

describe('overheadLockout: the jerk received overhead', () => {
  const raise: [number, number][] = [[20, 0], [20, 6], [180, 6], [180, 30]];

  it('a clean lockout: the elbows lock as the bar arrives and stay locked, no press-out', () => {
    const { el, overhead } = trace([[60, 0], [60, 6], [178, 6], [178, 30]], raise);
    const r = overheadLockout(el, overhead, 12, 41);
    expect(r.pressOut).toBeLessThan(1);
    expect(r.lock).toBe(12);
  });

  it('a press-out: locked, the elbows re-bend to 140 deg overhead, then straighten again', () => {
    const { el, overhead } = trace([[60, 0], [60, 6], [178, 6], [178, 2], [140, 6], [178, 6], [178, 12]], raise);
    const r = overheadLockout(el, overhead, 12, 41);
    expect(Math.round(r.pressOut)).toBe(38);
    expect(r.bent).toBe(20);
    expect(r.lock).toBe(24);
  });

  it('arrives bent and is pressed out: the dip is measured from the landing', () => {
    const { el, overhead } = trace([[60, 0], [60, 6], [150, 6], [150, 3], [178, 8], [178, 18]], raise);
    const r = overheadLockout(el, overhead, 12, 41);
    expect(Math.round(r.pressOut)).toBe(28);
    expect(r.lock).toBe(20);
  });

  it('lowering the bar after the lift is not a press-out', () => {
    const { el, overhead } = trace([[60, 0], [60, 6], [178, 6], [178, 12], [120, 8], [120, 10]], [[20, 0], [20, 6], [180, 6], [180, 30]]);
    expect(overheadLockout(el, overhead, 12, 41).pressOut).toBeLessThan(1);
  });

  it('never overhead: nothing to judge', () => {
    const { el, overhead } = trace([[60, 0], [60, 41]], [[20, 0], [20, 41]]);
    expect(overheadLockout(el, overhead, 12, 41)).toEqual({ pressOut: 0, bent: 12, lock: null });
  });
});
