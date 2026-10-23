import { chordOffset, hspuEvents, timingError } from './gym';
import { findLifts, restThenRise, runs } from './phases';

// heights in torso lengths (t = 1), 30 fps: knee 1.0, hip 2.0, shoulders 3.0, head 3.4
const fps = 30;
const seg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
const flat = (v: number, n: number) => new Array<number>(n).fill(v);
const knee = (n: number) => flat(1.0, n);
const sho = (n: number) => flat(3.0, n);
const holdsOf = (bar: number[]) => runs(bar.map((v) => v > 3.4), 9);

describe('rest-then-rise lifts', () => {
  it('finds a hang snatch (no wrists below the knees) and calls it hang', () => {
    // standing with the bar at the hips, lowered to just above the knees, a pause, the pull, a hold overhead
    const bar = [...flat(2.0, 30), ...seg(2.0, 1.3, 15), ...flat(1.3, 10), ...seg(1.3, 4.2, 20), ...flat(4.2, 30), ...seg(4.2, 2.0, 20)];
    const lifts = findLifts(holdsOf(bar), bar, knee(bar.length), sho(bar.length), 1, fps);
    expect(lifts).toEqual([{ window: [53, 111, 69], startClass: 'hang' }]);
  });

  it('keeps the floor lift where production started it, at the last frame below the knees', () => {
    const bar = [...flat(0.5, 30), ...seg(0.5, 4.2, 25), ...flat(4.2, 30)];
    const lifts = findLifts(holdsOf(bar), bar, knee(bar.length), sho(bar.length), 1, fps);
    expect(lifts).toEqual([{ window: [32, 84, 49], startClass: 'floor' }]);
  });

  it('takes a re-dip overhead with no new start as the same lift', () => {
    const bar = [...flat(0.5, 30), ...seg(0.5, 4.2, 25), ...flat(4.2, 15), ...seg(4.2, 3.0, 5), ...flat(3.0, 10), ...seg(3.0, 4.2, 5), ...flat(4.2, 15)];
    const lifts = findLifts(holdsOf(bar), bar, knee(bar.length), sho(bar.length), 1, fps);
    expect(lifts.map((l) => l.window)).toEqual([[32, 104, 49]]);
  });

  it('finds touch-and-go hang reps, starting the next at the bottom of the dip', () => {
    const bar = [...flat(2.0, 30), ...seg(2.0, 1.3, 15), ...flat(1.3, 10), ...seg(1.3, 4.2, 20), ...flat(4.2, 30), ...seg(4.2, 1.5, 20), ...seg(1.5, 4.2, 20), ...flat(4.2, 30)];
    const lifts = findLifts(holdsOf(bar), bar, knee(bar.length), sho(bar.length), 1, fps);
    expect(lifts).toEqual([
      { window: [53, 109, 69], startClass: 'hang' },
      { window: [124, 174, 139], startClass: 'hang' },
    ]);
  });

  it('chains touch-and-go reps only after a lift from the hang', () => {
    const bar = [...flat(0.5, 30), ...seg(0.5, 4.2, 25), ...flat(4.2, 30), ...seg(4.2, 1.5, 20), ...seg(1.5, 4.2, 20), ...flat(4.2, 30)];
    const lifts = findLifts(holdsOf(bar), bar, knee(bar.length), sho(bar.length), 1, fps);
    expect(lifts.map((l) => l.startClass)).toEqual(['floor']);
  });

  it('needs the bar to rest before the rise', () => {
    const bar = [...seg(1.3, 4.2, 20), ...flat(4.2, 20)];
    expect(restThenRise(bar, 1, fps, 0, 19)).toBeNull();
    expect(restThenRise([...flat(1.3, 10), ...bar], 1, fps, 0, 29)).toBe(8);
  });
});

describe('kipping HSPU', () => {
  it('finds the bottom, tuck, drive, press and lockout between two lockouts', () => {
    const shoH = [5, 4, 3, 2, 1, 2, 3, 4, 5];
    const hip = [170, 150, 120, 80, 70, 90, 140, 170, 175];
    const kneeA = [170, 160, 120, 60, 50, 90, 160, 175, 175];
    const elbow = [170, 150, 120, 90, 80, 110, 150, 165, 170];
    expect(hspuEvents(shoH, hip, kneeA, elbow, 0, 8)).toEqual({ top0: 0, bottom: 4, tuck: 4, drive: 5, press: 5, lockout: 7, top1: 8 });
    expect(timingError(5, 5, fps)).toBe(0);
    expect(timingError(10, 2, fps)).toBeCloseTo(8 / 30, 9);
  });

  it('measures the hip off the shoulder-ankle line toward the side away from the wall', () => {
    expect(chordOffset([0, 0], [3, 50], [0, 100], 1)).toBe(3);
    expect(chordOffset([0, 0], [3, 50], [0, 100], -1)).toBe(-3);
  });
});
