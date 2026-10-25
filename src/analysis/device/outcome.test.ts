import { peakUpSpeed, pullSpeed, speedMeasurements } from './outcome';

// A bar filmed at 4.4 px a cm and 30 fps (image y, down positive): still for 10 frames, then accelerating evenly to
// 1.8 m/s over 24 frames (the pull to full extension), then the turnover (from frame 35), where the wrists whip round the bar faster.
const PX_CM = 4.4;
const FPS = 30;
function bar(): number[] {
  const v = [...new Array(10).fill(0), ...Array.from({ length: 24 }, (_, i) => (1.8 * (i + 1)) / 24), 1.8, 3.2, 3.4, 1.0, 0];
  const y = [1200];
  for (let f = 1; f < v.length; f++) y.push(y[f - 1] - (((v[f - 1] + v[f]) / 2) * 100 * PX_CM) / FPS);
  return y;
}

describe('bar speed at a known scale', () => {
  const y = bar();

  it('reads the second pull peak, not the turnover', () => {
    const [peak, frame] = peakUpSpeed(y, FPS, PX_CM, 20, 33)!;
    expect(frame).toBe(33);
    expect(peak).toBeCloseTo(1.8, 1);
    expect(peakUpSpeed(y, FPS, PX_CM, 20, 37)![0]).toBeGreaterThan(2.5);
  });

  it('averages the pull as distance over time', () => {
    expect(+pullSpeed(y, FPS, PX_CM, 10, 33)!.toFixed(2)).toBe(0.94);
    expect(pullSpeed(y, FPS, PX_CM, 10, 11)).toBeNull();
    expect(pullSpeed(y, FPS, 0, 10, 33)).toBeNull();
  });

  it('shows the rows only on a trusted scale and a plausible reading', () => {
    const s = { peak: [1.8, 50] as [number, number], avg: 0.86, peakPct: 67.4 };
    const ok = speedMeasurements(s, true, { secondExt: 50, peak: 55 });
    expect(ok.map((r) => [r.id, r.value, r.unit, r.status])).toEqual([
      ['bar_speed', 1.8, 'm/s', 'normal'],
      ['bar_speed_avg', 0.86, 'm/s', 'normal'],
      ['bar_peak_pct', 67, '%', 'normal'],
    ]);
    expect(speedMeasurements(s, false, { secondExt: 50, peak: 55 }).map((r) => r.status)).toEqual(['not_seen', 'not_seen', 'not_seen']);
    const wild = speedMeasurements({ peak: [4.6, 50], avg: 3.5, peakPct: 140 }, true, { secondExt: 50, peak: 55 });
    expect(wild.map((r) => [r.status, r.note])).toEqual([
      ['not_seen', 'bar track too unsteady to time'],
      ['not_seen', 'bar track too unsteady to time'],
      ['not_seen', 'bar track too unsteady to time'],
    ]);
    expect(speedMeasurements({ peak: null, avg: null, peakPct: null }, true, { secondExt: 50, peak: 55 }).every((r) => r.status === 'not_seen')).toBe(true);
  });
});
