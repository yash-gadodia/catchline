import type { Movement } from '../../analysis/types';
import { ANALYSES } from '../../analysis/fixtures';
import { liveAnalysis } from '../../analysis/live';
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
  const analysis = l.analysisId ? (liveAnalysis(l.analysisId) ?? ANALYSES[l.analysisId]) : undefined;
  if (analysis?.cue && analysis.reps.every((r) => !r.made)) return `miss · ${analysis.cue.text.toLowerCase()}`;
  if (analysis?.cue && analysis.cue.confidence !== 'clear') return `possible · ${analysis.cue.text.toLowerCase()}`;
  const session = sessions.find((s) => s.liftId === l.id);
  const metricId = PRIMARY_METRIC[l.movement];
  const value = session?.values[metricId];
  // The headline number first, so a row reads without opening it.
  if (value == null) return analysis?.cue ? analysis.cue.evidence.caption : (l.headline ?? 'analysed');
  const best = bestOf(seriesFor(sessions, l.movement, metricId), metricId);
  const head = `${METRICS[metricId].short} ${metricText(metricId, value)}`;
  return best ? `${head} · best ${metricText(metricId, best.value)}` : head;
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

// The newest analysed lift of each movement carries that movement's cue status.
export function newestDone(lifts: Lift[]): Set<string> {
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const l of [...lifts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))) {
    if (l.status !== 'done' || seen.has(l.movement)) continue;
    seen.add(l.movement);
    ids.add(l.id);
  }
  return ids;
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

// A cue's chart: a couple of sessions before it was given for context, the
// marker on the session it was given, then everything since.
export function cueWindow(
  cue: CueRecord,
  sessions: Session[],
  before = 2
): { series: { date: Day; value: number }[]; markerIndex: number | null } {
  const all = seriesFor(sessions, cue.movement, cue.metricId).filter((p) => cue.endedAt == null || p.date <= cue.endedAt);
  const given = all.reduce((idx, p, i) => (p.date <= cue.givenAt ? i : idx), -1);
  const start = Math.max(0, given - before);
  return {
    series: all.slice(start).map(({ date, value }) => ({ date, value })),
    markerIndex: given < 0 ? null : given - start,
  };
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export function didntStickHeadline(cue: CueRecord, sessions: Session[]): string {
  const n = cueSessions(cue, sessions).length;
  const count = `${NUMBER_WORDS[n] ?? String(n)} ${n === 1 ? 'session' : 'sessions'}`;
  const series = cueSeries(cue, sessions);
  if (series.length === 0) return `${count} and it hasn't moved yet.`;
  const m = METRICS[cue.metricId];
  const v = metricText(cue.metricId, series[series.length - 1].value);
  const still = m.still ? m.still.replace('{v}', v) : `${m.label.toLowerCase()} is still ${v}`;
  return `${count} and ${still}.`;
}

export function trendDirection(series: { value: number }[], metricId: string): string {
  if (series.length < 2) return '';
  const first = series[0].value;
  const last = series[series.length - 1].value;
  if (first === last) return 'Holding steady.';
  const better = METRICS[metricId].lowerIsBetter ? last < first : last > first;
  return better ? 'Heading the right way.' : 'Not moving yet.';
}

// Trends opens with the sentence people actually read, then the chart:
// "Bar drift at hip: 6 cm today. Best 2 cm on 18 Sep. Trying “Stay over the bar longer”: 4 of 6 sessions."
export function trendRecap(
  metricId: string,
  series: { date: Day; value: number }[],
  today: Day,
  cue: CueRecord | undefined,
  sessions: Session[]
): string | null {
  const latest = series[series.length - 1];
  if (!latest) return null;
  const when = latest.date === today ? 'today' : `on ${shortDate(latest.date)}`;
  const parts = [`${METRICS[metricId].label}: ${metricText(metricId, latest.value)} ${when}.`];
  const best = bestOf(series, metricId);
  if (best && best.value !== latest.value) parts.push(`Best ${metricText(metricId, best.value)} on ${shortDate(best.date)}.`);
  else parts.push('Your best yet.');
  if (cue?.status === 'trying' && cue.metricId === metricId) parts.push(`Trying “${cue.text}”: ${sessionsCounter(cue, sessions)} sessions.`);
  return parts.join(' ');
}
