import type { Lift as LiftRow } from '../types/db';
import { FAILURE_COPY } from '../features/library/failures';
import { toLift } from './library';

const row = (over: Partial<LiftRow>): LiftRow =>
  ({
    id: '37a5e823-1da0-4e67-939e-363628b9436c',
    user_id: 'u1',
    movement: 'clean',
    load_kg: 80,
    status: 'failed',
    error: null,
    created_at: '2026-10-14T03:45:00Z',
    ...over,
  }) as LiftRow;

describe('toLift for a lift the worker failed (no analysis row)', () => {
  it('maps a worker error code to its failure', () => {
    const lift = toLift(row({ error: 'clip_unreadable' }), undefined);
    expect(lift.status).toBe('failed');
    expect(lift.failure).toEqual({ reason: 'clip_unreadable', message: FAILURE_COPY.clip_unreadable.title });
  });

  it('maps anything that is not a known code to unknown and never carries the raw text', () => {
    const raw = "CalledProcessError: Command '['ffprobe', '/Users/yash/catchline-worker/tmp/x/clip']' returned non-zero exit status 1.";
    const lift = toLift(row({ error: raw }), undefined);
    expect(lift.failure).toEqual({ reason: 'unknown', message: FAILURE_COPY.unknown.title });
    expect(JSON.stringify(lift)).not.toContain('ffprobe');
    expect(JSON.stringify(lift)).not.toContain('/Users/yash');
  });

  it('maps a failed row with no error to unknown', () => {
    expect(toLift(row({ error: null }), undefined).failure).toEqual({ reason: 'unknown', message: FAILURE_COPY.unknown.title });
  });

  // A lift the server has accepted is processing from the lifter's side; the library's
  // 'queued' (the row offers Unlock and opens the paywall) is only for a clip never sent.
  it('shows a server-queued row as processing, never as waiting for an unlock', () => {
    const lift = toLift(row({ status: 'queued', error: 'unknown' }), undefined);
    expect(lift.status).toBe('processing');
    expect(lift.failure).toBeUndefined();
    expect(toLift(row({ status: 'uploading', error: null }), undefined).status).toBe('queued');
  });
});
