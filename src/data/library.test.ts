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

describe('toLift thumbnail for a lift moved over by an account transfer', () => {
  const apple = 'a2c7f0e4-5b1d-4a7e-9c3b-2f6d8e1a0b45';
  const moved = row({ id: '5d0b8c3e-7a21-4f6c-8e9d-1b2c3d4e5f60', user_id: apple, status: 'done', movement: 'clean', created_at: '2026-10-09T10:12:00Z' });
  const analysis = (catchImage: string | undefined) =>
    ({
      version: 1,
      id: moved.id,
      movement: 'clean',
      video: { uri: `anon/${moved.id}`, width: 608, height: 1080, fps: 30, frameCount: 90 },
      traceKind: 'bar',
      reps: [
        {
          index: 1,
          startFrame: 0,
          endFrame: 80,
          made: true,
          phases: [],
          keyFrames: [
            { phase: 'setup', frame: 1, image: undefined },
            { phase: 'catch', frame: 60, image: catchImage },
          ],
          path: [{ frame: 1, x: 0.5, y: 0.8 }],
        },
      ],
      bestRepIndex: 1,
      cue: null,
      measurements: [],
      failure: null,
    }) as unknown as Parameters<typeof toLift>[1];

  it('is the signed catch still even though the keyframe lives under the old user folder', () => {
    const url = 'https://x.supabase.co/storage/v1/object/sign/keyframes/anon/5d0b8c3e/r1-6-catch.jpg?token=t';
    const lift = toLift(moved, analysis(url));
    expect(lift.status).toBe('done');
    expect(lift.date).toBe('2026-10-09');
    expect(lift.thumb).toBe(url);
  });

  it('is unset, not a storage path, when the still could not be signed', () => {
    expect(toLift(moved, analysis(undefined)).thumb).toBeUndefined();
  });
});
