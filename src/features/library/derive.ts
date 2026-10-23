import type { Movement } from '../../analysis/types';
import { ANALYSES } from '../../analysis/fixtures';
import { liveAnalysis } from '../../analysis/live';
import { isPartial } from '../../analysis/parse';
import { fmt, movementLabel, speedText } from '../../analysis/format';
import { formatDate, getLocale, t } from '../../i18n';
import { cueText } from '../../i18n/cues';
import { failureMessage } from './failures';
import { BARBELL, GYMNASTICS, metricFor, PRIMARY_METRIC } from './metrics';
import { FREE_VIDEOS, type CueRecord, type CueStatus, type Day, type LibraryState, type Lift, type Session } from './types';

// German capitalises nouns, so a label mid-sentence keeps its case there.
export function lower(s: string): string {
  return getLocale() === 'de' ? s : s.toLowerCase();
}

function utc(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function daysBetween(a: Day, b: Day): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
}

export function shortDate(day: Day): string {
  const d = utc(day);
  return t('library.date.dayMonth', { day: d.getUTCDate(), month: formatDate(d, { month: 'short', timeZone: 'UTC' }) });
}

export function dayLabel(day: Day, today: Day): string {
  const d = utc(day);
  const label = t('library.date.weekday', { weekday: formatDate(d, { weekday: 'short', timeZone: 'UTC' }), date: shortDate(day) });
  return day === today ? t('library.date.today', { label }) : label;
}

export function freeVideosLabel(s: Pick<LibraryState, 'plan' | 'freeVideosUsed'>): string | null {
  if (s.plan !== 'free') return null;
  const left = Math.max(0, FREE_VIDEOS - s.freeVideosUsed);
  if (left === FREE_VIDEOS) return t('library.free.all', { count: FREE_VIDEOS });
  if (left === 0) return t('library.free.used');
  return t('library.free.left', { count: left });
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
  if (l.reps != null) parts.push(t('library.reps', { count: l.reps }));
  if (l.loadKg != null) parts.push(`${fmt(l.loadKg)} kg`);
  return parts.join(' · ');
}

export function metricText(id: string, value: number): string {
  const m = metricFor(id);
  if (m.unit === 'm/s') return speedText(value);
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
  const lower = metricFor(metricId).lowerIsBetter;
  return series.reduce((best, p) => ((lower ? p.value < best.value : p.value > best.value) ? p : best));
}

// When a movement's history spans more than one analysis version: the day the
// newest version took over, and the sessions an older version measured.
export function versionBoundary(sessions: Session[], movement: Movement): { since: Day; older: Set<string> } | null {
  const mine = sessions.filter((s) => s.movement === movement).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const current = mine[mine.length - 1]?.analysisVersion;
  const lastOlder = mine.map((s) => s.analysisVersion !== current).lastIndexOf(true);
  if (lastOlder < 0) return null;
  return {
    since: mine[lastOlder + 1].date,
    older: new Set(mine.filter((s) => s.analysisVersion !== current).map((s) => s.id)),
  };
}

export function versionNote(since: Day): string {
  return t('library.versionNote', { date: shortDate(since) });
}

// cueShown: the row already carries the cue status line ("Trying · …"), so the
// low-confidence "possible · …" qualifier would repeat the cue on the same row.
export function liftDetail(l: Lift, sessions: Session[], opts: { cueShown?: boolean } = {}): string {
  if (l.status === 'processing') return t('library.detail.processing');
  if (l.status === 'queued') return t('library.detail.queued');
  if (l.status === 'failed') return l.failure ? failureMessage(l.failure) : t('library.detail.failed');
  const analysis = l.analysisId ? (liveAnalysis(l.analysisId) ?? ANALYSES[l.analysisId]) : undefined;
  const cue = analysis?.cue ? lower(cueText(analysis.cue.faultId, analysis.cue.text)) : '';
  if (analysis?.cue && analysis.reps.every((r) => !r.made)) return t('library.detail.miss', { cue });
  if (analysis?.cue && analysis.cue.confidence !== 'clear' && !opts.cueShown) return t('library.detail.possible', { cue });
  const session = sessions.find((s) => s.liftId === l.id);
  const metricId = PRIMARY_METRIC[l.movement];
  const value = session?.values[metricId];
  if (analysis && isPartial(analysis)) {
    return value == null ? t('library.detail.noCueOnly') : t('library.detail.noCue', { head: `${metricFor(metricId).short} ${metricText(metricId, value)}` });
  }
  if (analysis && !analysis.cue && !analysis.failure && analysis.reps.length > 0) {
    return value == null
      ? t('library.detail.clean')
      : t('library.detail.cleanHead', { head: `${metricFor(metricId).short} ${metricText(metricId, value)}` });
  }
  // The headline number first, so a row reads without opening it.
  if (value == null) return analysis?.cue ? analysis.cue.evidence.caption : (l.headline ?? t('library.detail.analysed'));
  const best = bestOf(seriesFor(sessions, l.movement, metricId), metricId);
  const head = `${metricFor(metricId).short} ${metricText(metricId, value)}`;
  return best ? t('library.detail.best', { head, value: metricText(metricId, best.value) }) : head;
}

export type LiftLink =
  | { pathname: '/analysis/cue' | '/analysis/miss' | '/analysis/processing'; params: Record<string, string> }
  | { pathname: '/failure/[id]'; params: { id: string } }
  | { pathname: '/trends'; params: { movement: Movement } };

export function liftLink(l: Lift): LiftLink | null {
  // 3.1 follows only the lift the phone is analysing (the in-flight bar opens it); a 3.0
  // lift still on the server opens once its analysis has synced.
  if (l.status === 'failed') return { pathname: '/failure/[id]', params: { id: l.id } };
  if (l.status === 'queued' || l.status === 'processing') return null;
  if (!l.analysisId) return { pathname: '/trends', params: { movement: l.movement } };
  // The cue route fetches by lift id when the analysis is not in memory yet.
  const analysis = liveAnalysis(l.analysisId) ?? ANALYSES[l.analysisId];
  if (analysis?.cue && analysis.reps.every((r) => !r.made)) return { pathname: '/analysis/miss', params: { fixture: l.analysisId } };
  return { pathname: '/analysis/cue', params: { fixture: l.analysisId } };
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

// The lifts that fed a cue: its first and last lift by id, plus every lift of the movement
// filmed while it was being tried. Newest first. Deleted lifts simply drop out.
export function cueLifts(cue: CueRecord, lifts: Lift[]): Lift[] {
  return lifts
    .filter(
      (l) =>
        l.id === cue.firstLiftId ||
        l.id === cue.lastLiftId ||
        (l.movement === cue.movement && l.date >= cue.givenAt && (cue.endedAt == null || l.date <= cue.endedAt))
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function cueSessions(cue: CueRecord, sessions: Session[]): Session[] {
  return sessions.filter(
    (s) => s.movement === cue.movement && s.date > cue.givenAt && (cue.endedAt == null || s.date <= cue.endedAt)
  );
}

// The server counts a cue's sessions on the hosted path; the fixtures count local sessions.
export function sessionsDone(cue: CueRecord, sessions: Session[]): number {
  return cue.sessionsDone ?? cueSessions(cue, sessions).length;
}

export function sessionsCounter(cue: CueRecord, sessions: Session[]): string {
  return t('library.counter', { done: sessionsDone(cue, sessions), target: cue.sessionsTarget });
}

export function agoLabel(day: Day, today: Day): string {
  const n = daysBetween(day, today);
  if (n <= 0) return t('library.ago.today');
  if (n === 1) return t('library.ago.yesterday');
  if (n < 14) return t('library.ago.days', { count: n });
  return t('library.ago.weeks', { count: Math.round(n / 7) });
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
  const n = sessionsDone(cue, sessions);
  if (cue.status === 'dropped') return t('library.summary.dropped', { count: Math.max(1, n) });
  const change = cueChange(cue, sessions);
  const m = metricFor(cue.metricId);
  if (!change) return lower(m.label);
  const span = `${lower(m.label)} ${fmt(change.from)} → ${fmt(change.to)} ${m.unit === 'deg' ? '°' : m.unit}`;
  return cue.status === 'stuck' ? `${span} · ${t('library.weeks', { count: change.weeks })}` : span;
}

export function statusLabel(status: CueStatus): string {
  return t(status === 'didnt_stick' ? 'library.status.didntStick' : `library.status.${status}`);
}

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

export function didntStickHeadline(cue: CueRecord, sessions: Session[]): string {
  const n = sessionsDone(cue, sessions);
  const word = t('library.numberWords').split(',')[n] ?? String(n);
  const count = `${word} ${t('library.sessionWord', { count: n })}`;
  const series = cueSeries(cue, sessions);
  if (series.length === 0) return t('library.didntStick.noMove', { sessions: count });
  const m = metricFor(cue.metricId);
  const v = metricText(cue.metricId, series[series.length - 1].value);
  const still = m.still ? m.still.replace('{v}', v) : t('library.didntStick.stillDefault', { label: lower(m.label), value: v });
  return t('library.didntStick.still', { sessions: count, still });
}

export function trendDirection(series: { value: number }[], metricId: string): string {
  if (series.length < 2) return '';
  const first = series[0].value;
  const last = series[series.length - 1].value;
  if (first === last) return t('library.trend.steady');
  const better = metricFor(metricId).lowerIsBetter ? last < first : last > first;
  return better ? t('library.trend.better') : t('library.trend.notYet');
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
  const when = latest.date === today ? t('library.recap.today') : t('library.recap.on', { date: shortDate(latest.date) });
  const parts = [t('library.recap.latest', { label: metricFor(metricId).label, value: metricText(metricId, latest.value), when })];
  const best = bestOf(series, metricId);
  if (best && best.value !== latest.value) parts.push(t('library.recap.best', { value: metricText(metricId, best.value), date: shortDate(best.date) }));
  else parts.push(t('library.recap.bestYet'));
  if (cue?.status === 'trying' && cue.metricId === metricId) {
    parts.push(t('library.recap.trying', { cue: cueText(cue.metricId, cue.text), counter: sessionsCounter(cue, sessions) }));
  }
  return parts.join(' ');
}
