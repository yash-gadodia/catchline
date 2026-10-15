import type { Analysis } from '../../analysis/types';
import { metricText } from './derive';
import { metricFor, type Metric } from './metrics';
import type { CueRecord, Lift, Session } from './types';

// Two retests in a row without the fault firing is when "It stuck" is offered.
export const RETESTS_TO_STICK = 2;

// A change smaller than this is measurement noise: "Same."
export const SAME_WITHIN: Record<Metric['unit'], number> = { cm: 2, s: 0.03, deg: 3, 'm/s': 0.05 };

export type VerdictKind = 'better' | 'same' | 'worse' | 'not_measured' | 'no_baseline';

export type Verdict = { kind: VerdictKind; from: number | null; to: number | null; fires: boolean; text: string };

const WORD: Record<'better' | 'same' | 'worse', string> = { better: 'Better.', same: 'Same.', worse: 'Worse.' };

export function faultFires(a: Analysis, faultId: string): boolean {
  if (a.cue?.faultId === faultId) return true;
  if (a.notes?.some((n) => n.faultId === faultId)) return true;
  const m = a.measurements.find((x) => x.id === faultId);
  return m?.status === 'cue' || m?.status === 'follows';
}

export function compareValues(metricId: string, from: number, to: number): 'better' | 'same' | 'worse' {
  const m = metricFor(metricId);
  if (Math.abs(to - from) < SAME_WITHIN[m.unit]) return 'same';
  return m.lowerIsBetter === to < from ? 'better' : 'worse';
}

// The cue's measurement in this clip against its last value before it, whatever the new headline is.
export function retestVerdict(metricId: string, from: number | null, a: Analysis): Verdict {
  const label = metricFor(metricId).label;
  const fires = faultFires(a, metricId);
  const now = a.measurements.find((x) => x.id === metricId);
  if (!now || now.status === 'not_seen') {
    return { kind: 'not_measured', from, to: null, fires, text: `Couldn't measure ${label.toLowerCase()} in this clip.` };
  }
  const to = now.value;
  if (from == null) {
    return { kind: 'no_baseline', from: null, to, fires, text: `${label} ${metricText(metricId, to)}. Nothing earlier to compare.` };
  }
  const kind = compareValues(metricId, from, to);
  return { kind, from, to, fires, text: `${label} ${metricText(metricId, from)} → ${metricText(metricId, to)}. ${WORD[kind]}` };
}

// Newest first: by day, then by the library's own order (lifts are listed newest first).
function newerFirst(lifts: Lift[]) {
  const rank = new Map(lifts.map((l, i) => [l.id, i]));
  const r = (id?: string) => (id != null ? (rank.get(id) ?? lifts.length) : lifts.length);
  return (a: { date: string; liftId?: string }, b: { date: string; liftId?: string }) =>
    a.date === b.date ? r(a.liftId) - r(b.liftId) : a.date < b.date ? 1 : -1;
}

export function liftOfAnalysis(analysisId: string, lifts: Lift[]): Lift | undefined {
  return lifts.find((l) => l.analysisId === analysisId || l.id === analysisId);
}

// The cue's metric on the newest session before this lift (the lift itself never counts).
export function previousValue(cue: CueRecord, sessions: Session[], lifts: Lift[], current?: Lift): number | null {
  const order = newerFirst(lifts);
  const candidates = sessions
    .filter((s) => s.movement === cue.movement && s.values[cue.metricId] != null && (current == null || s.liftId !== current.id))
    .filter((s) => current == null || order({ date: s.date, liftId: s.liftId }, { date: current.date, liftId: current.id }) > 0)
    .sort((a, b) => order(a, b));
  return candidates[0]?.values[cue.metricId] ?? null;
}

// How many of the cue's newest retests in a row did not fire its fault; `current` is the result on screen.
export function cleanStreak(
  cue: CueRecord,
  lifts: Lift[],
  analysisFor: (id: string) => Analysis | undefined,
  current?: Analysis
): number {
  const order = newerFirst(lifts);
  const retests = lifts
    .filter((l) => l.retestCueId === cue.id && l.status === 'done' && l.analysisId && l.analysisId !== current?.id)
    .sort((a, b) => order({ date: a.date, liftId: a.id }, { date: b.date, liftId: b.id }))
    .map((l) => analysisFor(l.analysisId as string))
    .filter((a): a is Analysis => a != null);
  let n = 0;
  for (const a of current ? [current, ...retests] : retests) {
    if (faultFires(a, cue.metricId)) break;
    n += 1;
  }
  return n;
}

// The one line over the shutter: the cue and the number to beat.
export function targetLine(cue: CueRecord, previous: number | null): string {
  if (previous == null) return cue.text;
  const m = metricFor(cue.metricId);
  // The number and its unit never wrap apart.
  return `${cue.text}: ${m.label.toLowerCase()} ${m.lowerIsBetter ? 'under' : 'over'} ${metricText(cue.metricId, previous).replace(' ', '\u00a0')}`;
}
