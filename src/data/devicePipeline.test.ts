import PoseCoreML from '../../modules/pose-coreml';
import { snatchMock } from '../analysis/fixtures';
import type { Analysis } from '../analysis/types';
import type { ClipSubmission } from '../features/capture/submit';
import { usePipeline, startLift } from './pipeline';
import { analyseLoop, cancelDeviceLift, failureReason, nativeCode, readTrace, startDeviceLift, toNativePlan } from './devicePipeline';
import { strFromU8 } from 'fflate';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({ bytes: async () => new Uint8Array([1]) })),
}));
jest.mock('fflate', () => ({
  gunzipSync: jest.fn((b: Uint8Array) => b),
  strFromU8: jest.fn(() => '{"traceVersion": 1, "frames": []}'),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('./backend', () => ({ syncConsent: jest.fn(async () => undefined) }));
jest.mock('./onDeviceAnalysis', () => ({ onDeviceAnalysisEnabled: jest.fn(() => true) }));
jest.mock('./prepare', () => ({
  ClipTooLongError: class ClipTooLongError extends Error {
    maxS = 20;
  },
  prepareClip: jest.fn(async (uri: string, _trim: unknown, onProgress: (p: number) => void) => {
    onProgress(1);
    return { uri: `${uri}.mp4` };
  }),
  discardPrepared: jest.fn(),
}));
jest.mock('./localLifts', () => ({
  saveLocalLift: jest.fn((_id: string, a: Analysis) => a),
  keepFailedClip: jest.fn(),
}));
jest.mock('../analysis/device/analyseTrace', () => ({
  planFromMisses: jest.fn(() => ({ windows: [], plates: [], tracks: [], follows: [], keyframes: [], misses: [] })),
  analyseTrace: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'lift-1' }));
jest.mock('./liftOutbox', () => ({ queueLiftSync: jest.fn(async () => 1) }));
jest.mock('./freeLifts', () => ({ writeFreeUsed: jest.fn(async () => undefined) }));
jest.mock('../features/purchases/usePurchases', () => ({ usePurchases: { getState: () => ({ tier: 'free' }) } }));
jest.mock('../lib/analytics', () => ({ ...jest.requireActual('../lib/analytics'), track: jest.fn() }));

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { analyseTrace, planFromMisses } from '../analysis/device/analyseTrace';
import { queueLiftSync } from './liftOutbox';
import { writeFreeUsed } from './freeLifts';
import { useUsage } from '../features/paywall/usageStore';
import { ClipTooLongError, prepareClip } from './prepare';
import { keepFailedClip, saveLocalLift } from './localLifts';
import { discardPrepared } from './prepare';
import { track } from '../lib/analytics';

const native = PoseCoreML as NonNullable<typeof PoseCoreML>;
const mockAnalyse = native.analyseOnDevice as jest.Mock;
const mockTrace = analyseTrace as jest.Mock;
const mockPlan = planFromMisses as jest.Mock;

const SUB: ClipSubmission & { uri: string } = {
  uri: 'file:///clip.mov',
  movement: 'snatch',
  loadKg: 70,
  trim: { start: 0, end: 4 },
  rep: 'all',
  source: 'camera',
  fps: 60,
  overridden: [],
};

const mockPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockEnd = native.endBackgroundRun as jest.Mock;
const appState = AppState as unknown as { currentState: string };

beforeEach(() => {
  jest.clearAllMocks();
  usePipeline.getState().clear();
  useUsage.getState().reset();
  mockTrace.mockReturnValue({ ...snatchMock, id: 'x' });
  appState.currentState = 'active';
});

const BANNER = { title: 'Analysing your Clean', subtitle: 'Keeps working in the background.' };
const INTERRUPTED = new Error('Could not analyse on device: interrupted: the system ended the run in the background');

describe('startDeviceLift, the happy path', () => {
  it('analyses on the phone with no server call first, keeps the result locally, counts it and queues the slim record', async () => {
    await startDeviceLift(SUB);
    expect(prepareClip).toHaveBeenCalledTimes(1);
    expect(mockAnalyse).toHaveBeenCalledWith('file:///clip.mov.mp4', 'snatch', undefined, { title: 'Analysing your Snatch', subtitle: 'Keeps working in the background.', from: 0, to: 0.8 });
    expect(mockTrace).toHaveBeenCalledWith({ traceVersion: 1, frames: [] }, 'snatch', { analysisId: 'lift-1', assetPrefix: 'lift-1' });
    expect(saveLocalLift).toHaveBeenCalledWith('lift-1', expect.objectContaining({ id: 'lift-1', movement: 'snatch', loadKg: 70 }), 'file:///cache/pose-coreml/trace.json.gz', {});
    expect(queueLiftSync).toHaveBeenCalledWith({
      id: 'lift-1',
      lift: {
        movement: 'snatch',
        loadKg: 70,
        made: snatchMock.reps[snatchMock.bestRepIndex].made,
        cue: { faultId: snatchMock.cue?.faultId, text: snatchMock.cue?.text, why: snatchMock.cue?.why },
        noCueCode: null,
        startClass: null,
        yawBucket: null,
        analysisVersion: snatchMock.analysisVersion ?? null,
        retestCueId: null,
        failureCode: null,
        analysedAt: expect.any(String),
      },
    });
    expect(useUsage.getState().usage.lifetime).toBe(1);
    expect(writeFreeUsed).toHaveBeenCalledWith(1);
    const job = usePipeline.getState().job;
    expect(job?.status).toBe('done');
    expect(job?.device).toBe(true);
    expect(job?.liftId).toBe('lift-1');
    expect(job?.result?.id).toBe('lift-1');
    expect(job?.fraction).toBe(1);
    expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('analysis_completed', {
      movement: 'snatch',
      cue_confidence: snatchMock.cue?.confidence,
      no_cue_code: 'none',
      made: snatchMock.reps[snatchMock.bestRepIndex].made,
    });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('sends why there was no cue for a partial result', async () => {
    mockTrace.mockReturnValue({ ...snatchMock, cue: null, noCueReason: { code: 'off_side_on', offSideDeg: 40 } });
    await startDeviceLift(SUB);
    expect(queueLiftSync).toHaveBeenCalledWith({ id: 'lift-1', lift: expect.objectContaining({ cue: null, noCueCode: 'off_side_on', failureCode: null }) });
    expect(usePipeline.getState().job?.status).toBe('done');
  });

  it('is the path startLift takes when the flag is on', async () => {
    await startLift(SUB);
    expect(usePipeline.getState().job?.device).toBe(true);
  });

  it('never analyses kipping HSPU on the phone yet (no TS replay for the rotated pass): it fails as unsupported', async () => {
    await startLift({ ...SUB, movement: 'kipping_hspu' });
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', failureReason: 'unsupported_movement' });
    expect(mockAnalyse).not.toHaveBeenCalled();
  });
});

describe('analyseLoop', () => {
  it('runs native again with the plan built from the misses, merging the stills, until nothing is missing', async () => {
    const p1 = { windows: [{ s0: 0, count: 10 }], plates: [], tracks: [], follows: [], keyframes: [], misses: ['find_plates'] };
    const p2 = { ...p1, keyframes: [{ name: 'r1-1-setup.jpg', frame: 12 }], misses: ['export_keyframes'] };
    mockPlan.mockReturnValueOnce(p1).mockReturnValueOnce(p2).mockReturnValueOnce({ ...p2, misses: [] });
    mockAnalyse
      .mockResolvedValueOnce({ tracePath: 'file:///t1.gz', stills: {} })
      .mockResolvedValueOnce({ tracePath: 'file:///t2.gz', stills: { 'r1-1-setup.jpg': 'file:///a.jpg' } })
      .mockResolvedValueOnce({ tracePath: 'file:///t3.gz', stills: { 'r1-2-knee.jpg': 'file:///b.jpg' } });
    const progress: [string, number][] = [];
    const out = await analyseLoop('file:///c.mp4', 'clean', 'lift-9', (stage, f) => progress.push([stage, f]));
    expect(mockAnalyse.mock.calls).toEqual([
      ['file:///c.mp4', 'clean', undefined, { ...BANNER, from: 0, to: 0.8 }],
      ['file:///c.mp4', 'clean', { windows: [{ s0: 0, count: 10 }], plates: [], tracks: [], follows: [], keyframes: [] }, expect.objectContaining(BANNER)],
      ['file:///c.mp4', 'clean', { windows: [{ s0: 0, count: 10 }], plates: [], tracks: [], follows: [], keyframes: [{ name: 'r1-1-setup.jpg', frame: 12 }] }, expect.objectContaining(BANNER)],
    ]);
    expect(mockPlan).toHaveBeenLastCalledWith({ traceVersion: 1, frames: [] }, 'clean', { analysisId: 'lift-9', assetPrefix: 'lift-9' });
    expect(out.tracePath).toBe('file:///t3.gz');
    expect(out.stills).toEqual({ 'r1-1-setup.jpg': 'file:///a.jpg', 'r1-2-knee.jpg': 'file:///b.jpg' });
    expect(progress[progress.length - 1]).toEqual(['cue', 1]);
  });

  it('gives the first pass (pose on every frame) most of the progress and the replays the rest', async () => {
    const empty = { windows: [], plates: [], tracks: [], follows: [], keyframes: [] };
    mockPlan.mockReturnValueOnce({ ...empty, misses: ['x'] }).mockReturnValueOnce({ ...empty, misses: [] });
    const progress: number[] = [];
    await analyseLoop('file:///c.mp4', 'snatch', 'l', (_s, f) => progress.push(f));
    expect(progress.map((f) => Math.round(f * 100))).toEqual([40, 80, 86, 92, 100]);
  });

  it('stops after three passes even if misses remain', async () => {
    mockPlan.mockReturnValue({ windows: [], plates: [], tracks: [], follows: [], keyframes: [], misses: ['x'] });
    await analyseLoop('file:///c.mp4', 'snatch', 'l', () => undefined);
    expect(mockAnalyse).toHaveBeenCalledTimes(3);
  });

  it('hands iOS 26 the words for its background banner and each pass its share of the bar, then ends the run', async () => {
    const empty = { windows: [], plates: [], tracks: [], keyframes: [] };
    mockPlan.mockReturnValueOnce({ ...empty, misses: ['x'] }).mockReturnValueOnce({ ...empty, misses: [] });
    await analyseLoop('file:///c.mp4', 'clean', 'l', () => undefined);
    const banners = mockAnalyse.mock.calls.map((c) => c[3]);
    expect(banners[0]).toEqual({ ...BANNER, from: 0, to: 0.8 });
    expect(banners[1].from).toBeCloseTo(0.8);
    expect(banners[1].to).toBeCloseTo(0.92);
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledWith(true);
  });

  it('ends the background run when the loop gives up too', async () => {
    mockAnalyse.mockRejectedValueOnce(new Error('Could not analyse on device: clip_unreadable: x'));
    await expect(analyseLoop('file:///c.mp4', 'snatch', 'l', () => undefined)).rejects.toThrow('clip_unreadable');
    expect(mockEnd).toHaveBeenCalledWith(false);
  });

  it('reruns a pass the system ended in the background as soon as the app is active again', async () => {
    mockPlan.mockReturnValue({ windows: [], plates: [], tracks: [], keyframes: [], misses: [] });
    mockAnalyse.mockRejectedValueOnce(INTERRUPTED);
    const out = await analyseLoop('file:///c.mp4', 'snatch', 'l', () => undefined);
    expect(mockAnalyse).toHaveBeenCalledTimes(2);
    expect(out.tracePath).toBe('file:///cache/pose-coreml/trace.json.gz');
  });

  it('waits for the lifter to come back before that rerun', async () => {
    mockPlan.mockReturnValue({ windows: [], plates: [], tracks: [], keyframes: [], misses: [] });
    mockAnalyse.mockRejectedValueOnce(INTERRUPTED);
    appState.currentState = 'background';
    const listeners: ((s: string) => void)[] = [];
    (AppState.addEventListener as jest.Mock).mockImplementation((_: string, cb: (s: string) => void) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    });
    const done = jest.fn();
    const run = analyseLoop('file:///c.mp4', 'snatch', 'l', () => undefined).then(done);
    await new Promise((r) => setImmediate(r));
    expect(mockAnalyse).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
    listeners.forEach((l) => l('active'));
    await run;
    expect(mockAnalyse).toHaveBeenCalledTimes(2);
  });

  it('still fails a pass that broke for any other reason while the app was in front', async () => {
    mockAnalyse.mockRejectedValueOnce(new Error('Could not analyse on device: clip_unreadable: x'));
    await expect(analyseLoop('file:///c.mp4', 'snatch', 'l', () => undefined)).rejects.toThrow('clip_unreadable');
    expect(mockAnalyse).toHaveBeenCalledTimes(1);
  });
});

describe('startDeviceLift when the lifter has left the app', () => {
  it('posts one local notification that opens the lift, when notifications are allowed', async () => {
    appState.currentState = 'background';
    mockPermissions.mockResolvedValueOnce({ status: 'granted' });
    await startDeviceLift(SUB);
    expect(usePipeline.getState().job?.status).toBe('done');
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0]).toEqual({
      content: { title: 'Your Snatch is ready', body: 'Tap to see your cue.', data: { liftId: 'lift-1' } },
      trigger: null,
    });
  });

  it('says so when the lift failed instead', async () => {
    appState.currentState = 'background';
    mockPermissions.mockResolvedValueOnce({ status: 'granted' });
    mockTrace.mockReturnValue({ ...snatchMock, id: 'x', failure: { reason: 'no_reps', code: 'no_reps' } });
    await startDeviceLift(SUB);
    expect(mockSchedule.mock.calls[0][0].content).toEqual({ title: "We couldn't read your Snatch", body: 'Tap to see why, and what to try next.', data: { liftId: 'lift-1' } });
  });

  it('posts nothing when notifications are off, or when the app is in front', async () => {
    appState.currentState = 'background';
    mockPermissions.mockResolvedValueOnce({ status: 'denied' });
    await startDeviceLift(SUB);
    expect(mockSchedule).not.toHaveBeenCalled();
    appState.currentState = 'active';
    mockPermissions.mockResolvedValueOnce({ status: 'granted' });
    await startDeviceLift(SUB);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe('startDeviceLift on a path-only result (a gate after "person found" failed)', () => {
  it('is a lift, not a failure: counted, synced with no_cue_code path_only and no made call, shown as done', async () => {
    mockTrace.mockReturnValue({ ...snatchMock, cue: null, noCueReason: { code: 'path_only', gate: 'no_reps' } });
    await startDeviceLift(SUB);
    expect(queueLiftSync).toHaveBeenCalledWith({ id: 'lift-1', lift: expect.objectContaining({ cue: null, made: null, noCueCode: 'path_only', failureCode: null }) });
    expect(useUsage.getState().usage.lifetime).toBe(1);
    const job = usePipeline.getState().job;
    expect([job?.status, job?.result?.failure, job?.result?.noCueReason]).toEqual(['done', null, { code: 'path_only', gate: 'no_reps' }]);
    expect(track).toHaveBeenCalledWith('analysis_completed', { movement: 'snatch', cue_confidence: 'none', no_cue_code: 'path_only', made: 'unknown' });
    expect(keepFailedClip).not.toHaveBeenCalled();
  });
});

describe('startDeviceLift when the analysis fails', () => {
  it('records the failure code without counting the lift, keeps the failed analysis for the failure screen', async () => {
    mockTrace.mockReturnValue({ ...snatchMock, failure: { reason: 'clip_cut_off', message: 'm', code: 'no_reps' } });
    await startDeviceLift(SUB);
    expect(queueLiftSync).toHaveBeenCalledWith({ id: 'lift-1', lift: expect.objectContaining({ cue: null, made: null, failureCode: 'no_reps' }) });
    expect(useUsage.getState().usage.lifetime).toBe(0);
    expect(writeFreeUsed).not.toHaveBeenCalled();
    const job = usePipeline.getState().job;
    expect(job?.status).toBe('failed');
    expect(job?.error).toBe('analysis_failed');
    expect(job?.result?.failure?.reason).toBe('clip_cut_off');
    expect(track).toHaveBeenCalledWith('analysis_failed', { movement: 'snatch', code: 'no_reps' });
    // the trimmed clip is kept for "Send this clip so we can fix it", not discarded
    expect(keepFailedClip).toHaveBeenCalledWith('lift-1', 'file:///clip.mov.mp4');
    expect(discardPrepared).not.toHaveBeenCalled();
  });

  it('sends a native read error to the could-not-read screen, counting and syncing nothing', async () => {
    mockAnalyse.mockRejectedValueOnce(new Error('Could not analyse on device: no_video_track: AVAsset has no video track'));
    await startDeviceLift(SUB);
    expect(queueLiftSync).not.toHaveBeenCalled();
    expect(useUsage.getState().usage.lifetime).toBe(0);
    const job = usePipeline.getState().job;
    expect(job?.error).toBe('analysis_failed');
    expect(job?.failureReason).toBe('clip_unreadable');
    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('analysis_failed', { movement: 'snatch', code: 'no_video_track' });
  });

  it('offers a retry when the models could not be loaded', async () => {
    mockAnalyse.mockRejectedValueOnce(new Error('Could not analyse on device: models_unavailable: offline'));
    await startDeviceLift(SUB);
    expect(queueLiftSync).not.toHaveBeenCalled();
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', error: 'models_unavailable' });
  });

  it('treats any other native rejection as a file-system error on the could-not-read screen', async () => {
    mockAnalyse.mockRejectedValueOnce(new Error('ENOSPC'));
    await startDeviceLift(SUB);
    expect(usePipeline.getState().job?.failureReason).toBe('clip_unreadable');
  });

  it('fails a clip-too-long lift before analysing, counting nothing', async () => {
    (prepareClip as jest.Mock).mockRejectedValueOnce(new ClipTooLongError(20));
    await startDeviceLift(SUB);
    expect(queueLiftSync).not.toHaveBeenCalled();
    expect(useUsage.getState().usage.lifetime).toBe(0);
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', error: 'clip_too_long', maxS: 20 });
  });

  it('drops the result when the lifter cancels mid-run, counting nothing', async () => {
    mockAnalyse.mockImplementationOnce(async () => {
      cancelDeviceLift();
      return { tracePath: 'file:///t.gz', stills: {} };
    });
    await startDeviceLift(SUB);
    expect(mockTrace).not.toHaveBeenCalled();
    expect(saveLocalLift).not.toHaveBeenCalled();
    expect(queueLiftSync).not.toHaveBeenCalled();
    expect(usePipeline.getState().job).toMatchObject({ status: 'failed', error: 'cancelled' });
  });
});

describe('toNativePlan', () => {
  it('turns a wrist with a missing coordinate into null and keeps the rest', () => {
    const plan = {
      windows: [{ s0: 3, count: 40 }],
      plates: [{ frame: 3, wristA: [10, 20] as [number, number], wristB: [null, 5] as [null, number], bodyH: 400, setupH: null }],
      tracks: [],
      follows: [{ s0: 3, n: 2, seed: 0, wrists: [[11, 21], [null, 22]] as [number | null, number | null][], wristA: [10, 20] as [number, number], wristB: [null, 5] as [null, number], bodyH: 400, setupH: 380 }],
      keyframes: [{ name: 'r1-6-catch.jpg', frame: 30 }],
    };
    expect(toNativePlan(plan)).toEqual({
      windows: [{ s0: 3, count: 40 }],
      plates: [{ frame: 3, wristA: [10, 20], wristB: null, bodyH: 400, setupH: null }],
      tracks: [],
      follows: [{ s0: 3, n: 2, seed: 0, wrists: [[11, 21], null], wristA: [10, 20], wristB: null, bodyH: 400, setupH: 380 }],
      keyframes: [{ name: 'r1-6-catch.jpg', frame: 30 }],
    });
  });
});

describe('nativeCode and failureReason', () => {
  it('reads the code out of the native message', () => {
    expect(nativeCode(new Error('Could not analyse on device: clip_unreadable: bad moov'))).toBe('clip_unreadable');
    expect(nativeCode(new Error('Could not analyse on device: plan_invalid'))).toBe('plan_invalid');
    expect(nativeCode(new Error('EACCES'))).toBe('unknown');
    expect(nativeCode(new Error('cancelled'))).toBe('cancelled');
  });

  it('sends every native code but models_unavailable to the could-not-read screen', () => {
    expect(failureReason('no_video_track')).toBe('clip_unreadable');
    expect(failureReason('stage_missing')).toBe('clip_unreadable');
    expect(failureReason('unknown')).toBe('clip_unreadable');
    expect(failureReason('models_unavailable')).toBe('unknown');
  });
});

describe('readTrace', () => {
  it('reads the bare NaN the Swift trace writes for a missing keypoint (iPhone 23-10: JSON Parse error: Unexpected character: N)', async () => {
    jest.mocked(strFromU8).mockReturnValueOnce('{"wrist": [NaN, 1.5], "box": [Infinity, -Infinity]}');
    expect(await readTrace('/tmp/t.json.gz')).toEqual({ wrist: [NaN, 1.5], box: [Infinity, -Infinity] });
  });
});
