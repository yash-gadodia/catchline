import type { TracePoint } from '../../analysis/types';
import { speedStats, barSpeed, peakIn } from './speed';

// A plate 0.05 of the picture's height in radius: 0.225 m is 0.05 of the height, so 1 picture height is 4.5 m.
const pt = (frame: number, y: number, r: number | undefined = 0.05): TracePoint => ({ frame, x: 0.5, y, src: 'plate', ...(r ? { r } : {}) });

describe('barSpeed', () => {
  it('turns the plate’s movement into metres a second by its own size', () => {
    // rising 0.01 of the height a frame at 30 fps: 0.045 m a frame, 1.35 m/s
    const path = Array.from({ length: 10 }, (_, f) => pt(f, 0.8 - 0.01 * f));
    const s = barSpeed(path, 30)!;
    expect(s.at.get(5)).toBeCloseTo(1.35, 2);
    expect(s.peak?.v).toBeCloseTo(1.35, 2);
  });

  it('keeps the scale when the plate comes nearer: the same picture movement on a bigger plate is slower', () => {
    const path = Array.from({ length: 10 }, (_, f) => pt(f, 0.8 - 0.01 * f, 0.1));
    expect(barSpeed(path, 30)!.at.get(5)).toBeCloseTo(0.68, 2);
  });

  it('is down negative, and the peak is the fastest upward frame inside the lift', () => {
    const ys = [0.8, 0.795, 0.785, 0.77, 0.75, 0.73, 0.72, 0.73, 0.75, 0.775];
    const path = ys.map((y, f) => pt(f, y));
    const s = barSpeed(path, 30, { startFrame: 0, endFrame: 6 })!;
    expect(s.at.get(7)).toBeCloseTo(-1.52, 2);
    // frames 3 and 4 both rise 0.065 of the height (0.29 m) in 4/30 s; the first is the peak
    expect(s.peak).toEqual({ frame: 3, v: 2.19 });
  });

  it('gives no number where the tracker jumped (faster than any barbell moves)', () => {
    const path = [0.8, 0.79, 0.78, 0.4, 0.39, 0.38, 0.37, 0.36, 0.35].map((y, f) => pt(f, y));
    const s = barSpeed(path, 30)!;
    expect([2, 3, 4].map((f) => s.at.has(f))).toEqual([false, false, false]);
    expect(s.at.get(5)).toBeCloseTo(1.35, 2);
  });

  it('is nothing without plate readings (a body-only result, a lift from before 4.0)', () => {
    expect(barSpeed(Array.from({ length: 10 }, (_, f) => pt(f, 0.8 - 0.01 * f, 0)), 30)).toBeNull();
  });
});

// #253: a snatch at 30 fps whose pull peaks at 2.0 m/s, caught overhead, then dropped (down 2.0 m/s) and bouncing
// back up off the floor at 2.2 m/s, all inside the lift window (put-down plus a second). Each entry is the bar's
// speed over one frame step, integrated into the plate's height (a picture height is 4.5 m).
const dropped = (): TracePoint[] => {
  const steps = [
    ...new Array<number>(10).fill(0),
    ...Array.from({ length: 20 }, (_, i) => 2.0 * (1 - Math.abs(i - 9.5) / 10.5)),
    ...new Array<number>(10).fill(0),
    ...new Array<number>(15).fill(-2.0),
    ...new Array<number>(6).fill(2.2),
    ...new Array<number>(10).fill(0),
  ];
  let y = 0.8;
  const path = [pt(0, y)];
  steps.forEach((v, f) => {
    y -= v / 4.5 / 30;
    path.push(pt(f + 1, y));
  });
  return path;
};

describe('the peak is the pull, never the dropped bar bouncing (#253)', () => {
  it('reads the bounce faster than the pull, and still peaks on the pull', () => {
    // the pull's fastest four steps either side of frame 20 average 1.81 m/s; the bounce reads 2.2
    const path = dropped();
    const s = barSpeed(path, 30, { startFrame: 0, endFrame: path.length - 1 })!;
    expect(s.at.get(59)).toBeCloseTo(2.2, 2);
    expect(s.peak).toEqual({ frame: 20, v: 1.81 });
  });

  it('is the same with no lift window (the whole clip is the lift)', () => {
    expect(barSpeed(dropped(), 30)!.peak).toEqual({ frame: 20, v: 1.81 });
  });

  it('peaks each rep of a set on its own pull', () => {
    const path = dropped();
    const s = barSpeed(path, 30)!;
    expect(peakIn(s.at, path, 0, Infinity)).toBe(1.81);
    // a stretch that starts after the catch has no pull in it: no number, not the bounce
    expect(peakIn(s.at, path, 41, Infinity)).toBeNull();
  });
});

describe('speedStats', () => {
  it('gives the rep on screen its mean upward speed, slowest and fastest', () => {
    const at = new Map([[10, 0.5], [11, 1.5], [12, -2], [13, 1], [30, 3]]);
    expect(speedStats(at, 10, 14)).toEqual({ avgUp: 1, min: -2, max: 1.5 });
    expect(speedStats(at, 12, 13)).toEqual({ avgUp: undefined, min: -2, max: -2 });
    expect(speedStats(at, 14, 20)).toBeNull();
  });
});
