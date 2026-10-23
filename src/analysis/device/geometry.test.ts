import { barTrack, median3 } from './geometry';
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
    expect(barTrack(lw, rw, 100)).toEqual([[1, 0], [1, 0], [0, 0], [0, 0]]);
  });
});
