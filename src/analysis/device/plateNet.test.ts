import { Peak, netTrack } from './plateNet';

const NONE: Peak = [NaN, NaN, NaN, NaN];
// the near plate rising 4 px a frame from (300, 900) at radius 60, the far plate 200 px to its right at radius 36
const near = (f: number, r = 60): Peak => [0.9, 300, 900 - 4 * f, r];
const far = (f: number): Peak => [0.95, 500, 900 - 4 * f, 36];
const hands = (n: number) => ({ a: Array.from({ length: n }, (_, f): [number, number] => [260, 900 - 4 * f]), b: Array.from({ length: n }, (_, f): [number, number] => [340, 900 - 4 * f]), bodyH: 200 });

// hands that stay where they are, at the plate's start
const still = (n: number) => ({ a: Array.from({ length: n }, (): [number, number] => [260, 900]), b: Array.from({ length: n }, (): [number, number] => [340, 900]), bodyH: 200 });

describe('netTrack', () => {
  it('follows the mark\'s plate, bridging a four-frame gap on a straight line', () => {
    const peaks = Array.from({ length: 30 }, (_, f) => (f >= 10 && f < 14 ? [far(f), NONE] : [far(f), near(f)]));
    const out = netTrack(peaks, { frame: 0, centre: [305, 895], r: 55 }, 30, hands(30))!;
    expect(out.centres.every((c) => c[0] === 300)).toBe(true);
    expect(out.centres[12]).toEqual([300, 852]);
  });

  it('leaves a gap longer than six frames empty, and stops after half a second unseen rather than take the far plate', () => {
    const peaks = Array.from({ length: 60 }, (_, f) => (f >= 10 && f < 18 ? [far(f)] : f >= 30 ? [far(f)] : [far(f), near(f)]));
    const out = netTrack(peaks, { frame: 0, centre: [300, 900], r: 60 }, 30, hands(60))!;
    expect(out.centres.map((c) => Number.isFinite(c[0]))).toEqual(Array.from({ length: 60 }, (_, f) => f < 10 || (f >= 18 && f < 30)));
  });

  it('keeps a plate that shrinks by 45% over a second overhead', () => {
    const peaks = Array.from({ length: 30 }, (_, f) => [near(f, 60 * (1 - (0.45 * f) / 29))]);
    const out = netTrack(peaks, { frame: 0, centre: [300, 900], r: 60 }, 30, hands(30))!;
    expect(out.radii[29]).toBeCloseTo(33, 5);
    expect(out.centres.every((c) => c[0] === 300)).toBe(true);
  });

  it('without a mark starts on the largest sure plate on the line of the hands, and finds nothing when none is', () => {
    const peaks = Array.from({ length: 30 }, (_, f) => [far(f), [0.9, 300, 300, 60] as Peak, near(f)]);
    expect(netTrack(peaks, null, 30, hands(30))!.centres[20]).toEqual([300, 820]);
    expect(netTrack(Array.from({ length: 30 }, () => [[0.9, 900, 100, 50] as Peak]), null, 30, hands(30))).toBeNull();
  });

  it('draws nothing for a plate that rises while the hands stay still (a pull-up\'s body, not a barbell)', () => {
    const peaks = Array.from({ length: 30 }, (_, f) => [near(f)]);
    expect(netTrack(peaks, { frame: 0, centre: [300, 900], r: 60 }, 30, still(30))).toBeNull();
  });

  it('stops drawing the plate once it falls away from the hands', () => {
    // up with the hands for 30 frames, then the bar is dropped: it falls 20 px a frame while the hands stay up
    const y = (f: number) => (f < 30 ? 900 - 4 * f : 780 + 20 * (f - 30));
    const peaks = Array.from({ length: 45 }, (_, f) => [[0.9, 300, y(f), 60] as Peak]);
    const hands = { a: Array.from({ length: 45 }, (_, f): [number, number] => [260, 900 - 4 * Math.min(f, 30)]), b: Array.from({ length: 45 }, (_, f): [number, number] => [340, 900 - 4 * Math.min(f, 30)]), bodyH: 200 };
    const out = netTrack(peaks, { frame: 0, centre: [300, 900], r: 60 }, 30, hands)!;
    expect(out.centres.map((c) => Number.isFinite(c[0]))).toEqual(Array.from({ length: 45 }, (_, f) => f <= 36));
  });

  it('keeps a plate held still in the hands below the shoulders, and drops it when the hands hang above the shoulders', () => {
    const peaks = Array.from({ length: 60 }, () => [[0.9, 300, 900, 60] as Peak]);
    const grip = (shoulderY: number) => ({ ...still(60), shoulders: Array.from({ length: 60 }, (): [number, number] => [300, shoulderY]) });
    expect(netTrack(peaks, { frame: 0, centre: [300, 900], r: 60 }, 30, grip(700))!.centres.every((c) => c[0] === 300)).toBe(true);
    expect(netTrack(peaks, { frame: 0, centre: [300, 900], r: 60 }, 30, grip(1000))).toBeNull();
  });
});
