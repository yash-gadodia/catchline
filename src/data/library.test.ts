import type { Lift as LiftRow } from '../types/db';
import { FAILURE_COPY } from '../features/library/failures';
import { dayOf, toCue, toLift } from './library';

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

  it('leaves failure unset for a queued row that happens to carry a retry error', () => {
    const lift = toLift(row({ status: 'queued', error: 'unknown' }), undefined);
    expect(lift.status).toBe('queued');
    expect(lift.failure).toBeUndefined();
  });
});

describe('toCue for a real cues row', () => {
  const cueRow = {
    id: '6c1d2e3f-0000-4000-8000-000000000001',
    user_id: 'u1',
    movement: 'snatch',
    fault_id: 'jump_forward',
    text: 'Land on the line you started on.',
    why: 'Your feet landed 9 cm in front of where they started.',
    status: 'trying',
    sessions: 3,
    first_lift_id: 'lift-1',
    last_lift_id: 'lift-3',
    created_at: '2026-10-10T02:00:00Z',
    updated_at: '2026-10-13T02:00:00Z',
  };

  it('keeps the fault id as the metric, the why, the server session count and the lift span', () => {
    const cue = toCue(cueRow, new Map());
    expect(cue).toMatchObject({
      id: cueRow.id,
      movement: 'snatch',
      metricId: 'jump_forward',
      text: 'Land on the line you started on.',
      why: 'Your feet landed 9 cm in front of where they started.',
      status: 'trying',
      sessionsDone: 3,
      sessionsTarget: 6,
      firstLiftId: 'lift-1',
      lastLiftId: 'lift-3',
      endedAt: undefined,
    });
    expect(cue.givenAt).toBe(dayOf('2026-10-10T02:00:00Z'));
  });

  it('dates the end of a cue that is no longer being tried and survives deleted lifts', () => {
    const cue = toCue({ ...cueRow, status: 'stuck', first_lift_id: null, last_lift_id: null }, new Map());
    expect(cue.status).toBe('stuck');
    expect(cue.endedAt).toBe(dayOf('2026-10-13T02:00:00Z'));
    expect(cue.before.image).toBe('');
    expect(cue.after.image).toBe('');
  });
});
