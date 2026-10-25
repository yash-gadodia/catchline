import { AppState } from 'react-native';
import { File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { gunzipSync, strFromU8 } from 'fflate';
import PoseCoreML, { type AnalysePlan, type AnalyseResult } from '../../modules/pose-coreml';
import { analyseTrace, planFromMisses } from '../analysis/device/analyseTrace';
import { parseTraceJson, type Plan } from '../analysis/device/trace';
import { parseAnalysis } from '../analysis/parse';
import type { Analysis, Failure } from '../analysis/types';
import type { ClipSubmission } from '../features/capture/submit';
import { rememberClip } from '../features/share/localClips';
import { usePurchases } from '../features/purchases/usePurchases';
import { randomUUID } from 'expo-crypto';
import type { SyncLiftInput } from '../lib/api';
import { EVENTS, track } from '../lib/analytics';
import { useUsage } from '../features/paywall/usageStore';
import { writeFreeUsed } from './freeLifts';
import { queueLiftSync } from './liftOutbox';
import { logIntercomEvent } from './intercom';
import { syncConsent } from './backend';
import { saveLocalLift } from './localLifts';
import { usePipeline } from './pipeline';
import { ClipTooLongError, discardPrepared, prepareClip } from './prepare';

// The native loop: pose + camera path first, then a plan built from what the replay
// could not measure (plates, keyframes) until nothing is missing. Pose is cached per
// clip on the native side, so the repeat passes are cheap.
export const MAX_PASSES = 3;
const KEEP_AWAKE_TAG = 'catchline-analyse';

// The native side never raises a lift-failure code (those come inside the Analysis from
// analyseTrace): it rejects with "Could not analyse on device: <code>: <detail>", the code
// being no_video_track, clip_unreadable, models_unavailable (download failed, offline or
// Low Data Mode, a retry works), stage_missing or plan_invalid; anything else is a
// file-system error. All but models_unavailable read as "couldn't read that video".
export const MODELS_UNAVAILABLE = 'models_unavailable';
const NATIVE_PREFIX = 'Could not analyse on device: ';

export function nativeCode(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message === 'cancelled') return message;
  if (!message.startsWith(NATIVE_PREFIX)) return 'unknown';
  return message.slice(NATIVE_PREFIX.length).split(':')[0].trim() || 'unknown';
}

export function failureReason(code: string): Failure['reason'] {
  return code === MODELS_UNAVAILABLE ? 'unknown' : 'clip_unreadable';
}

export async function readTrace(tracePath: string): Promise<unknown> {
  return parseTraceJson(strFromU8(gunzipSync(await new File(tracePath).bytes())));
}

type Progress = (stage: string, fraction: number) => void;

export type LoopResult = { trace: unknown; tracePath: string; stills: Record<string, string> };

// One native pass, with the app's time in the background allowed for: iOS may end
// the model while the app is away, so a pass that fails after that is run once more
// when the lifter comes back.
async function pass(uri: string, movement: string, plan: AnalysePlan | undefined): Promise<AnalyseResult> {
  const native = PoseCoreML;
  if (!native) throw new Error('no_native');
  let away = false;
  const sub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') away = true;
  });
  try {
    try {
      return await native.analyseOnDevice(uri, movement, plan);
    } catch (e) {
      if (!away) throw e;
      await new Promise<void>((resolve) => {
        if (AppState.currentState === 'active') return resolve();
        const back = AppState.addEventListener('change', (s) => {
          if (s !== 'active') return;
          back.remove();
          resolve();
        });
      });
      return await native.analyseOnDevice(uri, movement, plan);
    }
  } finally {
    sub.remove();
  }
}

// The TS port does not replay kipping HSPU yet (the rotated second pass): that movement keeps the server path.
export const DEVICE_MOVEMENTS = ['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up'];

// od-logic's plan keeps a wrist as [x | null, y | null]; the native side wants the pair or null.
const pair = (p: [number | null, number | null]): [number, number] | null => (p[0] == null || p[1] == null ? null : [p[0], p[1]]);

export function toNativePlan(plan: Plan): AnalysePlan {
  return {
    windows: plan.windows,
    plates: plan.plates.map((p) => ({ frame: p.frame, wristA: pair(p.wristA), wristB: pair(p.wristB), bodyH: p.bodyH, setupH: p.setupH })),
    tracks: plan.tracks,
    keyframes: plan.keyframes,
  };
}

export async function analyseLoop(uri: string, movement: string, liftId: string, onProgress: Progress, isCancelled: () => boolean = () => false): Promise<LoopResult> {
  const native = PoseCoreML;
  if (!native) throw new Error('no_native');
  let plan: AnalysePlan | undefined;
  let result: AnalyseResult | null = null;
  let trace: unknown = null;
  let stills: Record<string, string> = {};
  for (let i = 0; i < MAX_PASSES; i++) {
    const sub = native.addListener('onAnalyseProgress', (e) => onProgress(e.stage, (i + e.fraction) / MAX_PASSES));
    try {
      result = await pass(uri, movement, plan);
    } finally {
      sub.remove();
    }
    if (isCancelled()) throw new Error('cancelled');
    stills = { ...stills, ...result.stills };
    trace = await readTrace(result.tracePath);
    const { misses, ...next } = planFromMisses(trace, movement, { analysisId: liftId, assetPrefix: liftId });
    if (misses.length === 0) break;
    plan = toNativePlan(next);
  }
  onProgress('cue', 1);
  return { trace, tracePath: (result as AnalyseResult).tracePath, stills };
}

// The fields the worker's _finish sets on a server analysis.
export function finishAnalysis(a: Analysis, liftId: string, sub: ClipSubmission): Analysis {
  return { ...a, id: liftId, movement: sub.movement, ...(sub.loadKg != null ? { loadKg: sub.loadKg } : {}) };
}

export function deviceCue(a: Analysis): { faultId: string; text: string; why: string } | null {
  return a.cue ? { faultId: a.cue.faultId, text: a.cue.text, why: a.cue.why } : null;
}

let cancelled = false;

// The lifter gave up on this lift: the pass that is running is left to finish and
// its result is dropped.
export function cancelDeviceLift(): void {
  cancelled = true;
}

type Extras = { startClass?: string; yawBucket?: string };

// The slim record sync_lift keeps on the server: nothing biometric, no path.
export function syncRecord(a: Analysis, sub: ClipSubmission, analysedAt: Date): SyncLiftInput {
  const extras = a as Analysis & Extras;
  return {
    movement: sub.movement,
    loadKg: sub.loadKg ?? null,
    made: a.failure ? null : (a.reps[a.bestRepIndex]?.made ?? null),
    cue: a.failure ? null : deviceCue(a),
    noCueCode: a.noCueReason?.code ?? null,
    startClass: extras.startClass ?? null,
    yawBucket: extras.yawBucket ?? null,
    analysisVersion: a.analysisVersion ?? null,
    retestCueId: sub.retestCueId ?? null,
    failureCode: a.failure ? (a.failure.code ?? a.failure.reason) : null,
    analysedAt: analysedAt.toISOString(),
  };
}

// 3.1: the phone decides. The paywall gate ran before this (submitClip reads the
// Keychain count and RevenueCat's cached plan), so there is no server round trip:
// the clip is trimmed and analysed on the phone, kept in Documents, counted, and
// its slim record queued for sync_lift. Works in airplane mode. Never throws: the
// outcome lands on the job.
export async function startDeviceLift(sub: ClipSubmission & { uri: string }): Promise<void> {
  const { start, patch } = usePipeline.getState();
  cancelled = false;
  const liftId = randomUUID();
  start({
    id: `job-${Date.now()}`,
    movement: sub.movement,
    status: 'preparing',
    liftId,
    prepared: 0,
    sent: 0,
    total: 0,
    uploadUrl: null,
    error: null,
    maxS: null,
    uri: sub.uri,
    retestCueId: sub.retestCueId,
    device: true,
    stage: null,
    fraction: 0,
  });
  let prepared: string | null = null;
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
  try {
    void syncConsent().catch(() => undefined);
    rememberClip(liftId, sub.uri, sub.trim.start);
    const clip = await prepareClip(sub.uri, sub.trim, (p) => patch({ prepared: p }));
    prepared = clip.uri;
    patch({ status: 'analysing', prepared: 1 });
    const { trace, tracePath, stills } = await analyseLoop(clip.uri, sub.movement, liftId, (stage, fraction) => patch({ stage, fraction }), () => cancelled);
    const analysis = finishAnalysis(parseAnalysis(analyseTrace(trace, sub.movement, { analysisId: liftId, assetPrefix: liftId })), liftId, sub);
    const local = saveLocalLift(liftId, analysis, tracePath, stills);
    const now = new Date();
    if (!local.failure) await countLift(now);
    const record = syncRecord(local, sub, now);
    void queueLiftSync({ id: liftId, lift: record });
    if (local.failure) {
      track(EVENTS.ANALYSIS_FAILED, { movement: sub.movement, code: record.failureCode ?? 'unknown' });
      void logIntercomEvent('analysis_failed', { movement: sub.movement, error_code: record.failureCode ?? 'unknown' });
      patch({ status: 'failed', error: 'analysis_failed', result: local });
    } else {
      track(EVENTS.ANALYSIS_COMPLETED, { movement: sub.movement, cue_confidence: local.cue?.confidence ?? 'none', no_cue_code: record.noCueCode ?? 'none', made: record.made ?? 'unknown' });
      void logIntercomEvent('analysis_completed', { movement: sub.movement, made: record.made ?? 'unknown', cue_shown: !!local.cue });
      patch({ status: 'done', result: local });
    }
  } catch (e) {
    const code = e instanceof ClipTooLongError ? 'clip_too_long' : nativeCode(e);
    track(EVENTS.ANALYSIS_FAILED, { movement: sub.movement, code });
    void logIntercomEvent('analysis_failed', { movement: sub.movement, error_code: code });
    if (e instanceof ClipTooLongError) patch({ status: 'failed', error: 'clip_too_long', maxS: e.maxS });
    else if (code === 'cancelled' || code === MODELS_UNAVAILABLE) patch({ status: 'failed', error: code });
    else patch({ status: 'failed', error: 'analysis_failed', failureReason: failureReason(code), failureDetail: e instanceof Error ? e.message : String(e) });
  } finally {
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    if (prepared) discardPrepared(prepared);
  }
}

// A lift that got a result uses one of the free lifts (or this month's fair use):
// the local count, and the Keychain copy that outlives a reinstall.
async function countLift(now: Date): Promise<void> {
  useUsage.getState().record(usePurchases.getState().tier, now);
  await writeFreeUsed(useUsage.getState().usage.lifetime);
}
