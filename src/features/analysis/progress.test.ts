import type { Job } from '../../data/pipeline';
import { overallProgress } from './progress';

const job = (patch: Partial<Job>): Job => ({ id: 'job-1', movement: 'snatch', status: 'preparing', liftId: 'l', prepared: 0, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null, uri: 'file:///c.mov', device: true, stage: null, fraction: 0, ...patch }) as Job;

describe('overallProgress', () => {
  it('runs once from 0 to 1 across preparing and tracking, never going back', () => {
    expect(overallProgress(null)).toBeNull();
    expect(overallProgress(job({ status: 'preparing', prepared: 0.89 }))).toBeCloseTo(0.089, 5);
    expect(overallProgress(job({ status: 'analysing', fraction: 0 }))).toBeCloseTo(0.1, 5);
    expect(overallProgress(job({ status: 'analysing', fraction: 0.5 }))).toBeCloseTo(0.55, 5);
    expect(overallProgress(job({ status: 'done' }))).toBe(1);
    expect(overallProgress(job({ status: 'failed' }))).toBeNull();
  });
});
