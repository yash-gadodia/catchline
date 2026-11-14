import { AppState } from 'react-native';
import { File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { gunzipSync, strFromU8 } from 'fflate';
import PoseCoreML, { type AnalyseBanner, type AnalysePlan, type AnalyseResult } from '../../modules/pose-coreml';
import { trackTrace } from '../analysis/device/analyseTrace';
import type { Body } from '../analysis/device/tracking';
import { parseTraceJson, type Plan } from '../analysis/device/trace';
import { parseAnalysis } from '../analysis/parse';
import type { Analysis, Failure, Movement } from '../analysis/types';
import type { PlateMark } from '../features/capture/plateMark';
import type { ClipSubmission } from '../features/capture/submit';
import { notifyLiftReady } from '../features/notifications';
import { rememberClip } from '../features/share/localClips';
import { hasBarPath } from '../features/share/trackShare';
import { findPlateSupported } from '../features/capture/plateFind';
import { usePurchases } from '../features/purchases/usePurchases';
import { randomUUID } from 'expo-crypto';
import type { SyncLiftInput } from '../lib/api';
import { EVENTS, track } from '../lib/analytics';
import { useUsage } from '../features/paywall/usageStore';
import { writeFreeUsed } from './freeLifts';
import { queueLiftSync } from './liftOutbox';
import { syncConsent } from './backend';
import { keepClip, localClipUri, readLocalAnalysis, saveLocalLift } from './localLifts';
import { usePipeline, type Job } from './pipeline';
import { detectedMade } from '../features/library/madeLog';
import { rememberLiftShape } from '../features/library/liftNames';
import { ClipTooLongError, discardPrepared, prepareClip } from './prepare';
import { t } from '../i18n';

// The native loop: pose + camera path first, then a plan built from what the replay
// could not measure (plates, keyframes) until nothing is missing. Pose is cached per
// clip on the native side, so the repeat passes are cheap.
export const MAX_PASSES = 3;
const KEEP_AWAKE_TAG = 'catchline-analyse';

// The native side never raises a lift-failure code (those come inside the Analysis from
// analyseTrace): it rejects with "Could not analyse on device: <code>: <detail>", the code
// being no_video_track, clip_unreadable, models_unavailable (download failed, offline or
// Low Data Mode, a retry works), stage_missing, plan_invalid or interrupted (iOS 26 ended
// the background run, see pass); anything else is a file-system error. All but
// models_unavailable and interrupted read as "couldn't read that video".
export const MODELS_UNAVAILABLE = 'models_unavailable';
export const INTERRUPTED = 'interrupted';
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

export type LoopResult = { analysis: unknown; body: Body | null; tracePath: string; stills: Record<string, string> };

// One native pass, with the app's time in the background allowed for. On iOS 26 the run
// goes on after the lifter leaves (the banner's continued processing task) until the system
// or the lifter ends it there: interrupted. Older iOS may end the model while the app is
// away. Either way a pass that fails after that is run once more when the lifter comes back.
async function pass(uri: string, plan: AnalysePlan | undefined, banner: AnalyseBanner): Promise<AnalyseResult> {
  const native = PoseCoreML;
  if (!native) throw new Error('no_native');
  let away = false;
  const sub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') away = true;
  });
  try {
    try {
      return await native.analyseOnDevice(uri, NATIVE_MOVEMENT, plan, banner);
    } catch (e) {
      if (!away && nativeCode(e) !== INTERRUPTED) throw e;
      await new Promise<void>((resolve) => {
        if (AppState.currentState === 'active') return resolve();
        const back = AppState.addEventListener('change', (s) => {
          if (s !== 'active') return;
          back.remove();
          resolve();
        });
      });
      return await native.analyseOnDevice(uri, NATIVE_MOVEMENT, plan, banner);
    }
  } finally {
    sub.remove();
  }
}

// 4.0 tracks any clip the same way: the native pass always picks the lifter as for a standing movement.
const NATIVE_MOVEMENT = 'snatch';

// od-logic's plan keeps a wrist as [x | null, y | null]; the native side wants the pair or null.
const pair = (p: [number | null, number | null]): [number, number] | null => (p[0] == null || p[1] == null ? null : [p[0], p[1]]);

export function toNativePlan(plan: Plan): AnalysePlan {
  return {
    windows: plan.windows,
    plates: plan.plates.map((p) => ({ frame: p.frame, wristA: pair(p.wristA), wristB: pair(p.wristB), bodyH: p.bodyH, setupH: p.setupH })),
    tracks: plan.tracks,
    follows: plan.follows.map((f) => ({ ...f, wrists: f.wrists.map(pair), wristA: pair(f.wristA), wristB: pair(f.wristB) })),
    keyframes: plan.keyframes,
    ...(plan.plateNet ? { plateNet: plan.plateNet.map((p) => ({ ...p, centres: p.centres.map(pair) })) } : {}),
  };
}

// The first pass runs pose on every frame and is nearly all of the wait; the later
// passes reuse it. The progress bar follows that, so it does not sit at a third.
export const PASS_WEIGHTS = [0.8, 0.12, 0.08];
const PASS_STARTS = PASS_WEIGHTS.map((_, i) => PASS_WEIGHTS.slice(0, i).reduce((a, b) => a + b, 0));

// plateMark: the lifter's mark on the plate, on that frame of the clip at `uri` (frame 0 when not given; null: none).
export async function analyseLoop(uri: string, movement: Movement, liftId: string, onProgress: Progress, isCancelled: () => boolean = () => false, plateMark: (PlateMark & { frame?: number }) | null = null): Promise<LoopResult> {
  const native = PoseCoreML;
  if (!native) throw new Error('no_native');
  const words = { title: t('library.inFlight.title'), subtitle: t('analysis.processing.background') };
  let plan: AnalysePlan | undefined;
  let result: AnalyseResult | null = null;
  let tracked: ReturnType<typeof trackTrace> | null = null;
  let stills: Record<string, string> = {};
  let finished = false;
  try {
    for (let i = 0; i < MAX_PASSES; i++) {
      const sub = native.addListener('onAnalyseProgress', (e) => onProgress(e.stage, PASS_STARTS[i] + e.fraction * PASS_WEIGHTS[i]));
      try {
        result = await pass(uri, plan, { ...words, from: PASS_STARTS[i], to: PASS_STARTS[i] + PASS_WEIGHTS[i] });
      } finally {
        sub.remove();
      }
      if (isCancelled()) throw new Error('cancelled');
      stills = { ...stills, ...result.stills };
      tracked = trackTrace(await readTrace(result.tracePath), { analysisId: liftId, assetPrefix: liftId, ...(plateMark ? { plateMark: { frame: plateMark.frame ?? 0, x: plateMark.x, y: plateMark.y, r: plateMark.r } } : {}) });
      if (tracked.misses.length === 0) break;
      plan = toNativePlan(tracked.plan);
    }
    finished = true;
  } finally {
    native.endBackgroundRun(finished).catch(() => undefined);
  }
  onProgress('cue', 1);
  return { analysis: tracked?.analysis, body: tracked?.body ?? null, tracePath: (result as AnalyseResult).tracePath, stills };
}

// The fields the worker's _finish sets on a server analysis.
export function finishAnalysis(a: Analysis, liftId: string, sub: ClipSubmission): Analysis {
  return { ...a, id: liftId, movement: sub.movement, ...(sub.loadKg != null ? { loadKg: sub.loadKg } : {}) };
}

export function deviceCue(a: Analysis): { faultId: string; text: string; why: string } | null {
  return a.cue ? { faultId: a.cue.faultId, text: a.cue.text, why: a.cue.why } : null;
}

// One lift runs at a time: the native passes share one model, and the job on screen is the one in flight.
let running: { liftId: string; done: Promise<void> } | null = null;
let cancelledRun: string | null = null;

// The lifter gave up on this lift: the pass that is running is left to finish and
// its result is dropped.
export function cancelDeviceLift(): void {
  cancelledRun = running?.liftId ?? null;
}

// The run still on the phone: a cancelled one finishing its last pass, or one the lifter hid.
export function deviceLiftInFlight(): { cancelled: boolean; done: Promise<void> } | null {
  return running ? { cancelled: cancelledRun === running.liftId, done: running.done } : null;
}

type Extras = { startClass?: string; yawBucket?: string };

// The slim record sync_lift keeps on the server: nothing biometric, no path.
export function syncRecord(a: Analysis, sub: ClipSubmission, analysedAt: Date): SyncLiftInput {
  const extras = a as Analysis & Extras;
  return {
    movement: sub.movement,
    loadKg: sub.loadKg ?? null,
    made: detectedMade(a),
    cue: a.failure ? null : deviceCue(a),
    noCueCode: a.noCueReason?.code ?? null,
    startClass: extras.startClass ?? null,
    yawBucket: extras.yawBucket ?? null,
    analysisVersion: a.analysisVersion ?? null,
    retestCueId: null,
    failureCode: a.failure ? (a.failure.code ?? a.failure.reason) : null,
    analysedAt: analysedAt.toISOString(),
  };
}

// 3.1: the phone decides. The paywall gate ran before this (submitClip reads the
// Keychain count and RevenueCat's cached plan), so there is no server round trip:
// the clip is trimmed and analysed on the phone, kept in Documents, counted, and
// its slim record queued for sync_lift. Works in airplane mode. Never throws: the
// outcome lands on the job.
export function startDeviceLift(sub: ClipSubmission & { uri: string }): Promise<void> {
  const liftId = randomUUID();
  const done = runDeviceLift(sub, liftId).finally(() => {
    if (running?.liftId === liftId) running = null;
  });
  running = { liftId, done };
  return done;
}

async function runDeviceLift(sub: ClipSubmission & { uri: string }, liftId: string): Promise<void> {
  const jobId = `job-${liftId}`;
  // a run only ever writes to its own job, never to one started after it
  const patch = (fields: Partial<Job>) => {
    if (usePipeline.getState().job?.id === jobId) usePipeline.getState().patch(fields);
  };
  usePipeline.getState().start({
    id: jobId,
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
    device: true,
    stage: null,
    fraction: 0,
  });
  const startedAt = Date.now();
  // the plate found on one frame and checked by the lifter (4.0.3 on): taken or adjusted, skipped, or never asked
  // for (4.0.2: the tracker finds the plate itself, and a mark comes only from adjusting it afterwards)
  const mark = sub.plateMark ? 'made' : findPlateSupported() ? 'skipped' : 'not_asked';
  track(EVENTS.TRACK_STARTED, { source: sub.source, mark });
  let prepared: string | null = null;
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
  try {
    void syncConsent().catch(() => undefined);
    rememberClip(liftId, sub.uri, sub.trim.start);
    const clip = await prepareClip(sub.uri, sub.trim, (p) => patch({ prepared: p }));
    prepared = clip.uri;
    patch({ status: 'analysing', prepared: 1 });
    // the mark was made atS into the trimmed clip: that is this frame of the prepared one
    const marked = sub.plateMark ? { ...sub.plateMark, frame: Math.max(0, Math.round((sub.plateMark.atS ?? 0) * (clip.fps || 30))) } : null;
    const loop = await analyseLoop(clip.uri, sub.movement, liftId, (stage, fraction) => patch({ stage, fraction }), () => cancelledRun === liftId, marked);
    const analysis = finishAnalysis(parseAnalysis(loop.analysis), liftId, sub);
    const local = saveLocalLift(liftId, analysis, loop.tracePath, loop.stills, loop.body);
    // 4.0: the clip stays on the phone with its lift (the player draws on the real video); deleted with the lift.
    keepClip(liftId, clip.uri);
    if (!local.failure) rememberLiftShape(liftId, { analysis: local, body: loop.body ?? null });
    prepared = null;
    const now = new Date();
    if (!local.failure) await countLift(now);
    const record = syncRecord(local, sub, now);
    void queueLiftSync({ id: liftId, lift: record });
    if (local.failure) {
      track(EVENTS.ANALYSIS_FAILED, { movement: sub.movement, code: record.failureCode ?? 'unknown' });
      patch({ status: 'failed', error: 'analysis_failed', result: local });
    } else {
      track(EVENTS.TRACK_COMPLETED, { seconds: Math.round((Date.now() - startedAt) / 1000), frames: local.video.frameCount, has_bar_path: hasBarPath(local), mark });
      track(EVENTS.ANALYSIS_COMPLETED, { movement: sub.movement, cue_confidence: local.cue?.confidence ?? 'none', no_cue_code: record.noCueCode ?? 'none', made: record.made ?? 'unknown' });
      patch({ status: 'done', result: local });
    }
    void notifyLiftReady(liftId, !!local.failure);
  } catch (e) {
    const code = e instanceof ClipTooLongError ? 'clip_too_long' : nativeCode(e);
    track(EVENTS.ANALYSIS_FAILED, { movement: sub.movement, code });
    if (e instanceof ClipTooLongError) patch({ status: 'failed', error: 'clip_too_long', maxS: e.maxS });
    else if (code === 'cancelled' || code === MODELS_UNAVAILABLE) patch({ status: 'failed', error: code });
    else patch({ status: 'failed', error: 'analysis_failed', failureReason: failureReason(code), failureDetail: e instanceof Error ? e.message : String(e) });
  } finally {
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    if (prepared) discardPrepared(prepared);
  }
}

// The lifter adjusted the plate on a lift already tracked: its kept clip is tracked again from that mark and the
// result replaces the old one. It uses no free lift, and a run that fails leaves the lift as it was.
export function retrackLift(liftId: string, movement: Movement, plateMark: PlateMark & { frame: number }): Promise<void> | null {
  const uri = localClipUri(liftId);
  if (!uri || running) return null;
  const done = runRetrack(liftId, uri, movement, plateMark).finally(() => {
    if (running?.liftId === liftId) running = null;
  });
  running = { liftId, done };
  return done;
}

async function runRetrack(liftId: string, uri: string, movement: Movement, plateMark: PlateMark & { frame: number }): Promise<void> {
  const jobId = `job-${Date.now()}`;
  const patch = (fields: Partial<Job>) => {
    if (usePipeline.getState().job?.id === jobId) usePipeline.getState().patch(fields);
  };
  usePipeline.getState().start({ id: jobId, movement, status: 'analysing', liftId, prepared: 1, sent: 0, total: 0, uploadUrl: null, error: null, maxS: null, uri, device: true, stage: null, fraction: 0 });
  track(EVENTS.TRACK_STARTED, { source: 'adjust', mark: 'made' });
  const startedAt = Date.now();
  activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
  try {
    const before = await readLocalAnalysis(liftId);
    const loop = await analyseLoop(uri, movement, liftId, (stage, fraction) => patch({ stage, fraction }), () => cancelledRun === liftId, plateMark);
    const parsed = parseAnalysis(loop.analysis);
    const analysis: Analysis = { ...parsed, id: liftId, movement, ...(before?.loadKg != null ? { loadKg: before.loadKg } : {}) };
    if (analysis.failure) {
      track(EVENTS.ANALYSIS_FAILED, { movement, code: analysis.failure.code ?? analysis.failure.reason });
      patch({ status: 'failed', error: 'analysis_failed', result: analysis });
      return;
    }
    const local = saveLocalLift(liftId, analysis, loop.tracePath, loop.stills, loop.body);
    rememberLiftShape(liftId, { analysis: local, body: loop.body ?? null });
    track(EVENTS.TRACK_COMPLETED, { seconds: Math.round((Date.now() - startedAt) / 1000), frames: local.video.frameCount, has_bar_path: hasBarPath(local), mark: 'made' });
    patch({ status: 'done', result: local });
  } catch (e) {
    const code = nativeCode(e);
    track(EVENTS.ANALYSIS_FAILED, { movement, code });
    if (code === 'cancelled' || code === MODELS_UNAVAILABLE) patch({ status: 'failed', error: code });
    else patch({ status: 'failed', error: 'analysis_failed', failureReason: failureReason(code), failureDetail: e instanceof Error ? e.message : String(e) });
  } finally {
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  }
}

// A lift that got a result uses one of the free lifts (or this month's fair use):
// the local count, and the Keychain copy that outlives a reinstall.
async function countLift(now: Date): Promise<void> {
  useUsage.getState().record(usePurchases.getState().tier, now);
  await writeFreeUsed(useUsage.getState().usage.lifetime);
}
