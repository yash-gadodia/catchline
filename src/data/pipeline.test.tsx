import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import mock from '../analysis/fixtures/snatch-mock.json';
import { usePurchases } from '../features/purchases/usePurchases';
import { router } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
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
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) };
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
  channel: jest.Mock;
  removeChannel: jest.Mock;
  storage: { from: jest.Mock };
  auth: { getSession: jest.Mock; signInAnonymously: jest.Mock };
};
const nav = router as unknown as { push: jest.Mock; replace: jest.Mock; back: jest.Mock; dismissTo: jest.Mock };

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
    if (fn === 'lift_allowance') return { data: allowance(), error: null };
    if (fn === 'create_lift') {
      serverUsed += 1;
      return { data: { ...LIFT, status: 'uploading' }, error: null };
    }
    if (fn === 'enqueue_lift') return { data: { ...LIFT, status: 'queued' }, error: null };
    return { data: null, error: null };
  });
  db.storage.from.mockReturnValue({ createSignedUrls: jest.fn(async () => ({ data: [], error: null })) });
}

// The server's free-video count (usage_counters): create_lift charges, lift_allowance reads it.
let serverUsed = 0;
const allowance = () => ({ plan: 'free', period: 'lifetime', cap: 3, used: serverUsed, bonus: 0, remaining: Math.max(3 - serverUsed, 0) });

global.fetch = jest.fn(async () => ({ blob: async () => new Blob(['x'.repeat(1024)]) })) as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  serverUsed = 0;
  params.current = {};
  analysisRow = null;
  resetConsentSync();
  usePipeline.getState().clear();
  usePurchases.setState({ tier: 'free', period: null });
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
    expect(view.getByTestId('processing-clip')).toBeOnTheScreen();
    expect(useVideoPlayer).toHaveBeenCalledWith('file:///clips/power-snatch.mov', expect.any(Function));

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

  // Prod bug (14-10-2026): a second lift started while the first was still processing; the
  // first lift's analysis arrived after the switch and the sheet showed it for the second lift.
  it('ignores a late analysis from the previous lift after the job moves to a new one', async () => {
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    await act(async () => {
      channel.status?.('SUBSCRIBED');
    });
    const firstLiftChange = channel.change;

    await act(async () => {
      usePipeline.getState().patch({ liftId: 'lift-2', status: 'processing' });
    });
    expect(db.removeChannel).toHaveBeenCalledTimes(1);

    analysisRow = { analysis: { ...mock, id: 'lift-1' } };
    await act(async () => {
      firstLiftChange?.({ new: { ...LIFT, status: 'done' } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(view.queryByTestId('processing-done')).toBeNull();
    expect(view.getByTestId('processing-progress')).toBeOnTheScreen();
    expect(useUsage.getState().usage.lifetime).toBe(0);
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

  // A lifter who has paid is never sent to the paywall: a cap from the server means the
  // month's videos are used (after one plan sync and retry), so the cap sheet.
  it('retries once after a plan sync for a paid lifter, then opens the cap sheet, not the paywall', async () => {
    usePurchases.setState({ tier: 'pull', period: 'monthly' });
    db.rpc.mockImplementation(async () => ({ data: null, error: { message: 'cap_reached' } }));
    await submitClip(CLIP);
    await waitFor(() => expect(usePipeline.getState().job?.status).toBe('failed'));
    expect(db.rpc.mock.calls.map((c) => c[0])).toEqual(['create_lift', 'create_lift']);

    params.current = { live: '1' };
    await render(<ProcessingRoute />);
    const jobId = usePipeline.getState().job?.id;
    expect(nav.replace).toHaveBeenCalledWith({ pathname: '/paywall/cap', params: { clip: jobId, movement: 'snatch' } });
  });

  it('Hide leaves the lift running and lands on the Lifts tab, not the review of the clip already sent', async () => {
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    await act(async () => {
      fireEvent.press(view.getByTestId('hide'));
    });
    expect(nav.dismissTo).toHaveBeenCalledWith('/');
    expect(nav.back).not.toHaveBeenCalled();
    expect(db.removeChannel).not.toHaveBeenCalled();
  });

  it('resubscribes when the app returns to the foreground, so a result that landed meanwhile shows', async () => {
    const listen = jest.spyOn(AppState, 'addEventListener');
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    await act(async () => {
      channel.status?.('SUBSCRIBED');
    });
    expect(db.channel).toHaveBeenCalledTimes(1);
    const onChange = listen.mock.calls.find((c) => c[0] === 'change')?.[1] as (s: string) => void;

    // The worker finished while the app was in the background and Realtime had dropped.
    analysisRow = { analysis: { ...mock, id: 'lift-1' } };
    db.from.mockImplementation((table: string) => {
      if (table === 'lifts') return result({ ...LIFT, status: 'done' });
      if (table === 'analyses') return result(analysisRow);
      return result([]);
    });
    await act(async () => {
      onChange('active');
    });
    expect(db.removeChannel).toHaveBeenCalledTimes(1);
    expect(db.channel).toHaveBeenCalledTimes(2);
    expect(db.channel).toHaveBeenLastCalledWith('lift:lift-1');
    await act(async () => {
      channel.status?.('SUBSCRIBED');
    });
    await waitFor(() => expect(view.getByTestId('processing-done')).toBeOnTheScreen());

    // Done: a later foreground leaves the result alone.
    await act(async () => {
      onChange('active');
    });
    expect(db.channel).toHaveBeenCalledTimes(2);
    listen.mockRestore();
  });

  // The capture screens beneath the result still hold the clip just sent; going back
  // there invites sending it twice, so leaving the cue lands on the Lifts tab.
  it('leaving the cue lands on the Lifts tab, not the review of the clip already sent', async () => {
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    const processing = await render(<ProcessingRoute />);
    analysisRow = { analysis: { ...mock, id: 'lift-1' } };
    await act(async () => {
      channel.change?.({ new: { ...LIFT, status: 'done' } });
    });
    await waitFor(() => expect(useUsage.getState().usage.lifetime).toBe(1));
    await processing.unmount();

    params.current = { fixture: 'lift-1' };
    const cue = await render(<CueRoute />);
    await act(async () => {
      fireEvent.press(cue.getByTestId('cue-not-for-me'));
    });
    expect(nav.dismissTo).toHaveBeenCalledWith('/');
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.push.mock.calls).toEqual([[{ pathname: '/analysis/processing', params: { live: '1' } }]]);
  });

  it('"Film again from the side" on a low-confidence (camera angle) cue goes to the Lifts tab, then the viewfinder', async () => {
    await submitClip(CLIP);
    await settle();
    params.current = { live: '1' };
    const processing = await render(<ProcessingRoute />);
    analysisRow = { analysis: { ...mock, id: 'lift-1', cue: { ...mock.cue, confidence: 'low', confidenceText: 'Seen on 1 of 1 reps, filmed ~40° off side-on: film from the side to confirm' } } };
    await act(async () => {
      channel.change?.({ new: { ...LIFT, status: 'done' } });
    });
    await waitFor(() => expect(useUsage.getState().usage.lifetime).toBe(1));
    await processing.unmount();

    params.current = { fixture: 'lift-1' };
    const cue = await render(<CueRoute />);
    await act(async () => {
      fireEvent.press(cue.getByTestId('film-again'));
    });
    expect(nav.dismissTo).toHaveBeenCalledWith('/');
    expect(nav.push).toHaveBeenLastCalledWith('/capture');
    expect(nav.dismissTo.mock.invocationCallOrder[0]).toBeLessThan(nav.push.mock.invocationCallOrder[1]);
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
    const base: Job = { id: 'job-1', movement: 'snatch', status: 'preparing', liftId: null, prepared: 0.42, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null, uri: null };
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

// A processing lift opened from the Lifts list after a relaunch: no job in memory, so the
// sheet follows the lift named in the link. Before, the link was bare and played the demo.
describe('a processing lift opened from the library', () => {
  it('subscribes to that lift and opens its own analysis', async () => {
    analysisRow = { analysis: { ...mock, id: 'lift-9' } };
    db.from.mockImplementation((table: string) => {
      if (table === 'lifts') return result({ ...LIFT, id: 'lift-9', status: 'processing' });
      if (table === 'analyses') return result(analysisRow);
      return result([]);
    });
    params.current = { live: '1', lift: 'lift-9' };
    const view = await render(<ProcessingRoute />);

    expect((supabase as unknown as { channel: jest.Mock }).channel).toHaveBeenCalledWith('lift:lift-9');
    await act(async () => {
      channel.status?.('SUBSCRIBED');
    });
    await waitFor(() => expect(view.getByText('Watching your reps')).toBeOnTheScreen());
    expect(view.queryByText(mock.cue.text)).toBeNull();
    expect(view.getByTestId('processing-art')).toBeOnTheScreen();
    expect(view.queryByTestId('processing-clip')).toBeNull();

    await act(async () => {
      channel.change?.({ new: { ...LIFT, id: 'lift-9', status: 'done' } });
    });
    await waitFor(() => expect(view.getByTestId('processing-done')).toBeOnTheScreen());
    await act(async () => {
      fireEvent.press(view.getByTestId('see-it'));
    });
    expect(nav.replace).toHaveBeenCalledWith({ pathname: '/analysis/reveal', params: { fixture: 'lift-9' } });
  });
});

describe('long wait', () => {
  afterEach(() => jest.useRealTimers());

  it('counts the wait from when the clip reaches the server, and says "taking longer" only past about 2 min plus a margin', async () => {
    jest.useFakeTimers();
    usePipeline.getState().start({ id: 'job-2', movement: 'snatch', status: 'preparing', liftId: null, prepared: 0.9, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null, uri: null });
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    await act(async () => {
      jest.advanceTimersByTime(50_000);
    });
    expect(view.getByTestId('processing-progress')).toBeOnTheScreen();
    expect(view.getByText('preparing 90%')).toBeOnTheScreen();
    expect(view.queryByText('usually about 2 min')).toBeNull();

    await act(async () => {
      usePipeline.getState().patch({ status: 'queued', prepared: 1 });
    });
    expect(view.getByText('usually about 2 min')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(170_000);
    });
    expect(view.getByTestId('processing-progress')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(11_000);
    });
    expect(view.getByTestId('processing-long')).toBeOnTheScreen();
    expect(view.getByText('usually about 2 min')).toBeOnTheScreen();
  });

  it('polls the queue position every 10 s while queued or processing and shows who is ahead', async () => {
    jest.useFakeTimers();
    db.rpc.mockImplementation(async (fn: string) => (fn === 'lifts_ahead' ? { data: 2, error: null } : { data: null, error: null }));
    usePipeline.getState().start({ id: 'job-3', movement: 'snatch', status: 'queued', liftId: 'lift-1', prepared: 1, sent: 1, total: 1, uploadUrl: null, error: null, maxS: null, uri: null });
    params.current = { live: '1' };
    const view = await render(<ProcessingRoute />);
    await waitFor(() => expect(view.getByText('2 ahead of you')).toBeOnTheScreen());
    expect(db.rpc).toHaveBeenCalledWith('lifts_ahead', { p_lift_id: 'lift-1' });
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'lifts_ahead')).toHaveLength(1);

    db.rpc.mockImplementation(async (fn: string) => (fn === 'lifts_ahead' ? { data: 0, error: null } : { data: null, error: null }));
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(view.queryByText(/ahead of you/)).toBeNull());
    expect(db.rpc.mock.calls.filter((c) => c[0] === 'lifts_ahead')).toHaveLength(2);
    expect(view.getByText('usually about 2 min')).toBeOnTheScreen();
  });
});

describe('uploadStep', () => {
  const job: Job = { id: 'j', movement: 'snatch', status: 'preparing', liftId: null, prepared: 0, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null, uri: null };

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
    serverUsed = 3;
    await submitClip(CLIP);

    expect(nav.push).toHaveBeenCalledTimes(1);
    const [{ pathname, params: p }] = nav.push.mock.calls[0];
    expect(pathname).toBe('/paywall');
    expect(p.movement).toBe('snatch');
    expect(p.clip).toMatch(/^clip-\d+$/);
    expect(db.rpc).not.toHaveBeenCalledWith('create_lift', expect.anything());
    expect(usePipeline.getState().job).toBeNull();
  });

  it('sends the ad funnel to the trial paywall after its one free video', async () => {
    useUsage.setState({ usage: { lifetime: 1, month: '2026-10', thisMonth: 1 }, variant: 'ad' });
    serverUsed = 1;
    await submitClip(CLIP);

    expect(nav.push).toHaveBeenCalledWith('/paywall/funnel/trial');
    expect(db.rpc).not.toHaveBeenCalledWith('create_lift', expect.anything());
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
