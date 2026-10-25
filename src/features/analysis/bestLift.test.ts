import { snatchMock } from '../../analysis/fixtures';
import type { Analysis } from '../../analysis/types';
import type { Lift } from '../library/types';
import { aligner, bestLiftFor } from './bestLift';

const lift = (id: string, o: Partial<Lift>): Lift => ({ id, movement: 'snatch', date: '2026-10-01', status: 'done', analysisId: id, made: true, ...o });

describe('the lifter\'s best lift', () => {
  const today = { ...snatchMock, id: 'today' };

  it('is the heaviest made lift of the movement, newest on a tie, never today\'s', () => {
    const lifts = [
      lift('today', { loadKg: 90 }),
      lift('a', { loadKg: 70 }),
      lift('b', { loadKg: 75, made: false }),
      lift('c', { loadKg: 70, date: '2026-10-05' }),
      lift('d', { loadKg: 100, movement: 'clean' }),
      lift('e', { loadKg: 72, status: 'failed' }),
    ];
    expect(bestLiftFor(today, lifts, {})?.id).toBe('c');
    expect(bestLiftFor(today, lifts, { b: true })?.id).toBe('b');
    expect(bestLiftFor(today, lifts, { a: false, c: false })).toBeUndefined();
  });

  it('lines the other path up on today\'s start, sized by the two scales', () => {
    const other = { ...snatchMock, pxPerCm: 2, video: { ...snatchMock.video, width: 1000, height: 1000 } } as Analysis;
    const mine = { ...snatchMock, pxPerCm: 4, video: { ...snatchMock.video, width: 2000, height: 1000 } } as Analysis;
    const map = aligner(other, mine, { x: 0.5, y: 0.8 }, { x: 0.4, y: 0.9 });
    expect(map({ x: 0.5, y: 0.8 })).toEqual({ x: 0.4, y: 0.9 });
    const p = map({ x: 0.55, y: 0.6 });
    expect([+p.x.toFixed(3), +p.y.toFixed(3)]).toEqual([0.45, 0.5]);
  });
});
