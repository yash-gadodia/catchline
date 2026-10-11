import type { Analysis, Movement } from '../analysis/types';
import { keyFrameForPhase, repByIndex } from '../analysis/timeline';
import { ensureSession, listAnalyses, listCues, listLifts } from '../lib/api';
import type { CueRow, Lift as LiftRow } from '../types/db';
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

function liftStatus(s: string): LiftStatus {
  if (s === 'done' || s === 'failed' || s === 'processing') return s;
  return 'queued';
}

export function toLift(row: LiftRow, a: Analysis | undefined): Lift {
  return {
    id: row.id,
    movement: row.movement as Movement,
    date: dayOf(row.created_at),
    loadKg: row.load_kg ?? undefined,
    reps: a && !a.failure ? a.reps.length : undefined,
    status: a?.failure ? 'failed' : liftStatus(row.status),
    analysisId: a && !a.failure ? a.id : undefined,
    thumb: catchImage(a),
    failure: a?.failure ?? undefined,
    headline: a?.cue?.evidence.caption,
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
    values: Object.fromEntries(a.measurements.map((m) => [m.id, m.value])),
  };
}

export function toCue(row: CueRow, byLift: Map<string, Analysis>): CueRecord {
  const first = row.first_lift_id ? byLift.get(row.first_lift_id) : undefined;
  const last = row.last_lift_id ? byLift.get(row.last_lift_id) : undefined;
  return {
    id: row.id,
    movement: row.movement as Movement,
    text: row.text,
    metricId: row.fault_id,
    givenAt: dayOf(row.created_at),
    endedAt: row.status === 'trying' ? undefined : dayOf(row.updated_at),
    status: row.status as CueStatus,
    sessionsTarget: Math.max(CUE_SESSIONS_TARGET, row.sessions),
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
  const sessions = lifts
    .filter((l) => l.status === 'done' && byLift.get(l.id) && !byLift.get(l.id)?.failure)
    .map((l) => toSession(l, byLift.get(l.id) as Analysis))
    .sort((a, b) => a.date.localeCompare(b.date));
  useLibraryStore.getState().load({
    today: dayOf(now.toISOString()),
    plan: usePurchases.getState().tier === 'free' ? 'free' : 'paid',
    freeVideosUsed: useUsage.getState().usage.lifetime,
    lifts: lifts.map((l) => toLift(l, byLift.get(l.id))),
    sessions,
    cues: cues.map((c) => toCue(c, byLift)),
  });
}
