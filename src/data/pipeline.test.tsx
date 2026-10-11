import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import mock from '../analysis/fixtures/snatch-mock.json';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { tusUpload } from '../lib/api/tus';
import { submitClip, type ClipSubmission } from '../features/capture/submit';
import { useUsage } from '../features/paywall/usageStore';
import { useOnboarding } from '../features/onboarding/store';
import { EMPTY_USAGE } from '../features/paywall/entitlements';
import { resetConsentSync } from './backend';
import { usePipeline } from './pipeline';
import ProcessingRoute from '../../app/analysis/processing';
import CueRoute from '../../app/analysis/cue';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    __esModule: true,
    router: r,
    useRouter: () => r,
    useLocalSearchParams: () => params.current,
  };
});

jest.mock('../lib/api/tus', () => ({ tusUpload: jest.fn(async () => 'http://up/1') }));

const channel: { change?: (p: { new: unknown }) => void; status?: (s: string) => void } = {};

type FakeChannel = { on: jest.Mock; subscribe: jest.Mock };

jest.mock('../lib/supabase', () => {
  const ch: FakeChannel = {
    on: jest.fn((_e: string, _f: unknown, cb: (p: { new: unknown }) => void): FakeChannel => {
      channel.change = cb;
      return ch;
    }),
    subscribe: jest.fn((cb: (s: string) => void): FakeChannel => {
      channel.status = cb;
      return ch;
    }),
  };
  return {
    supabaseConfigured: true,
    supabase: {
      rpc: jest.fn(),
      from: jest.fn(),
      channel: jest.fn(() => ch),
      removeChannel: jest.fn(),
      storage: { from: jest.fn() },
      auth: {
        getSession: jest.fn(async () => ({ data: { session: { access_token: 'jwt-1', user: { id: 'u1' } } } })),
        signInAnonymously: jest.fn(),
      },
    },
  };
});

const db = supabase as unknown as {
  rpc: jest.Mock;
  from: jest.Mock;
  storage: { from: jest.Mock };
  auth: { getSession: jest.Mock; signInAnonymously: jest.Mock };
};
const nav = router as unknown as { push: jest.Mock; replace: jest.Mock; back: jest.Mock };

const LIFT = { id: 'lift-1', user_id: 'u1', clip_path: 'u1/lift-1', movement: 'snatch', load_kg: 62.5, created_at: '2026-10-11T08:00:00Z' };
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

function result(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'lt', 'order', 'limit', 'update']) q[m] = () => q;
  q.insert = jest.fn(async () => ({ data: null, error: null }));
  q.maybeSingle = async () => ({ data, error: null });
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: Array.isArray(data) ? data : [], error: null });
  return q;
}

const consents = result(null);
let analysisRow: unknown = null;

function wireBackend() {
  db.from.mockImplementation((table: string) => {
    if (table === 'consents') return consents;
    if (table === 'lifts') return result({ ...LIFT, status: 'processing' });
    if (table === 'analyses') return result(analysisRow);
    return result([]);
  });
  db.rpc.mockImplementation(async (fn: string) => {
    if (fn === 'create_lift') return { data: { ...LIFT, status: 'uploading' }, error: null };
    if (fn === 'enqueue_lift') return { data: { ...LIFT, status: 'queued' }, error: null };
    return { data: null, error: null };
  });
  db.storage.from.mockReturnValue({ createSignedUrls: jest.fn(async () => ({ data: [], error: null })) });
}

global.fetch = jest.fn(async () => ({ blob: async () => new Blob(['x'.repeat(1024)]) })) as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  analysisRow = null;
  resetConsentSync();
  usePipeline.getState().clear();
  useUsage.setState({ usage: EMPTY_USAGE, variant: 'organic', queue: [] });
  useOnboarding.setState({ consent: { version: 1, acceptedAt: '2026-10-11T07:00:00Z', improveAccuracy: false } });
  wireBackend();
});

async function settle() {
  await waitFor(() => expect(usePipeline.getState().job?.status).toBe('queued'));
}

describe('capture → upload → processing → cue (backend mode)', () => {
  it('records consent, then creates the lift, uploads the clip and queues it', async () => {
    await submitClip(CLIP);
    await settle();

    expect(nav.push).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
    expect(consents.insert).toHaveBeenNthCalledWith(1, { kind: 'upload_privacy', version: '1', granted: true });
    expect(consents.insert).toHaveBeenNthCalledWith(2, { kind: 'model_training', version: '1', granted: false });
    const order = (consents.insert as jest.Mock).mock.invocationCallOrder[0];
    expect(order).toBeLessThan(db.rpc.mock.invocationCallOrder[0]);
    expect(db.rpc.mock.calls.map((c) => c[0])).toEqual(['create_lift', 'enqueue_lift']);
    expect(db.rpc).toHaveBeenCalledWith('create_lift', { p_movement: 'snatch', p_load_kg: 62.5 });
    const tus = (tusUpload as jest.Mock).mock.calls[0][0];
    expect(tus.metadata).toEqual({ bucketName: 'raw-clips', objectName: 'u1/lift-1', contentType: 'video/quicktime', cacheControl: '3600' });
    expect(usePipeline.getState().job).toMatchObject({ liftId: 'lift-1', status: 'queued', error: null });
  });

  it('follows the lift to the real analysis, counts the video and opens the reveal', async () => {
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    expect(view.getByTestId('processing-progress')).toBeOnTheScreen();
    expect(view.getByText('Uploading your clip')).toBeOnTheScreen();

    analysisRow = { analysis: { ...mock, id: 'lift-1' } };
    await act(async () => {
      channel.status?.('SUBSCRIBED');
    });
    await act(async () => {
      channel.change?.({ new: { ...LIFT, status: 'done' } });
    });

    await waitFor(() => expect(view.getByTestId('processing-done')).toBeOnTheScreen());
    expect(view.getByText('Done. 3 reps, one cue.')).toBeOnTheScreen();
    expect(useUsage.getState().usage.lifetime).toBe(1);

    await act(async () => {
      fireEvent.press(view.getByTestId('see-it'));
    });
    expect(nav.replace).toHaveBeenCalledWith({ pathname: '/analysis/reveal', params: { fixture: 'lift-1' } });

    params.current = { fixture: 'lift-1' };
    const cue = await render(<CueRoute />);
    expect(cue.getByTestId('cue-screen')).toBeOnTheScreen();
    expect(cue.getByText(mock.cue.text)).toBeOnTheScreen();
  });

  it('shows the low-confidence cue when the worker is not sure', async () => {
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    await render(<ProcessingRoute />);
    analysisRow = { analysis: { ...mock, id: 'lift-1', cue: { ...mock.cue, confidence: 'low', confidenceText: 'Hip hidden on 2 reps.' } } };
    await act(async () => {
      channel.change?.({ new: { ...LIFT, status: 'done' } });
    });
    await waitFor(() => expect(useUsage.getState().usage.lifetime).toBe(1));

    params.current = { fixture: 'lift-1' };
    const cue = await render(<CueRoute />);
    expect(cue.getByTestId('low-confidence')).toBeOnTheScreen();
    expect(cue.getByText('Hip hidden on 2 reps.')).toBeOnTheScreen();
  });

  it('routes a failed analysis to the failure screen without counting it', async () => {
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    await render(<ProcessingRoute />);
    analysisRow = { analysis: { ...mock, id: 'lift-1', cue: null, failure: { reason: 'not_side_on', message: 'Film side-on.' } } };
    await act(async () => {
      channel.change?.({ new: { ...LIFT, status: 'done' } });
    });

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith({ pathname: '/failure/[id]', params: { id: 'lift-1', reason: 'not_side_on' } })
    );
    expect(useUsage.getState().usage.lifetime).toBe(0);
  });

  it('opens the paywall when the server says the cap is reached', async () => {
    db.rpc.mockImplementation(async () => ({ data: null, error: { message: 'cap_reached' } }));
    await submitClip(CLIP);
    await waitFor(() => expect(usePipeline.getState().job?.status).toBe('failed'));
    expect(usePipeline.getState().job?.error).toBe('cap_reached');

    params.current = { live: '1' };
    await render(<ProcessingRoute />);
    const jobId = usePipeline.getState().job?.id;
    expect(nav.replace).toHaveBeenCalledWith({ pathname: '/paywall', params: { clip: jobId, movement: 'snatch' } });
  });
});

describe('paywall gate', () => {
  it('sends video 4 on the free plan to the paywall and never creates a lift', async () => {
    useUsage.setState({ usage: { lifetime: 3, month: '2026-10', thisMonth: 3 } });
    await submitClip(CLIP);

    expect(nav.push).toHaveBeenCalledTimes(1);
    const [{ pathname, params: p }] = nav.push.mock.calls[0];
    expect(pathname).toBe('/paywall');
    expect(p.movement).toBe('snatch');
    expect(p.clip).toMatch(/^clip-\d+$/);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(usePipeline.getState().job).toBeNull();
  });

  it('sends the ad funnel to the trial paywall after its one free video', async () => {
    useUsage.setState({ usage: { lifetime: 1, month: '2026-10', thisMonth: 1 }, variant: 'ad' });
    await submitClip(CLIP);

    expect(nav.push).toHaveBeenCalledWith('/paywall/funnel/trial');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('leaving the cue opens the trial paywall once the ad funnel is due', async () => {
    useUsage.setState({ usage: { lifetime: 1, month: '2026-10', thisMonth: 1 }, variant: 'ad' });
    params.current = { fixture: 'snatch-mock' };
    const cue = await render(<CueRoute />);
    await act(async () => {
      fireEvent.press(cue.getByTestId('cue-not-for-me'));
    });
    expect(nav.replace).toHaveBeenCalledWith('/paywall/funnel/trial');
  });
});
