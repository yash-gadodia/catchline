import { fmt, movementLabel } from '../../analysis/format';
import { formatDate, t } from '../../i18n';
import { localClipUri } from '../../data/localLifts';
import { failureMessage } from './failures';
import { FREE_VIDEOS, type CueRecord, type Day, type LibraryState, type Lift, type Session } from './types';

function utc(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function shortDate(day: Day): string {
  const d = utc(day);
  return t('library.date.dayMonth', { day: d.getUTCDate(), month: formatDate(d, { month: 'short', timeZone: 'UTC' }) });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// "11 Nov, 14:32" in the phone's own time; a lift with no time on record (fixtures) reads as its day.
export function liftWhen(l: Pick<Lift, 'date' | 'at'>): string {
  if (!l.at) return shortDate(l.date);
  const d = new Date(l.at);
  const date = t('library.date.dayMonth', { day: d.getDate(), month: formatDate(d, { month: 'short' }) });
  return t('library.date.dayTime', { date, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });
}

// A 4.0 lift keeps its clip and was never given a movement by the lifter.
export function isTracked(l: Pick<Lift, 'id' | 'analysisId'>): boolean {
  return localClipUri(l.analysisId ?? l.id) !== null;
}

// The date and time, plus the load if the lifter set one.
export function liftTitle(l: Pick<Lift, 'date' | 'at' | 'loadKg'>): string {
  return l.loadKg != null ? `${liftWhen(l)} · ${fmt(l.loadKg)} kg` : liftWhen(l);
}

export function freeVideosLabel(s: Pick<LibraryState, 'plan' | 'freeVideosUsed'>): string | null {
  if (s.plan !== 'free') return null;
  const left = Math.max(0, FREE_VIDEOS - s.freeVideosUsed);
  if (left === FREE_VIDEOS) return t('library.free.all', { count: FREE_VIDEOS });
  if (left === 0) return t('library.free.used');
  return t('library.free.left', { count: left });
}

export function newestFirst(lifts: Lift[]): Lift[] {
  return [...lifts].sort((a, b) => {
    const x = a.at ?? a.date;
    const y = b.at ?? b.date;
    return x < y ? 1 : x > y ? -1 : 0;
  });
}

// The line under a row's title: what is happening to the lift, or (a 3.x lift) the movement the lifter picked.
export function liftDetail(l: Lift): string | null {
  if (l.status === 'processing') return t('library.detail.processing');
  if (l.status === 'queued') return t('library.detail.queued');
  if (l.status === 'failed') return l.failure ? failureMessage(l.failure) : t('library.detail.failed');
  return isTracked(l) ? null : movementLabel(l.movement);
}

export type LiftLink =
  | { pathname: '/analysis/player'; params: { fixture: string } }
  | { pathname: '/failure/[id]'; params: { id: string } };

// Where a row opens: the player for a finished lift, the failure screen for a failed one, nowhere while it is
// still running or its analysis is not on this phone.
export function liftLink(l: Lift): LiftLink | null {
  if (l.status === 'failed') return { pathname: '/failure/[id]', params: { id: l.id } };
  if (l.status !== 'done' || !l.analysisId) return null;
  return { pathname: '/analysis/player', params: { fixture: l.analysisId } };
}

// The server counts a cue's sessions on the hosted path; the fixtures count local sessions. Read by the paywall.
export function sessionsDone(cue: CueRecord, sessions: Session[]): number {
  if (cue.sessionsDone != null) return cue.sessionsDone;
  return sessions.filter((s) => s.movement === cue.movement && s.date > cue.givenAt && (cue.endedAt == null || s.date <= cue.endedAt)).length;
}
