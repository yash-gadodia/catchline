import { barTrack, fusePath, median3, onPlate } from './geometry';
import { Pt } from './num';

describe('the bar from the hands', () => {
  it('drops a one-frame wrist flip with the 3-frame median', () => {
    const p: Pt[] = [[0, 10], [0, 11], [40, 12], [0, 13], [0, 14]];
    expect(median3(p)).toEqual([[0, 10], [0, 11], [0, 12], [0, 13], [0, 14]]);
  });

  it('leaves out a frame that jumps a quarter body off the bar, then follows the wrists again after 3', () => {
    const lw: Pt[] = [[0, 0], [0, 1], [0, 2], [0, 3], [60, 3], [60, 3], [60, 3], [60, 3], [60, 3], [60, 3]];
    const bar = barTrack(lw, lw, 100);
    expect(bar.map((p) => (Number.isNaN(p[0]) ? null : p[0]))).toEqual([0, 0, 0, 0, null, null, null, 60, 60, 60]);
  });

  it('keeps the wrist that continues the bar when the two disagree in height', () => {
    const lw: Pt[] = [[0, 0], [0, 0], [0, 0], [0, 0]];
    const rw: Pt[] = [[2, 0], [2, 0], [2, 40], [2, 40]];
    expect(barTrack(lw, rw, 100)).toEqual([[1, 0], [1, 0], [1, 0], [1, 0]]);
  });

  it('keeps a lone wrist where the midpoint was across the frame, so a grip apart off side-on is not a bar move', () => {
    const lw: Pt[] = [[400, 700], [400, 600], [400, 500], [400, 400], [400, 300]];
    const rw: Pt[] = [[660, 700], [660, 660], [660, 630], [660, 600], [660, 570]];
    expect(barTrack(lw, rw, 1000).map((p) => p[0])).toEqual([530, 530, 530, 530, 530]);
  });

  it('keeps the midpoint across when the grip looks wider as the bar rises off side-on', () => {
    const lw: Pt[] = [[400, 700], [400, 600], [410, 500], [420, 400], [430, 300]];
    const rw: Pt[] = [[660, 700], [660, 660], [690, 630], [720, 600], [750, 570]];
    expect(barTrack(lw, rw, 1000).map((p) => p[0])).toEqual([530, 530, 550, 570, 590]);
  });

  it('falls back to the lone wrist when the other is read far more than a grip away', () => {
    const lw: Pt[] = [[400, 700], [400, 600], [400, 500], [400, 400], [400, 300]];
    const rw: Pt[] = [[660, 700], [660, 660], [1000, 630], [1000, 600], [1000, 570]];
    expect(barTrack(lw, rw, 1000).map((p) => p[0])).toEqual([530, 530, 530, 530, 530]);
  });
});

describe('the drawn bar path from the plate, the wrists filling its gaps', () => {
  const N: Pt = [NaN, NaN];

  it('keeps the plate where it was seen and shifts the wrists by the plate-to-wrist offset, interpolated across a gap', () => {
    const plate: Pt[] = [[10, 0], N, N, [16, 3], N];
    const wrist: Pt[] = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]];
    expect(fusePath(plate, wrist)).toEqual({
      path: [[10, 0], [12, 1], [14, 2], [16, 3], [17, 4]],
      plate: [true, false, false, true, false],
    });
  });

  it('holds the first offset before the plate is found', () => {
    expect(fusePath([N, [5, 5]], [[0, 0], [1, 1]]).path).toEqual([[4, 4], [5, 5]]);
  });

  it('is the wrist path when the plate was never seen', () => {
    const wrist: Pt[] = [[0, 0], [1, 1]];
    expect(fusePath([N, N], wrist)).toEqual({ path: wrist, plate: [false, false] });
  });
});

describe('which followed plate frames are on the plate', () => {
  type Fit = [number, number, number, number];
  const n = 8;
  const wrists: Pt[] = Array.from({ length: n }, (_, f): Pt => [100, 100 - 10 * f]);
  const centres: Pt[] = wrists.map(([x, y]): Pt => [x, y + 50]);
  const good: Fit = [100, 0.7, 0.8, 30];
  const fits = (at: Record<number, Fit>) => Array.from({ length: n }, (_, f): Fit => at[f] ?? good);
  const detected = new Array<number>(n).fill(1);
  const all = [true, true, true, true, true, true, true, true];

  it('keeps a run of frames that look like the setup plate', () => {
    expect(onPlate(detected, fits({}), centres, wrists, 0)).toEqual(all);
  });

  it('drops frames whose rim is weak and of mixed polarity, a window frame or a silhouette, but keeps a strong rim', () => {
    const mixed: Fit = [100, 0.4, 0.1, 30];
    expect(onPlate(detected, fits({ 4: mixed, 5: mixed, 6: mixed, 7: mixed }), centres, wrists, 0)).toEqual([true, true, true, true, false, false, false, false]);
    const strong: Fit = [100, 0.6, 0.1, 30];
    expect(onPlate(detected, fits({ 4: strong, 5: strong, 6: strong, 7: strong }), centres, wrists, 0)).toEqual(all);
  });

  it('rides out one blurred frame, the evidence taken as a median over neighbours', () => {
    expect(onPlate(detected, fits({ 3: [100, 0.1, 0, 30] }), centres, wrists, 0)).toEqual(all);
  });

  it('drops a stretch whose inside is far from the setup plate grey, a one-sided edge against a bright window', () => {
    const bright: Fit = [100, 0.7, 0.8, 140];
    expect(onPlate(detected, fits({ 4: bright, 5: bright, 6: bright, 7: bright }), centres, wrists, 0)).toEqual([true, true, true, true, false, false, false, false]);
  });

  it('drops a plate that grew past the setup size, shrank, wandered off the hands or slid onto them', () => {
    expect(onPlate(detected, fits({ 7: [140, 0.7, 0.8, 30] }), centres, wrists, 0)).toEqual([true, true, true, true, true, true, true, false]);
    expect(onPlate(detected, fits({ 7: [85, 0.7, 0.8, 30] }), centres, wrists, 0)).toEqual([true, true, true, true, true, true, true, false]);
    const far = centres.map(([x, y], f): Pt => (f >= 4 ? [x + 160, y] : [x, y]));
    expect(onPlate(detected, fits({}), far, wrists, 0)).toEqual([true, true, true, true, false, false, false, false]);
    const onHands = centres.map(([x, y], f): Pt => (f >= 4 ? [x, y - 45] : [x, y]));
    expect(onPlate(detected, fits({}), onHands, wrists, 0)).toEqual([true, true, true, true, false, false, false, false]);
  });

  it('draws nothing from flow-carried frames, which bridge a run without breaking it, and drops runs under four frames', () => {
    expect(onPlate([1, 1, 1, 0, 1, 1, 1, 1], fits({}), centres, wrists, 0)).toEqual([false, false, false, false, true, true, true, true]);
    expect(onPlate([1, 1, 2, 2, 1, 1, 2, 2], fits({}), centres, wrists, 0)).toEqual([true, true, false, false, true, true, false, false]);
  });

  it('drops a run whose plate does not move with the hands', () => {
    const still = centres.map(([x]): Pt => [x, 150]);
    expect(onPlate(detected, fits({}), still, wrists, 0)).toEqual(new Array<boolean>(n).fill(false));
    const resting: Pt[] = Array.from({ length: n }, (): Pt => [100, 100]);
    expect(onPlate(detected, fits({}), resting.map(([x, y]): Pt => [x, y + 50]), resting, 0)).toEqual(all);
  });
});
