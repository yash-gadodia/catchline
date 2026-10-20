import { AppState } from 'react-native';
import { File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { gunzipSync, strFromU8 } from 'fflate';
import PoseCoreML, { type AnalysePlan, type AnalyseResult } from '../../modules/pose-coreml';
import { analyseTrace, planFromMisses } from '../analysis/device/analyseTrace';
import type { Plan } from '../analysis/device/trace';
import { parseAnalysis } from '../analysis/parse';
import type { Analysis, Failure } from '../analysis/types';
import type { ClipSubmission } from '../features/capture/submit';
import { rememberClip } from '../features/share/localClips';
import { usePurchases } from '../features/purchases/usePurchases';
import { ApiError, failDeviceLift, reserveLift, saveDeviceAnalysis, startDeviceAnalysis, syncPlan, type ReserveLiftInput } from '../lib/api';
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
  return JSON.parse(strFromU8(gunzipSync(await new File(tracePath).bytes())));
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

// A paid lifter the server still thinks is free (a missed webhook) is capped by
// create_lift: pull the plan from RevenueCat and try once more before the cap paywall.
async function reserveLiftSynced(input: ReserveLiftInput) {
  try {
    return await reserveLift(input);
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== 'cap_reached' || usePurchases.getState().tier === 'free') throw e;
    await syncPlan().catch(() => undefined);
    return reserveLift(input);
  }
}

let cancelled = false;

// The lifter gave up on this lift: the pass that is running is left to finish and
// its result is dropped; the lift is failed and refunded.
export function cancelDeviceLift(): void {
  cancelled = true;
}

// Consent, then create_lift (cap checked and charged server-side), then the clip is
// trimmed and analysed on the phone. The analysis, trace and stills are kept in the
// app's Documents folder; the server gets the cue record only. Never throws: the
// outcome lands on the job.
export async function startDeviceLift(sub: ClipSubmission & { uri: string }): Promise<void> {
  const { start, patch } = usePipeline.getState();
  cancelled = false;
  start({
    id: `job-${Date.now()}`,
    movement: sub.movement,
    status: 'preparing',
    liftId: null,
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
  let liftId: string | null = null;
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
  try {
    await syncConsent();
    const lift = await reserveLiftSynced({ movement: sub.movement, loadKg: sub.loadKg ?? undefined, retestCueId: sub.retestCueId });
    liftId = lift.id;
    patch({ liftId });
    await startDeviceAnalysis(lift.id);
    rememberClip(lift.id, sub.uri, sub.trim.start);
    const clip = await prepareClip(sub.uri, sub.trim, (p) => patch({ prepared: p }));
    prepared = clip.uri;
    patch({ status: 'analysing', prepared: 1 });
    const { trace, tracePath, stills } = await analyseLoop(clip.uri, sub.movement, lift.id, (stage, fraction) => patch({ stage, fraction }), () => cancelled);
    const analysis = finishAnalysis(parseAnalysis(analyseTrace(trace, sub.movement, { analysisId: lift.id, assetPrefix: lift.id })), lift.id, sub);
    const local = saveLocalLift(lift.id, analysis, tracePath, stills);
    if (local.failure) {
      await failDeviceLift(lift.id, local.failure.code ?? local.failure.reason);
      patch({ status: 'failed', error: 'analysis_failed', result: local });
      return;
    }
    await saveDeviceAnalysis(lift.id, deviceCue(local), local.noCueReason?.code ?? null);
    patch({ status: 'done', result: local });
  } catch (e) {
    const code = e instanceof ClipTooLongError ? 'clip_too_long' : e instanceof ApiError ? e.code : nativeCode(e);
    if (liftId) await failDeviceLift(liftId, code).catch(() => undefined);
    if (e instanceof ClipTooLongError) patch({ status: 'failed', error: 'clip_too_long', maxS: e.maxS });
    else if (e instanceof ApiError) patch({ status: 'failed', error: e.code });
    else if (code === 'cancelled' || code === MODELS_UNAVAILABLE) patch({ status: 'failed', error: code });
    else patch({ status: 'failed', error: 'analysis_failed', failureReason: failureReason(code) });
  } finally {
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    if (prepared) discardPrepared(prepared);
  }
}
