import { COMPARE_TARGETS, getAnalysis, horizontalCm, snatchMock, snatchMockLow, snatchMockMiss } from '.';
import { frameSource } from '../frames';
import { pointAt, repByIndex } from '../timeline';

describe('snatch mock fixture', () => {
  it('has three reps and a clear cue on rep 2 at the hip keyframe', () => {
    expect(snatchMock.reps.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(snatchMock.cue?.confidence).toBe('clear');
    expect(snatchMock.cue?.evidence.rep).toBe(2);
    expect(repByIndex(snatchMock, 2).keyFrames.find((k) => k.phase === 'transition')?.frame).toBe(422);
  });

  it('draws the evidence on the bar trace and its number matches the geometry', () => {
    const e = snatchMock.cue!.evidence;
    const onTrace = pointAt(repByIndex(snatchMock, 2).path, e.frame)!;
    expect(e.to.x).toBeCloseTo(onTrace.x, 4);
    expect(e.to.y).toBeCloseTo(onTrace.y, 4);
    expect(Math.round(horizontalCm(snatchMock, e.from, e.to))).toBe(e.value);
  });

  it('resolves every keyframe image to a bundled frame', () => {
    for (const rep of snatchMock.reps) {
      for (const k of rep.keyFrames) {
        expect(frameSource(k.image)).not.toBeNull();
        expect(frameSource(k.image, true)).not.toBeNull();
      }
    }
  });

  it('derives the low-confidence and miss variants from the same trace', () => {
    expect(snatchMockLow.cue?.confidence).toBe('worth_checking');
    expect(snatchMockLow.cue?.evidence.caption).toBe(`knee · ${snatchMockLow.cue?.evidence.value} cm fwd`);
    expect(snatchMockMiss.reps).toHaveLength(1);
    expect(snatchMockMiss.reps[0].made).toBe(false);
    expect(snatchMockMiss.cue?.evidence.caption).toBe(`turnover · bar ${snatchMockMiss.cue?.evidence.value} cm in front`);
  });

  it('builds compare targets with the agreed numbers', () => {
    const best = COMPARE_TARGETS.best.analysis.measurements.find((m) => m.id === 'bar_drift_hip');
    const last = COMPARE_TARGETS.last.analysis.measurements.find((m) => m.id === 'bar_drift_hip');
    expect(best?.value).toBe(2);
    expect(last?.value).toBe(8);
  });

  it('falls back to the mock for an unknown key', () => {
    expect(getAnalysis('nope').id).toBe('snatch-mock');
    expect(getAnalysis(['snatch-mock-low']).id).toBe('snatch-mock-low');
  });
});
