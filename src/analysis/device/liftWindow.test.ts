import { liftWindow } from './liftWindow';

// hands' height above the feet in standing heights, 30 fps: seconds of each level in turn
const clip = (...parts: [number, number][]) => parts.flatMap(([v, s]) => new Array<number>(Math.round(s * 30)).fill(v));

describe('liftWindow', () => {
  it('cuts a snatch to the pick-up through the bar coming down from overhead', () => {
    // walks up with arms hanging (4 s), sets up on the bar (3 s), lifts and holds overhead (3 s), drops and stands (5 s)
    const h = clip([0.45, 4], [0.15, 3], [1.1, 3], [0.45, 5]);
    expect(liftWindow(h, 30)).toEqual({ startFrame: 210 - 1 - 36, endFrame: 300 - 1 + 30 });
  });

  it('keeps every rep of a set of deadlifts, and three seconds of a last stand that is not lowered', () => {
    const h = clip([0.45, 3], [0.15, 2], [0.46, 1], [0.15, 1], [0.46, 1], [0.15, 1], [0.45, 8]);
    // first leaves the floor at 5 s; the hands leave it for the last time at 9 s (a rep or just standing up)
    expect(liftWindow(h, 30)).toEqual({ startFrame: 150 - 1 - 36, endFrame: 270 + 90 + 30 });
  });

  it('leaves a clip alone when nothing is picked up from low, or when the lift is nearly the whole clip', () => {
    expect(liftWindow(clip([0.9, 2], [0.5, 2], [0.9, 2]), 30)).toBeNull();
    expect(liftWindow(clip([0.15, 1], [1.1, 2], [0.45, 0.4]), 30)).toBeNull();
    expect(liftWindow([], 30)).toBeNull();
  });

  it('runs to the end of a clip cut off while the bar is still up, and ignores unseen frames', () => {
    const h = clip([0.45, 4], [0.15, 2], [NaN, 0.2], [0.5, 3]);
    expect(liftWindow(h, 30)).toEqual({ startFrame: 180 - 1 - 36, endFrame: h.length - 1 });
  });
});
