import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import mock from '../analysis/fixtures/snatch-mock.json';
import type { Analysis } from '../analysis/types';
import { analyseTrace } from '../analysis/device/analyseTrace';
import PoseCoreML from '../../modules/pose-coreml';
import { supabase } from '../lib/supabase';
import { tusUpload } from '../lib/api/tus';
import { submitClip, type ClipSubmission } from '../features/capture/submit';
import { usePurchases } from '../features/purchases/usePurchases';
import { useUsage } from '../features/paywall/usageStore';
import { EMPTY_USAGE } from '../features/paywall/entitlements';
import { useOnboarding } from '../features/onboarding/store';
import { FREE_USED_KEY } from './freeLifts';
import { useLiftOutbox } from './liftOutbox';
import { usePipeline } from './pipeline';
import ProcessingRoute from '../../app/analysis/processing';
import CueRoute from '../../app/analysis/cue';

// 3.1 in airplane mode: every network call fails, and a fresh install still analyses
// three free lifts on the phone, paywalls the fourth, keeps a paid plan from the
// cached entitlement, and queues each slim record for sync_lift.

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => params.current };
});
jest.mock('../lib/api/tus', () => ({ tusUpload: jest.fn() }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  File: jest.fn(() => ({ bytes: async () => new Uint8Array([1]), exists: false })),
}));
jest.mock('fflate', () => ({ gunzipSync: jest.fn((b: Uint8Array) => b), strFromU8: jest.fn(() => '{"traceVersion": 1, "frames": []}') }));
jest.mock('./prepare', () => ({
  ClipTooLongError: class ClipTooLongError extends Error {},
  prepareClip: jest.fn(async (uri: string, _trim: unknown, onProgress: (p: number) => void) => {
    onProgress(1);
    return { uri: `${uri}.mp4` };
  }),
  discardPrepared: jest.fn(),
}));
jest.mock('./localLifts', () => ({
  saveLocalLift: jest.fn((_id: string, a: unknown) => a),
  readLocalAnalysis: jest.fn(async () => null),
  listLocalAnalyses: jest.fn(async () => []),
}));
jest.mock('../analysis/device/analyseTrace', () => ({
  planFromMisses: jest.fn(() => ({ windows: [], plates: [], tracks: [], keyframes: [], misses: [] })),
  analyseTrace: jest.fn(),
}));

// No network: the session is cached on the phone, every request rejects.
jest.mock('../lib/supabase', () => {
  const offline = () => Promise.reject(new TypeError('Network request failed'));
  const query = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'lt', 'order', 'limit', 'update', 'insert', 'upsert']) q[m] = () => q;
    q.maybeSingle = offline;
    q.single = offline;
    q.then = (_ok: unknown, fail: (e: unknown) => unknown) => fail(new TypeError('Network request failed'));
    return q;
  };
  return {
    supabaseConfigured: true,
    supabase: {
      rpc: jest.fn(offline),
      from: jest.fn(query),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      storage: { from: jest.fn() },
      functions: { invoke: jest.fn(offline) },
      auth: {
        getSession: jest.fn(async () => ({ data: { session: { access_token: 'jwt-1', user: { id: 'u1' } } } })),
        signInAnonymously: jest.fn(offline),
        refreshSession: jest.fn(offline),
      },
    },
  };
});

const db = supabase as unknown as { rpc: jest.Mock; from: jest.Mock; channel: jest.Mock; storage: { from: jest.Mock } };
const nav = router as unknown as { push: jest.Mock; replace: jest.Mock; dismissTo: jest.Mock };
const analyseOnDevice = PoseCoreML!.analyseOnDevice as jest.Mock;

const CLIP: ClipSubmission = {
  uri: 'file:///clips/power-snatch.mov',
  movement: 'snatch',
  loadKg: 62.5,
  trim: { start: 0, end: 8 },
  rep: 'all',
  source: 'library',
  fps: 60,
  overridden: [],
};

global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  params.current = {};
  usePipeline.getState().clear();
  useLiftOutbox.setState({ items: [], cues: [] });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.setState({ usage: EMPTY_USAGE, variant: 'organic', queue: [] });
  useOnboarding.setState({ consent: { version: 1, acceptedAt: '2026-10-11T07:00:00Z', improveAccuracy: false } });
  (analyseTrace as jest.Mock).mockImplementation((_t: unknown, _m: string, o: { analysisId: string }): Analysis => ({ ...(mock as unknown as Analysis), id: o.analysisId }));
});

async function analyse(clip: ClipSubmission = CLIP): Promise<string> {
  await submitClip(clip);
  expect(nav.push).toHaveBeenLastCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
  await waitFor(() => expect(usePipeline.getState().job?.status).toBe('done'));
  return usePipeline.getState().job!.liftId!;
}

function noServerAnalysis() {
  expect(db.rpc).not.toHaveBeenCalledWith('create_lift', expect.anything());
  expect(db.rpc).not.toHaveBeenCalledWith('enqueue_lift', expect.anything());
  expect(db.storage.from).not.toHaveBeenCalled();
  expect(db.channel).not.toHaveBeenCalled();
  expect(tusUpload).not.toHaveBeenCalled();
}

describe('airplane mode, fresh install', () => {
  it('analyses the first lift on the phone and opens its cue, nothing uploaded', async () => {
    const id = await analyse();
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    await waitFor(() => expect(view.getByTestId('processing-done')).toBeOnTheScreen());
    expect(view.getByText('Done. 3 reps, one cue.')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(view.getByTestId('see-it'));
    });
    expect(nav.replace).toHaveBeenCalledWith({ pathname: '/analysis/reveal', params: { fixture: id } });

    params.current = { fixture: id };
    const cue = await render(<CueRoute />);
    expect(cue.getByText(mock.cue.text)).toBeOnTheScreen();
    expect(analyseOnDevice).toHaveBeenCalledTimes(1);
    expect(analyseOnDevice.mock.calls[0][0]).toBe('file:///clips/power-snatch.mov.mp4');
    noServerAnalysis();
  });

  it('three free lifts, counted in the Keychain and queued for sync_lift; the fourth goes to the paywall', async () => {
    const ids = [await analyse(), await analyse(), await analyse()];
    expect(new Set(ids).size).toBe(3);
    expect(useUsage.getState().usage.lifetime).toBe(3);
    expect(await SecureStore.getItemAsync(FREE_USED_KEY)).toBe('3');
    expect(useLiftOutbox.getState().items.map((i) => [i.id, i.synced ?? false])).toEqual(ids.map((id) => [id, false]));
    expect(useLiftOutbox.getState().items[0].lift).toMatchObject({ movement: 'snatch', loadKg: 62.5, made: true });

    await submitClip(CLIP);
    const [{ pathname, params: p }] = nav.push.mock.calls[nav.push.mock.calls.length - 1];
    expect(pathname).toBe('/paywall');
    expect(p.movement).toBe('snatch');
    expect(analyseOnDevice).toHaveBeenCalledTimes(3);
    expect(usePipeline.getState().job?.liftId).toBe(ids[2]);
    noServerAnalysis();
  });

  it('a reinstall reads the Keychain count, so the free lifts are not handed back', async () => {
    await SecureStore.setItemAsync(FREE_USED_KEY, '3');
    await submitClip(CLIP);
    expect(nav.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
    expect(analyseOnDevice).not.toHaveBeenCalled();
  });

  it('a paid plan from the cached entitlement keeps analysing past the free three', async () => {
    usePurchases.setState({ tier: 'pull', period: 'monthly' });
    useUsage.setState({ usage: { lifetime: 3, month: '2026-10', thisMonth: 3 } });
    await analyse();
    expect(analyseOnDevice).toHaveBeenCalledTimes(1);
    noServerAnalysis();
  });

  it('kipping HSPU goes to the could-not-analyse screen, counting nothing', async () => {
    await submitClip({ ...CLIP, movement: 'kipping_hspu' });
    params.current = { live: '1' };
    await render(<ProcessingRoute />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/failure/[id]', params: expect.objectContaining({ reason: 'unsupported_movement' }) })));
    expect(useUsage.getState().usage.lifetime).toBe(0);
    expect(analyseOnDevice).not.toHaveBeenCalled();
    noServerAnalysis();
  });
});
