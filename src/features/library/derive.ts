import type { Movement } from '../../analysis/types';
import { ANALYSES } from '../../analysis/fixtures';
import { fmt, movementLabel, plural } from '../../analysis/format';
import { BARBELL, GYMNASTICS, METRICS, PRIMARY_METRIC } from './metrics';
import { FREE_VIDEOS, type CueRecord, type CueStatus, type Day, type LibraryState, type Lift, type Session } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function utc(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function daysBetween(a: Day, b: Day): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
}

export function shortDate(day: Day): string {
  const d = utc(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function dayLabel(day: Day, today: Day): string {
  const d = utc(day);
  const label = `${WEEKDAYS[d.getUTCDay()]} ${shortDate(day)}`;
  return day === today ? `Today · ${label}` : label;
}

export function freeVideosLabel(s: Pick<LibraryState, 'plan' | 'freeVideosUsed'>): string | null {
  if (s.plan !== 'free') return null;
  const left = Math.max(0, FREE_VIDEOS - s.freeVideosUsed);
  if (left === FREE_VIDEOS) return `${FREE_VIDEOS} free videos`;
  if (left === 0) return 'Free videos used';
  return `${plural(left, 'free video')} left`;
}

export type Group = 'all' | 'barbell' | 'gymnastics';

export function groupMovements(group: Group): Movement[] {
  if (group === 'barbell') return BARBELL;
  if (group === 'gymnastics') return GYMNASTICS;
  return [...BARBELL, ...GYMNASTICS];
}

export function filterLifts(lifts: Lift[], group: Group, movement: Movement | null): Lift[] {
  const allowed = groupMovements(group);
  return lifts.filter((l) => allowed.includes(l.movement) && (movement == null || l.movement === movement));
}

export function groupByDay(lifts: Lift[], today: Day): { day: Day; label: string; lifts: Lift[] }[] {
  const sorted = [...lifts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const groups: { day: Day; label: string; lifts: Lift[] }[] = [];
  for (const l of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.day === l.date) last.lifts.push(l);
    else groups.push({ day: l.date, label: dayLabel(l.date, today), lifts: [l] });
  }
  return groups;
}

export function liftTitle(l: Lift): string {
  const parts = [movementLabel(l.movement)];
  if (l.reps != null) parts.push(plural(l.reps, 'rep'));
  if (l.loadKg != null) parts.push(`${fmt(l.loadKg)} kg`);
  return parts.join(' · ');
}

export function metricText(id: string, value: number): string {
  const m = METRICS[id];
  return m.unit === 'deg' ? `${fmt(value)}°` : `${fmt(value)} ${m.unit}`;
}

export function seriesFor(sessions: Session[], movement: Movement, metricId: string): { date: Day; value: number; session: Session }[] {
  return sessions
    .filter((s) => s.movement === movement && s.values[metricId] != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((s) => ({ date: s.date, value: s.values[metricId], session: s }));
}

export function bestOf<T extends { value: number }>(series: T[], metricId: string): T | undefined {
  if (series.length === 0) return undefined;
  const lower = METRICS[metricId].lowerIsBetter;
  return series.reduce((best, p) => ((lower ? p.value < best.value : p.value > best.value) ? p : best));
}

export function liftDetail(l: Lift, sessions: Session[]): string {
  if (l.status === 'processing') return 'analysing · about 20 s';
  if (l.status === 'queued') return 'Queued · free videos used';
  if (l.status === 'failed') return l.failure?.message ?? "Couldn't analyse";
  const analysis = l.analysisId ? ANALYSES[l.analysisId] : undefined;
  if (analysis?.cue && analysis.reps.every((r) => !r.made)) return `miss · ${analysis.cue.text.toLowerCase()}`;
  if (analysis?.cue && analysis.cue.confidence !== 'clear') return `possible · ${analysis.cue.text.toLowerCase()}`;
  const session = sessions.find((s) => s.liftId === l.id);
  const metricId = PRIMARY_METRIC[l.movement];
  const value = session?.values[metricId];
  if (value == null) return analysis?.cue ? analysis.cue.text.toLowerCase() : 'analysed';
  const best = bestOf(seriesFor(sessions, l.movement, metricId), metricId);
  const head = `${METRICS[metricId].label.toLowerCase()} ${metricText(metricId, value)}`;
  return best ? `${head} · best ${fmt(best.value)}` : head;
}

export type LiftLink =
  | { pathname: '/analysis/cue' | '/analysis/miss' | '/analysis/processing'; params: Record<string, string> }
  | { pathname: '/failure/[id]'; params: { id: string } }
  | { pathname: '/trends'; params: { movement: Movement } };

export function liftLink(l: Lift): LiftLink | null {
  if (l.status === 'processing') return { pathname: '/analysis/processing', params: {} };
  if (l.status === 'failed') return { pathname: '/failure/[id]', params: { id: l.id } };
  if (l.status === 'queued') return null;
  const analysis = l.analysisId ? ANALYSES[l.analysisId] : undefined;
  if (!analysis) return { pathname: '/trends', params: { movement: l.movement } };
  if (analysis.cue && analysis.reps.every((r) => !r.made)) return { pathname: '/analysis/miss', params: { fixture: analysis.id } };
  return { pathname: '/analysis/cue', params: { fixture: analysis.id } };
}

export function latestCue(cues: CueRecord[], movement: Movement): CueRecord | undefined {
  return cues
    .filter((c) => c.movement === movement)
    .sort((a, b) => (a.givenAt < b.givenAt ? 1 : -1))[0];
}

export function activeCue(cues: CueRecord[]): CueRecord | undefined {
  return cues.filter((c) => c.status === 'trying').sort((a, b) => (a.givenAt < b.givenAt ? 1 : -1))[0];
}

export function cueSessions(cue: CueRecord, sessions: Session[]): Session[] {
  return sessions.filter(
    (s) => s.movement === cue.movement && s.date > cue.givenAt && (cue.endedAt == null || s.date <= cue.endedAt)
  );
}

export function sessionsCounter(cue: CueRecord, sessions: Session[]): string {
  return `${cueSessions(cue, sessions).length} of ${cue.sessionsTarget}`;
}

// The metric's series around the cue: the session it was given on, then
// everything measured while it was being tried.
export function cueSeries(cue: CueRecord, sessions: Session[]): { date: Day; value: number }[] {
  const all = seriesFor(sessions, cue.movement, cue.metricId);
  const start = [...all].reverse().find((p) => p.date <= cue.givenAt);
  const during = all.filter((p) => p.date > cue.givenAt && (cue.endedAt == null || p.date <= cue.endedAt));
  return [...(start ? [start] : []), ...during].map(({ date, value }) => ({ date, value }));
}

export function cueChange(cue: CueRecord, sessions: Session[]): { from: number; to: number; weeks: number } | null {
  const s = cueSeries(cue, sessions);
  if (s.length < 2) return null;
  return { from: s[0].value, to: s[s.length - 1].value, weeks: Math.max(1, Math.round(daysBetween(s[0].date, s[s.length - 1].date) / 7)) };
}

export function pastCueSummary(cue: CueRecord, sessions: Session[]): string {
  const n = cueSessions(cue, sessions).length;
  if (cue.status === 'dropped') return `dropped after ${plural(Math.max(1, n), 'session')}`;
  const change = cueChange(cue, sessions);
  const m = METRICS[cue.metricId];
  if (!change) return m.label.toLowerCase();
  const span = `${m.label.toLowerCase()} ${fmt(change.from)} → ${fmt(change.to)} ${m.unit === 'deg' ? '°' : m.unit}`;
  return cue.status === 'stuck' ? `${span} · ${plural(change.weeks, 'wk')}` : span;
}

export const STATUS_LABEL: Record<CueStatus, string> = {
  trying: 'Trying',
  stuck: 'Stuck',
  didnt_stick: "Didn't stick",
  dropped: 'Dropped',
};

export type Range = 7 | 30 | 90;

export function inRange<T extends { date: Day }>(series: T[], today: Day, days: Range): T[] {
  return series.filter((p) => daysBetween(p.date, today) < days && daysBetween(p.date, today) >= 0);
}
