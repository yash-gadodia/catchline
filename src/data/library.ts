import { t } from '../i18n';
import type { Analysis, Failure, Movement } from '../analysis/types';
import { putLiveAnalysis } from '../analysis/live';
import { keyFrameForPhase, repByIndex } from '../analysis/timeline';
import { ensureSession, listAnalyses, listCues, listLifts } from '../lib/api';
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
  if (s === 'queued') return 'processing';
  return 'queued';
}

// lifts.error holds a worker code from a closed set; anything else (or nothing) is our fault.
function workerFailure(row: LiftRow): Failure {
  const reason: Failure['reason'] = row.error && row.error in FAILURE_COPY ? (row.error as Failure['reason']) : 'unknown';
  return { reason, message: FAILURE_COPY[reason].title };
}

// A lift row exists from create_lift on, so 'uploading' is a clip still on its way; one still uploading after
// STALE_UPLOAD_MS never made it (the app was closed mid-upload) and is not the free-videos 'queued' state.
const STALE_UPLOAD_MS = 15 * 60 * 1000;

function stuckUpload(row: LiftRow, now: number): boolean {
  return row.status === 'uploading' && now - Date.parse(row.created_at) > STALE_UPLOAD_MS;
}

export function toLift(row: LiftRow, a: Analysis | undefined, now: number = Date.now()): Lift {
  const stuck = stuckUpload(row, now);
  const status: LiftStatus = a?.failure || stuck ? 'failed' : row.status === 'uploading' ? 'processing' : liftStatus(row.status);
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

// Backend mode: replace the fixture library with the lifter's own lifts,
// sessions (one per analysed lift) and cue memory.
export async function syncLibrary(now: Date = new Date()): Promise<void> {
  await ensureSession();
  const [lifts, cues, analyses] = await Promise.all([listLifts(), listCues(), listAnalyses()]);
  const byLift = new Map(analyses.map((r) => [r.liftId, r.analysis]));
  for (const r of analyses) putLiveAnalysis(r.analysis);
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
