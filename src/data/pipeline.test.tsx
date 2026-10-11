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
import { uploadStep, usePipeline, type Job } from './pipeline';
import Transcoder from '../../modules/clip-transcoder';
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
    expect(tus.metadata).toEqual({ bucketName: 'raw-clips', objectName: 'u1/lift-1', contentType: 'video/mp4', cacheControl: '3600' });
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

describe('preparing the clip before upload', () => {
  const transcoder = Transcoder as unknown as { probe: jest.Mock; transcode: jest.Mock };

  it('uploads a trimmed H.264 copy (1080 px long edge) that keeps the source frame rate, not the original', async () => {
    transcoder.probe.mockResolvedValueOnce({ width: 2160, height: 3840, fps: 120, durationS: 20 });
    await submitClip({ ...CLIP, trim: { start: 2.5, end: 9.5 } });
    await settle();

    expect(transcoder.probe).toHaveBeenCalledWith('file:///clips/power-snatch.mov');
    expect(transcoder.transcode).toHaveBeenCalledTimes(1);
    expect(transcoder.transcode).toHaveBeenCalledWith({
      uri: 'file:///clips/power-snatch.mov',
      startS: 2.5,
      endS: 9.5,
      width: 608,
      height: 1080,
      fps: 120,
      dropToFps: false,
      bitrate: 12_000_000,
    });
    expect(usePipeline.getState().job).toMatchObject({ status: 'queued', prepared: 1, total: 0 });
  });

  it('re-encodes once at a lower bitrate when the first pass is still over 45 MB', async () => {
    transcoder.transcode.mockResolvedValueOnce({ uri: 'file:///cache/clip-transcoder/big.mp4', size: 60 * 1024 * 1024, width: 1080, height: 1920, fps: 30, frames: 360, durationS: 12 });
    await submitClip(CLIP);
    await settle();

    expect(transcoder.transcode).toHaveBeenCalledTimes(2);
    expect(transcoder.transcode.mock.calls[0][0].bitrate).toBe(8_000_000);
    expect(transcoder.transcode.mock.calls[1][0].bitrate).toBe(5_520_000);
  });

  it('asks for a shorter trim when the clip cannot fit, and never creates a lift', async () => {
    transcoder.probe.mockResolvedValueOnce({ width: 3840, height: 2160, fps: 60, durationS: 240 });
    await submitClip({ ...CLIP, trim: { start: 0, end: 200 } });
    await waitFor(() => expect(usePipeline.getState().job?.status).toBe('failed'));

    expect(usePipeline.getState().job).toMatchObject({ error: 'clip_too_long', maxS: 86 });
    expect(transcoder.transcode).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();

    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    expect(view.getByTestId('processing-too_long')).toBeOnTheScreen();
    expect(view.getByText('Too long to send')).toBeOnTheScreen();
    expect(view.getByText('max 86 s')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(view.getByTestId('trim-clip'));
    });
    expect(nav.replace).toHaveBeenCalledWith('/capture/trim');
  });

  it('shows "Preparing your clip" with its progress, then "Uploading your clip"', async () => {
    const base: Job = { id: 'job-1', movement: 'snatch', status: 'preparing', liftId: null, prepared: 0.42, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null };
    usePipeline.getState().start(base);
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    expect(view.getByText('Preparing your clip')).toBeOnTheScreen();
    expect(view.getByText('preparing 42%')).toBeOnTheScreen();

    await act(async () => {
      usePipeline.getState().patch({ status: 'uploading', prepared: 1, sent: 6 * 1024 * 1024, total: 12 * 1024 * 1024 });
    });
    expect(view.getByText('Uploading your clip')).toBeOnTheScreen();
    expect(view.getByText('uploading 50%')).toBeOnTheScreen();
  });
});

describe('long wait while the clip is still on the phone', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps showing progress past 45 s while preparing, not the queue message', async () => {
    jest.useFakeTimers();
    usePipeline.getState().start({ id: 'job-2', movement: 'snatch', status: 'preparing', liftId: null, prepared: 0.9, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null });
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    await act(async () => {
      jest.advanceTimersByTime(50_000);
    });
    expect(view.getByTestId('processing-progress')).toBeOnTheScreen();
    expect(view.getByText('preparing 90%')).toBeOnTheScreen();

    await act(async () => {
      usePipeline.getState().patch({ status: 'queued', prepared: 1 });
    });
    expect(view.getByTestId('processing-long')).toBeOnTheScreen();
  });
});

describe('uploadStep', () => {
  const job: Job = { id: 'j', movement: 'snatch', status: 'preparing', liftId: null, prepared: 0, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null };

  it('labels each upload state', () => {
    expect(uploadStep(null)).toEqual({ label: 'Uploading your clip', meta: null });
    expect(uploadStep({ ...job, prepared: 0.666 })).toEqual({ label: 'Preparing your clip', meta: 'preparing 67%' });
    expect(uploadStep({ ...job, status: 'uploading', total: 0 })).toEqual({ label: 'Uploading your clip', meta: null });
    expect(uploadStep({ ...job, status: 'uploading', sent: 3, total: 4 })).toEqual({ label: 'Uploading your clip', meta: 'uploading 75%' });
    expect(uploadStep({ ...job, status: 'queued', sent: 4, total: 4 })).toEqual({ label: 'Uploading your clip', meta: null });
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
