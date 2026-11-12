import { snatchMock } from '../../analysis/fixtures';
import type { Analysis } from '../../analysis/types';
import { liftCsv } from './csv';

const path = [0, 1, 2, 3, 4, 5].map((frame) => ({ frame, x: 0.5, y: 0.8 - 0.01 * frame, src: 'plate' as const, r: 0.05 }));
const lift = (more: Partial<Analysis> = {}): Analysis => ({ ...snatchMock, video: { ...snatchMock.video, fps: 30 }, lift: undefined, reps: [{ ...snatchMock.reps[0], path }], ...more });

describe('liftCsv', () => {
  it('is one row a frame: time, position, bar speed where it was measured, and the source', () => {
    expect(liftCsv(lift()).split('\n')).toEqual([
      'frame,time_s,x,y,bar_speed_m_s,source',
      '0,0.000,0.5000,0.8000,,plate',
      '1,0.033,0.5000,0.7900,,plate',
      '2,0.067,0.5000,0.7800,1.35,plate',
      '3,0.100,0.5000,0.7700,1.35,plate',
      '4,0.133,0.5000,0.7600,,plate',
      '5,0.167,0.5000,0.7500,,plate',
      '',
    ]);
  });

  it('keeps to the lift when one is marked', () => {
    const rows = liftCsv(lift({ lift: { startFrame: 2, endFrame: 3 } })).trim().split('\n');
    expect(rows.map((r) => r.split(',')[0])).toEqual(['frame', '2', '3']);
  });
});
