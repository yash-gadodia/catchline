import type { Lift as LiftRow } from '../types/db';
import { FAILURE_COPY } from '../features/library/failures';
import { dayOf, toCue, toLift, toSession } from './library';

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

describe('toSession', () => {
  it('leaves out what the clip could not measure, so a trend never plots a 0', () => {
    const a = {
      reps: [],
      measurements: [
        { id: 'bar_speed', label: 'Peak bar speed', value: 0, unit: 'm/s', frame: 1, status: 'not_seen', note: '' },
        { id: 'jump_forward', label: 'Jumped forward', value: 6, unit: 'cm', frame: 1, status: 'cue', note: '' },
      ],
    } as unknown as Parameters<typeof toSession>[1];
    expect(toSession(row({ status: 'done' }), a).values).toEqual({ jump_forward: 6 });
  });

  it('carries the analysis version, absent on lifts measured before it was stamped', () => {
    const a = { reps: [], measurements: [] } as unknown as Parameters<typeof toSession>[1];
    expect(toSession(row({ status: 'done' }), { ...a, analysisVersion: 'cv-2026.10.16' }).analysisVersion).toBe('cv-2026.10.16');
    expect(toSession(row({ status: 'done' }), a).analysisVersion).toBeUndefined();
  });
});
