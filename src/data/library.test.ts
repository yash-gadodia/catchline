import type { Lift as LiftRow } from '../types/db';
import { FAILURE_COPY } from '../features/library/failures';
import { dayOf, toLift } from './library';

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

describe('toLift for a lift analysed on the phone (3.1)', () => {
  const now = Date.parse('2026-10-14T03:50:00Z');

  it('shows an analysing row as processing', () => {
    const lift = toLift(row({ status: 'analysing', error: null }), undefined, now);
    expect(lift.status).toBe('processing');
    expect(lift.failure).toBeUndefined();
  });

  it('treats a lift left analysing for over 15 minutes as a failed upload', () => {
    const lift = toLift(row({ status: 'analysing', error: null }), undefined, now + 16 * 60 * 1000);
    expect(lift.status).toBe('failed');
    expect(lift.failure?.reason).toBe('unknown');
  });

});

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
  });

  // 'uploading' is a clip on its way (create_lift made the row), never the free-videos Unlock: Danielle's
  // stuck bar muscle-up read "Queued · free videos used" on a paid plan.
  it('shows an upload as processing, and one stuck past 15 min as an upload that did not finish', () => {
    const at = Date.parse('2026-10-14T03:45:00Z');
    expect(toLift(row({ status: 'uploading', error: null }), undefined, at + 60_000).status).toBe('processing');
    const stuck = toLift(row({ status: 'uploading', error: null }), undefined, at + 16 * 60_000);
    expect(stuck.status).toBe('failed');
    expect(stuck.failure).toEqual({ reason: 'unknown', message: "Upload didn't finish · film or import it again" });
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

describe('toLift for a lift tracked on this phone (4.0)', () => {
  const tracked = row({ id: 't1', status: 'done', error: null });
  const still = (name: string) => `file:///docs/lifts/t1/stills/${name}.jpg`;
  const analysis = (over: { path?: object[]; traceKind?: 'bar' | 'hip'; peak?: string | undefined }) =>
    ({
      version: 1,
      id: 't1',
      movement: 'snatch',
      video: { uri: '', width: 1080, height: 1920, fps: 60, frameCount: 300 },
      traceKind: over.traceKind ?? 'bar',
      reps: [
        {
          index: 1,
          startFrame: 0,
          endFrame: 299,
          made: false,
          phases: [],
          keyFrames: [
            { phase: 'setup', frame: 4, image: still('r1-1-setup') },
            { phase: 'peak', frame: 180, image: 'peak' in over ? over.peak : still('r1-2-peak') },
          ],
          path: over.path ?? [{ frame: 4, x: 0.5, y: 0.8, src: 'plate' }, { frame: 180, x: 0.5, y: 0.2, src: 'plate' }],
        },
      ],
      bestRepIndex: 1,
      cue: null,
      measurements: [],
      failure: null,
    }) as unknown as Parameters<typeof toLift>[1];

  it('has the bar path and the body, and the still from the top of the lift', () => {
    const lift = toLift(tracked, analysis({}));
    expect(lift.shows).toBe('bar');
    expect(lift.thumb).toBe(still('r1-2-peak'));
  });

  it('with no bar path drawn is body only and keeps its still', () => {
    const lift = toLift(tracked, analysis({ path: [] }));
    expect(lift.shows).toBe('body');
    expect(lift.thumb).toBe(still('r1-2-peak'));
  });

  it('is body only for a hanging movement, whose path is the hips', () => {
    expect(toLift(tracked, analysis({ traceKind: 'hip' })).shows).toBe('body');
  });

  it('falls back to the still it has when the last one is missing', () => {
    expect(toLift(tracked, analysis({ path: [], peak: undefined })).thumb).toBe(still('r1-1-setup'));
  });

  it('says nothing about what it shows while there is no analysis', () => {
    expect(toLift(row({ id: 't1', status: 'analysing', error: null }), undefined, Date.parse(tracked.created_at)).shows).toBeUndefined();
  });
});
