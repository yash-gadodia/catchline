import { t } from '../i18n';
import type { Analysis, Failure, Movement } from '../analysis/types';
import { putLiveAnalysis } from '../analysis/live';
import { keyFrameForPhase, repByIndex } from '../analysis/timeline';
import { deleteLift, ensureSession, listCues, listLifts } from '../lib/api';
import { deleteLocalLift, listLocalAnalyses } from './localLifts';
import { flushLiftOutbox, useLiftOutbox, type OutboxItem } from './liftOutbox';
import type { CueRow, Lift as LiftRow } from '../types/db';
import { FAILURE_COPY } from '../features/library/failures';
import { useLibraryStore } from '../features/library/store';
import type { CueRecord, CueStatus, Day, Lift, LiftStatus, Session } from '../features/library/types';
import { useUsage } from '../features/paywall/usageStore';
import { usePurchases } from '../features/purchases/usePurchases';

const CUE_SESSIONS_TARGET = 6;

export function dayOf(iso: string): Day {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function catchImage(a: Analysis | undefined): string | undefined {
  if (!a || a.reps.length === 0) return undefined;
  const rep = repByIndex(a, a.bestRepIndex);
  return (keyFrameForPhase(rep, 'catch') ?? rep.keyFrames[rep.keyFrames.length - 1])?.image;
}

// The library's 'queued' means "saved, waiting for an unlock" (the row offers
// Unlock); a lift the server has already accepted is processing from the
// lifter's side whether the worker has picked it up yet or not.
function liftStatus(s: string): LiftStatus {
  if (s === 'done' || s === 'failed' || s === 'processing') return s;
  if (s === 'queued' || s === 'analysing') return 'processing';
  return 'queued';
}

// lifts.error holds a worker code from a closed set; anything else (or nothing) is our fault.
function workerFailure(row: LiftRow): Failure {
  const reason: Failure['reason'] = row.error && row.error in FAILURE_COPY ? (row.error as Failure['reason']) : 'unknown';
  return { reason, message: FAILURE_COPY[reason].title };
}

// A lift row exists from create_lift on, so 'uploading' is a clip still on its way and 'analysing' a phone at
// work on it; one still there after STALE_UPLOAD_MS never made it (the app was closed mid-way) and is not the
// free-videos 'queued' state.
export const STALE_UPLOAD_MS = 15 * 60 * 1000;

export function stuckUpload(row: LiftRow, now: number): boolean {
  return (row.status === 'uploading' || row.status === 'analysing') && now - Date.parse(row.created_at) > STALE_UPLOAD_MS;
}

export function toLift(row: LiftRow, a: Analysis | undefined, now: number = Date.now()): Lift {
  const stuck = stuckUpload(row, now);
  const status: LiftStatus = a?.failure || stuck ? 'failed' : row.status === 'uploading' ? 'processing' : liftStatus(row.status);
  const cueOnly = !a && row.status === 'done';
  return {
    id: row.id,
    movement: row.movement as Movement,
    date: dayOf(row.created_at),
    loadKg: row.load_kg ?? undefined,
    reps: a && !a.failure ? a.reps.length : undefined,
    status,
    analysisId: a && !a.failure ? a.id : undefined,
    thumb: catchImage(a),
    failure: a?.failure ?? (stuck ? { reason: 'unknown', message: t('library.detail.uploadStuck') } : status === 'failed' ? workerFailure(row) : undefined),
    headline: a?.cue?.evidence.caption,
    retestCueId: row.retest_cue_id ?? undefined,
    // 3.1: a lift whose analysis lives on another phone (or was analysed by 3.0 and purged).
    ...(cueOnly ? { cueId: row.cue_id ?? undefined } : {}),
  };
}

export function toSession(row: LiftRow, a: Analysis): Session {
  return {
    id: `s-${row.id}`,
    movement: row.movement as Movement,
    date: dayOf(row.created_at),
    loadKg: row.load_kg ?? undefined,
    liftId: row.id,
    thumb: catchImage(a),
    values: Object.fromEntries(a.measurements.filter((m) => m.status !== 'not_seen').map((m) => [m.id, m.value])),
    analysisVersion: a.analysisVersion,
  };
}

export function toCue(row: CueRow, byLift: Map<string, Analysis>): CueRecord {
  const first = row.first_lift_id ? byLift.get(row.first_lift_id) : undefined;
  const last = row.last_lift_id ? byLift.get(row.last_lift_id) : undefined;
  return {
    id: row.id,
    movement: row.movement as Movement,
    text: row.text,
    why: row.why ?? undefined,
    metricId: row.fault_id,
    givenAt: dayOf(row.created_at),
    endedAt: row.status === 'trying' ? undefined : dayOf(row.updated_at),
    status: row.status as CueStatus,
    sessionsTarget: Math.max(CUE_SESSIONS_TARGET, row.sessions),
    sessionsDone: row.sessions,
    firstLiftId: row.first_lift_id ?? undefined,
    lastLiftId: row.last_lift_id ?? undefined,
    before: { image: catchImage(first) ?? catchImage(last) ?? '' },
    after: { image: catchImage(last) ?? '' },
  };
}

// A lift analysed on this phone that the server has no row for yet (offline, or
// no session): the library lists it from the outbox record.
export function localRow(item: OutboxItem): LiftRow {
  const l = item.lift;
  return {
    id: item.id,
    user_id: '',
    movement: l.movement,
    load_kg: l.loadKg,
    status: l.failureCode ? 'failed' : 'done',
    error: l.failureCode,
    clip_path: `device/${item.id}`,
    charged_to: null,
    attempts: 0,
    created_at: l.analysedAt,
    updated_at: l.analysedAt,
    queued_at: null,
    processed_at: l.analysedAt,
    clip_deleted_at: l.analysedAt,
    pose_source: 'on_device',
    retest_cue_id: l.retestCueId,
    cue_id: null,
    no_cue_code: l.noCueCode,
    made: l.made,
    start_class: l.startClass,
    yaw_bucket: l.yawBucket,
    analysis_version: l.analysisVersion,
  };
}

// 3.1, offline first: the lifts are the analyses in Documents plus what the
// server knows (cue-only lifts from another phone, and cue memory). Offline the
// server half is the last copy kept on the phone.
export async function syncLibrary(now: Date = new Date()): Promise<void> {
  const analyses = await listLocalAnalyses();
  const byLift = new Map(analyses.map((r) => [r.liftId, r.analysis]));
  for (const r of analyses) putLiveAnalysis(r.analysis);
  let serverLifts: LiftRow[] = [];
  let cues: CueRow[] = useLiftOutbox.getState().cues;
  try {
    await ensureSession();
    await flushLiftOutbox();
    [serverLifts, cues] = await Promise.all([listLifts(), listCues()]);
    useLiftOutbox.getState().setCues(cues);
  } catch {
    // offline: local lifts and the cached cue memory
  }
  const onServer = new Set(serverLifts.map((l) => l.id));
  const pending = useLiftOutbox.getState().items.filter((i) => !onServer.has(i.id) && byLift.has(i.id)).map(localRow);
  const lifts = [...pending, ...serverLifts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sessions = lifts
    .filter((l) => l.status === 'done' && byLift.get(l.id) && !byLift.get(l.id)?.failure)
    .map((l) => toSession(l, byLift.get(l.id) as Analysis))
    .sort((a, b) => a.date.localeCompare(b.date));
  useLibraryStore.getState().load({
    today: dayOf(now.toISOString()),
    synced: true,
    plan: usePurchases.getState().tier === 'free' ? 'free' : 'paid',
    freeVideosUsed: useUsage.getState().usage.lifetime,
    lifts: lifts.map((l) => toLift(l, byLift.get(l.id))),
    sessions,
    cues: cues.map((c) => toCue(c, byLift)),
  });
}

// Deletes a lift everywhere. A lift the server holds goes there first, so a failed
// delete (offline) leaves it whole rather than half gone.
export async function removeLift(liftId: string): Promise<void> {
  const item = useLiftOutbox.getState().items.find((i) => i.id === liftId);
  if (!item || item.synced) await deleteLift(liftId);
  deleteLocalLift(liftId);
  useLiftOutbox.getState().forget(liftId);
}
