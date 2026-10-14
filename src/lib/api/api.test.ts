import { createLift, getAnalysis, liftsAhead, listAnalyses, listLifts, subscribeToLift } from './lifts';
import { listCues, updateCue } from './cues';
import { createCoachLink } from './coach';
import { deleteAccount, ensureSession, syncPlan } from './account';
import { ApiError } from './errors';
import { tusUpload } from './tus';
import { supabase } from '../supabase';

jest.mock('./tus', () => ({ tusUpload: jest.fn(async () => 'http://up/1') }));

function query(result: { data: unknown; error: unknown }) {
  const calls: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'lt', 'order', 'limit', 'update', 'insert']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return q;
    };
  }
  q.single = async () => result;
  q.maybeSingle = async () => result;
  q.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return { q, calls };
}

const channelHandlers: { change?: (p: { new: unknown }) => void; status?: (s: string) => void } = {};

type FakeChannel = { on: jest.Mock; subscribe: jest.Mock };

jest.mock('../supabase', () => {
  const channel: FakeChannel = {
    on: jest.fn((_e: string, _f: unknown, cb: (p: { new: unknown }) => void): FakeChannel => {
      channelHandlers.change = cb;
      return channel;
    }),
    subscribe: jest.fn((cb: (s: string) => void): FakeChannel => {
      channelHandlers.status = cb;
      return channel;
    }),
  };
  return {
    supabase: {
      rpc: jest.fn(),
      from: jest.fn(),
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(),
      storage: { from: jest.fn() },
      functions: { invoke: jest.fn(async () => ({ data: { success: true }, error: null })) },
      auth: {
        getSession: jest.fn(async () => ({ data: { session: { access_token: 'jwt-1' } } })),
        signInAnonymously: jest.fn(async () => ({ data: { user: { id: 'anon-2' } }, error: null })),
        signOut: jest.fn(async () => ({ error: null })),
      },
    },
  };
});

const mocked = supabase as unknown as {
  rpc: jest.Mock;
  from: jest.Mock;
  channel: jest.Mock;
  removeChannel: jest.Mock;
  storage: { from: jest.Mock };
  functions: { invoke: jest.Mock };
  auth: { getSession: jest.Mock; signInAnonymously: jest.Mock; signOut: jest.Mock };
};

const LIFT = { id: 'l1', user_id: 'u1', clip_path: 'u1/l1', status: 'uploading', movement: 'snatch' };
const ANALYSIS = {
  version: 1,
  id: 'l1',
  movement: 'snatch',
  video: { uri: 'u1/l1', width: 608, height: 1080, fps: 30, frameCount: 90 },
  traceKind: 'bar',
  reps: [
    {
      index: 1,
      startFrame: 0,
      endFrame: 80,
      made: true,
      phases: [],
      keyFrames: [
        { phase: 'setup', frame: 1, image: 'u1/l1/r1-1-setup.jpg' },
        { phase: 'catch', frame: 60, image: 'u1/l1/r1-6-catch.jpg' },
      ],
      path: [{ frame: 1, x: 0.5, y: 0.8 }],
    },
  ],
  bestRepIndex: 1,
  cue: null,
  measurements: [],
  failure: null,
};

beforeEach(() => jest.clearAllMocks());

describe('createLift', () => {
  it('reserves the lift, uploads to its clip_path over TUS, then enqueues it', async () => {
    mocked.rpc
      .mockResolvedValueOnce({ data: LIFT, error: null })
      .mockResolvedValueOnce({ data: { ...LIFT, status: 'queued' }, error: null });
    const file = new Blob([new Uint8Array(4)]);

    const lift = await createLift({ movement: 'snatch', loadKg: 70, file });

    expect(lift.status).toBe('queued');
    expect(mocked.rpc.mock.calls).toEqual([
      ['create_lift', { p_movement: 'snatch', p_load_kg: 70 }],
      ['enqueue_lift', { p_lift_id: 'l1' }],
    ]);
    const tus = (tusUpload as jest.Mock).mock.calls[0][0];
    expect(tus.endpoint).toBe('http://localhost:54321/storage/v1/upload/resumable');
    expect(tus.metadata).toEqual({
      bucketName: 'raw-clips',
      objectName: 'u1/l1',
      contentType: 'video/quicktime',
      cacheControl: '3600',
    });
    expect(tus.headers.authorization).toBe('Bearer jwt-1');
    expect(tus.file).toBe(file);
  });

  it('turns the server reason into a typed error and uploads nothing', async () => {
    mocked.rpc.mockResolvedValueOnce({ data: null, error: { message: 'cap_reached' } });
    await expect(createLift({ movement: 'snatch', file: new Blob([]) })).rejects.toEqual(new ApiError('cap_reached'));
    expect(tusUpload).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('listLifts orders newest first with a limit', async () => {
    const { q, calls } = query({ data: [LIFT], error: null });
    mocked.from.mockReturnValue(q);
    expect(await listLifts({ limit: 10 })).toEqual([LIFT]);
    expect(mocked.from).toHaveBeenCalledWith('lifts');
    expect(calls).toEqual([
      ['select', ['*']],
      ['order', ['created_at', { ascending: false }]],
      ['limit', [10]],
    ]);
  });

  it('getAnalysis swaps keyframe storage paths for signed URLs', async () => {
    mocked.from.mockReturnValue(query({ data: { analysis: ANALYSIS }, error: null }).q);
    const createSignedUrls = jest.fn(async () => ({
      data: [
        { path: 'u1/l1/r1-1-setup.jpg', signedUrl: 'http://signed/setup' },
        { path: 'u1/l1/r1-6-catch.jpg', signedUrl: 'http://signed/catch' },
      ],
      error: null,
    }));
    mocked.storage.from.mockReturnValue({ createSignedUrls });

    const a = await getAnalysis('l1');

    expect(mocked.storage.from).toHaveBeenCalledWith('keyframes');
    expect(createSignedUrls).toHaveBeenCalledWith(['u1/l1/r1-1-setup.jpg', 'u1/l1/r1-6-catch.jpg'], 3600);
    expect(a?.reps[0].keyFrames.map((k) => k.image)).toEqual(['http://signed/setup', 'http://signed/catch']);
  });

  it('listAnalyses drops a keyframe the signer refused instead of handing the app a bare storage path', async () => {
    // Two cleans moved over by an account transfer: their stills sit under the old
    // user folder. Storage signs what the caller may read and errors per path otherwise.
    const old = {
      ...ANALYSIS,
      id: 'l0',
      reps: [{ ...ANALYSIS.reps[0], keyFrames: [{ phase: 'catch', frame: 60, image: 'anon-1/l0/r1-6-catch.jpg' }] }],
    };
    mocked.from.mockReturnValue(
      query({ data: [{ lift_id: 'l0', analysis: old }, { lift_id: 'l1', analysis: ANALYSIS }], error: null }).q
    );
    const createSignedUrls = jest.fn(async () => ({
      data: [
        { path: null, signedUrl: null, error: 'Object not found' },
        { path: 'u1/l1/r1-1-setup.jpg', signedUrl: 'http://signed/setup' },
        { path: 'u1/l1/r1-6-catch.jpg', signedUrl: 'http://signed/catch' },
      ],
      error: null,
    }));
    mocked.storage.from.mockReturnValue({ createSignedUrls });

    const rows = await listAnalyses();

    expect(createSignedUrls).toHaveBeenCalledWith(['anon-1/l0/r1-6-catch.jpg', 'u1/l1/r1-1-setup.jpg', 'u1/l1/r1-6-catch.jpg'], 3600);
    expect(rows.map((r) => r.liftId)).toEqual(['l0', 'l1']);
    expect(rows[0].analysis.reps[0].keyFrames[0].image).toBeUndefined();
    expect(rows[1].analysis.reps[0].keyFrames.map((k) => k.image)).toEqual(['http://signed/setup', 'http://signed/catch']);
  });

  it('getAnalysis is null before the worker has written one', async () => {
    mocked.from.mockReturnValue(query({ data: null, error: null }).q);
    expect(await getAnalysis('l1')).toBeNull();
  });

  it('listCues filters by status, newest first', async () => {
    const { q, calls } = query({ data: [], error: null });
    mocked.from.mockReturnValue(q);
    await listCues({ status: ['trying', 'stuck'] });
    expect(calls).toEqual([
      ['select', ['*']],
      ['order', ['updated_at', { ascending: false }]],
      ['in', ['status', ['trying', 'stuck']]],
    ]);
  });
});

describe('writes', () => {
  it('updateCue writes only the status', async () => {
    const { q, calls } = query({ data: { id: 'c1', status: 'stuck' }, error: null });
    mocked.from.mockReturnValue(q);
    expect(await updateCue('c1', 'stuck')).toEqual({ id: 'c1', status: 'stuck' });
    expect(calls[0]).toEqual(['update', [{ status: 'stuck' }]]);
    expect(calls[1]).toEqual(['eq', ['id', 'c1']]);
  });

  it('createCoachLink calls the RPC with the expiry', async () => {
    mocked.rpc.mockResolvedValueOnce({ data: { token: 't'.repeat(32) }, error: null });
    expect((await createCoachLink('l1', 7)).token).toBe('t'.repeat(32));
    expect(mocked.rpc).toHaveBeenCalledWith('create_coach_link', { p_lift_id: 'l1', p_days: 7 });
  });

  it('createCoachLink surfaces lift_not_ready', async () => {
    mocked.rpc.mockResolvedValueOnce({ data: null, error: { message: 'lift_not_ready' } });
    await expect(createCoachLink('l1')).rejects.toEqual(new ApiError('lift_not_ready'));
  });
});

describe('liftsAhead', () => {
  it('asks the server how many lifts are queued before this one', async () => {
    mocked.rpc.mockResolvedValueOnce({ data: 2, error: null });
    expect(await liftsAhead('l1')).toBe(2);
    expect(mocked.rpc).toHaveBeenCalledWith('lifts_ahead', { p_lift_id: 'l1' });
  });

  it('surfaces lift_not_found', async () => {
    mocked.rpc.mockResolvedValueOnce({ data: null, error: { message: 'lift_not_found' } });
    await expect(liftsAhead('l1')).rejects.toEqual(new ApiError('lift_not_found'));
  });
});

describe('subscribeToLift', () => {
  it('emits the current row on subscribe, then updates, and fetches the analysis once when done', async () => {
    mocked.from
      .mockReturnValueOnce(query({ data: { ...LIFT, status: 'processing' }, error: null }).q)
      .mockReturnValueOnce(query({ data: { analysis: { ...ANALYSIS, reps: [] , failure: { reason: 'too_dark', message: 'm' } } }, error: null }).q);
    const lifts: string[] = [];
    const analyses: (string | undefined)[] = [];

    const off = subscribeToLift('l1', {
      onLift: (l) => lifts.push(l.status),
      onAnalysis: (a) => analyses.push(a?.failure?.reason),
    });
    expect(mocked.channel).toHaveBeenCalledWith('lift:l1');

    channelHandlers.status?.('SUBSCRIBED');
    await new Promise((r) => setTimeout(r, 0));
    channelHandlers.change?.({ new: { ...LIFT, status: 'failed' } });
    channelHandlers.change?.({ new: { ...LIFT, status: 'failed' } });
    await new Promise((r) => setTimeout(r, 0));

    expect(lifts).toEqual(['processing', 'failed', 'failed']);
    expect(analyses).toEqual(['too_dark']);
    off();
    expect(mocked.removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe('syncPlan', () => {
  it('calls the sync-plan edge function and returns the server plan', async () => {
    mocked.functions.invoke.mockResolvedValueOnce({ data: { plan: 'pull', founding: false, result: 'applied' }, error: null });
    await expect(syncPlan()).resolves.toEqual({ plan: 'pull', founding: false, result: 'applied' });
    expect(mocked.functions.invoke).toHaveBeenCalledTimes(1);
    expect(mocked.functions.invoke).toHaveBeenCalledWith('sync-plan');
  });

  it('throws an ApiError when the function fails', async () => {
    mocked.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('internal') });
    await expect(syncPlan()).rejects.toMatchObject({ name: 'ApiError', code: 'unknown', message: 'internal' });
  });
});

describe('deleteAccount', () => {
  it('calls the delete-account edge function, then drops the local session', async () => {
    await deleteAccount();
    expect(mocked.functions.invoke).toHaveBeenCalledTimes(1);
    expect(mocked.functions.invoke).toHaveBeenCalledWith('delete-account');
    expect(mocked.auth.signOut).toHaveBeenCalledTimes(1);
    expect(mocked.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocked.functions.invoke.mock.invocationCallOrder[0]).toBeLessThan(mocked.auth.signOut.mock.invocationCallOrder[0]);
  });

  it('throws when the function fails and keeps the session', async () => {
    mocked.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('data_delete_failed') });
    await expect(deleteAccount()).rejects.toMatchObject({ name: 'ApiError', code: 'unknown', message: 'data_delete_failed' });
    expect(mocked.auth.signOut).not.toHaveBeenCalled();
  });
});

describe('ensureSession', () => {
  it('starts a fresh anonymous account once the old session is gone', async () => {
    mocked.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(ensureSession()).resolves.toBe('anon-2');
    expect(mocked.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('reuses the live session', async () => {
    mocked.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'jwt-1', user: { id: 'u1' } } } });
    await expect(ensureSession()).resolves.toBe('u1');
    expect(mocked.auth.signInAnonymously).not.toHaveBeenCalled();
  });
});
