import { snatchMock, snatchMockMiss } from '../../analysis/fixtures';
import { detectedMade, madeCounts, setMade, useMadeLog } from './madeLog';
import type { Lift } from './types';

beforeEach(() => useMadeLog.setState({ made: {} }));

const lift = (id: string, made?: boolean): Lift => ({ id, movement: 'snatch', date: '2026-10-25', status: 'done', analysisId: `a-${id}`, made });

describe('made/missed log', () => {
  it('reads the best rep, by its 1-based index, as detected', () => {
    expect(detectedMade(snatchMock)).toBe(true);
    expect(detectedMade(snatchMockMiss)).toBe(false);
    const one = { ...snatchMock, reps: [{ ...snatchMock.reps[0], index: 1, made: false }], bestRepIndex: 1 };
    expect(detectedMade(one)).toBe(false);
    expect(detectedMade({ ...snatchMock, failure: { reason: 'unknown' as const, message: '' } })).toBeNull();
  });

  it('counts made and missed, the lifter call over the detection', () => {
    const lifts = [lift('1', true), lift('2', false), lift('3', true), lift('4')];
    expect(madeCounts(lifts, useMadeLog.getState().made)).toEqual({ made: 2, missed: 1 });
    setMade('a-1', false);
    setMade('a-4', true);
    expect(madeCounts(lifts, useMadeLog.getState().made)).toEqual({ made: 2, missed: 2 });
  });
});
