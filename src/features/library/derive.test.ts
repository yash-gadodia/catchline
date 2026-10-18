import { snatchMockMiss } from '../../analysis/fixtures';
import { putLiveAnalysis } from '../../analysis/live';
import { defaultMovement, measuredMetrics, measuredMovements, metricFor } from './metrics';
import {
  activeCue,
  agoLabel,
  cueWindow,
  metricText,
  didntStickHeadline,
  trendDirection,
  bestOf,
  cueSeries,
  dayLabel,
  filterLifts,
  freeVideosLabel,
  groupByDay,
  inRange,
  liftDetail,
  liftLink,
  liftTitle,
  pastCueSummary,
  seriesFor,
  trendRecap,
  sessionsCounter,
  versionBoundary,
  versionNote,
} from './derive';
import { emptyLibrary, seededLibrary, TODAY } from './seed';
import type { Session } from './types';

const lib = seededLibrary();
const lift = (id: string) => lib.lifts.find((l) => l.id === id)!;
const cue = (id: string) => lib.cues.find((c) => c.id === id)!;

describe('free videos chip', () => {
  it('counts down the three lifetime videos', () => {
    expect(freeVideosLabel(emptyLibrary())).toBe('3 free videos');
    expect(freeVideosLabel({ plan: 'free', freeVideosUsed: 1 })).toBe('2 free videos left');
    expect(freeVideosLabel({ plan: 'free', freeVideosUsed: 2 })).toBe('1 free video left');
    expect(freeVideosLabel(lib)).toBe('Free videos used');
    expect(freeVideosLabel({ plan: 'paid', freeVideosUsed: 3 })).toBeNull();
  });
});

describe('lift list', () => {
  it('groups lifts by day, newest first, with today called out', () => {
    expect(groupByDay(lib.lifts, TODAY).map((g) => [g.label, g.lifts.map((l) => l.id)])).toEqual([
      ['Today · Sun 11 Oct', ['l-snatch-today', 'l-clean']],
      ['Fri 9 Oct', ['l-mu', 'l-jerk', 'l-snatch-queued']],
      ['Thu 8 Oct', ['l-snatch-miss']],
      ['Wed 7 Oct', ['l-snatch-real']],
      ['Sun 4 Oct', ['l-snatch-low']],
    ]);
    expect(dayLabel('2026-10-09', TODAY)).toBe('Fri 9 Oct');
  });

  it('filters by group, then by movement', () => {
    expect(filterLifts(lib.lifts, 'gymnastics', null).map((l) => l.id)).toEqual(['l-mu']);
    expect(filterLifts(lib.lifts, 'barbell', 'jerk').map((l) => l.id)).toEqual(['l-jerk']);
    expect(filterLifts(lib.lifts, 'all', null)).toHaveLength(8);
  });

  it('titles a row as movement, reps, load', () => {
    expect(liftTitle(lift('l-snatch-today'))).toBe('Snatch · 3 reps · 62.5 kg');
    expect(liftTitle(lift('l-mu'))).toBe('Bar muscle-up · 5 reps');
    expect(liftTitle(lift('l-jerk'))).toBe('Jerk · 80 kg');
  });

  it('summarises each row state from the same numbers the trend uses', () => {
    expect(liftDetail(lift('l-snatch-today'), lib.sessions)).toBe('drift 6 cm · best 2 cm');
    expect(liftDetail(lift('l-mu'), lib.sessions)).toBe('hip to bar 8 cm · best 3 cm');
    expect(liftDetail(lift('l-clean'), lib.sessions)).toBe('analysing');
    expect(liftDetail(lift('l-jerk'), lib.sessions)).toBe("Couldn't see the bar at the catch");
    expect(liftDetail(lift('l-snatch-queued'), lib.sessions)).toBe('Queued · free videos used');
    expect(liftDetail(lift('l-snatch-low'), lib.sessions)).toBe('possible · bar drifting at the knee');
    expect(liftDetail(lift('l-snatch-miss'), lib.sessions)).toBe('miss · the bar was out front at the turnover');
    expect(liftDetail({ ...lift('l-snatch-real'), analysisId: 'gone', headline: 'hip · 5 cm fwd' }, [])).toBe('hip · 5 cm fwd');
  });

  it('drops the "possible" qualifier when the row already carries the cue status line', () => {
    expect(liftDetail(lift('l-snatch-low'), lib.sessions)).toBe('possible · bar drifting at the knee');
    expect(liftDetail(lift('l-snatch-low'), lib.sessions, { cueShown: true })).toBe('drift 7 cm · best 2 cm');
    expect(liftDetail(lift('l-snatch-miss'), lib.sessions, { cueShown: true })).toBe('miss · the bar was out front at the turnover');
  });

  it('opens each row in the right screen with the right fixture', () => {
    expect(liftLink(lift('l-snatch-today'))).toEqual({ pathname: '/analysis/cue', params: { fixture: 'snatch-mock' } });
    expect(liftLink(lift('l-snatch-low'))).toEqual({ pathname: '/analysis/cue', params: { fixture: 'snatch-mock-low' } });
    expect(liftLink(lift('l-snatch-real'))).toEqual({ pathname: '/analysis/cue', params: { fixture: 'snatch-real' } });
    expect(liftLink(lift('l-snatch-miss'))).toEqual({ pathname: '/analysis/miss', params: { fixture: 'snatch-mock-miss' } });
    expect(liftLink(lift('l-clean'))).toEqual({ pathname: '/analysis/processing', params: { live: '1', lift: 'l-clean' } });
    expect(liftLink(lift('l-jerk'))).toEqual({ pathname: '/failure/[id]', params: { id: 'l-jerk' } });
    expect(liftLink(lift('l-mu'))).toEqual({ pathname: '/trends', params: { movement: 'bar_muscle_up' } });
    expect(liftLink(lift('l-snatch-queued'))).toBeNull();
  });

  it('opens a real lift by its lift id even before its analysis is in memory', () => {
    const id = '0f4b6c2e-6f47-4c0a-9d3e-2a5b8c1d7e90';
    expect(liftLink({ ...lift('l-snatch-today'), id, analysisId: id })).toEqual({ pathname: '/analysis/cue', params: { fixture: id } });
    putLiveAnalysis({ ...snatchMockMiss, id });
    expect(liftLink({ ...lift('l-snatch-today'), id, analysisId: id })).toEqual({ pathname: '/analysis/miss', params: { fixture: id } });
  });
});

describe('cues', () => {
  it('finds the active cue and counts sessions since it was given', () => {
    expect(activeCue(lib.cues)?.id).toBe('c-stay-over');
    expect(sessionsCounter(cue('c-stay-over'), lib.sessions)).toBe('4 of 6');
    expect(sessionsCounter(cue('c-hips-mu'), lib.sessions)).toBe('6 of 6');
  });

  it('charts the cue metric from the day it was given', () => {
    expect(cueSeries(cue('c-stay-over'), lib.sessions)).toEqual([
      { date: '2026-09-30', value: 8 },
      { date: '2026-10-02', value: 8 },
      { date: '2026-10-04', value: 7 },
      { date: '2026-10-08', value: 7 },
      { date: '2026-10-11', value: 6 },
    ]);
  });

  it('summarises past cues by how they ended', () => {
    expect(pastCueSummary(cue('c-finish-pull'), lib.sessions)).toBe('bar height 92 → 96 cm · 3 wks');
    expect(pastCueSummary(cue('c-hips-mu'), lib.sessions)).toBe('hip to bar 13 → 8 cm');
    expect(pastCueSummary(cue('c-elbows'), lib.sessions)).toBe('dropped after 1 session');
  });
});

describe('trends', () => {
  const drift = seriesFor(lib.sessions, 'snatch', 'bar_drift_hip');

  it('picks the best in the right direction', () => {
    expect(bestOf(drift, 'bar_drift_hip')).toMatchObject({ date: '2026-09-18', value: 2 });
    expect(bestOf(seriesFor(lib.sessions, 'snatch', 'catch_depth'), 'catch_depth')).toMatchObject({ value: 6 });
  });

  it('windows the series to 7, 30 and 90 days', () => {
    expect(inRange(drift, TODAY, 7).map((p) => p.value)).toEqual([7, 6]);
    expect(inRange(drift, TODAY, 30)).toHaveLength(10);
    expect(inRange(drift, TODAY, 90)).toHaveLength(10);
  });
});

describe('cue chart and outcomes', () => {
  it('puts two sessions of context before the cue marker', () => {
    const w = cueWindow(cue('c-stay-over'), lib.sessions);
    expect(w.series.map((p) => p.value)).toEqual([8, 8, 8, 8, 7, 7, 6]);
    expect(w.markerIndex).toBe(2);
    expect(trendDirection(w.series, 'bar_drift_hip')).toBe('Heading the right way.');
  });

  it('says plainly why a cue did not stick', () => {
    expect(didntStickHeadline(cue('c-hips-mu'), lib.sessions)).toBe('Six sessions and the hips are still 8 cm off the bar.');
  });
});

describe('trendRecap', () => {
  const lib = seededLibrary();
  const series = seriesFor(lib.sessions, 'snatch', 'bar_drift_hip');
  const cue = lib.cues.find((c) => c.id === 'c-stay-over');

  it('reads latest, best and the cue being tried', () => {
    expect(trendRecap('bar_drift_hip', series, '2026-10-11', cue, lib.sessions)).toBe(
      'Bar drift at hip: 6 cm today. Best 2 cm on 18 Sep. Trying “Stay over the bar longer”: 4 of 6 sessions.'
    );
  });

  it('dates an older latest and skips a cue on another measurement', () => {
    expect(trendRecap('bar_drift_hip', series.slice(0, 3), '2026-10-11', { ...cue!, metricId: 'pull_time' }, lib.sessions)).toBe(
      'Bar drift at hip: 2 cm on 18 Sep. Your best yet.'
    );
  });
});

describe('defaultMovement (what Trends opens on)', () => {
  const session = (id: string, movement: 'snatch' | 'clean' | 'jerk', date: string) => ({ id, movement, date, values: {} });

  it('is the movement with the most analysed lifts, not the newest one', () => {
    const sessions = [
      session('c1', 'clean', '2026-10-01'),
      session('c2', 'clean', '2026-10-03'),
      session('c3', 'clean', '2026-10-05'),
      session('s1', 'snatch', '2026-10-12'),
    ];
    expect(defaultMovement(sessions)).toBe('clean');
  });

  it('breaks a tie by the most recent session', () => {
    const sessions = [
      session('c1', 'clean', '2026-10-01'),
      session('s1', 'snatch', '2026-10-02'),
      session('c2', 'clean', '2026-10-03'),
      session('s2', 'snatch', '2026-10-04'),
    ];
    expect(defaultMovement(sessions)).toBe('snatch');
    expect(defaultMovement([...sessions, session('c3', 'clean', '2026-09-20')])).toBe('clean');
  });

  it('falls back to snatch, or the given fallback, with nothing analysed', () => {
    expect(defaultMovement([])).toBe('snatch');
    expect(defaultMovement([], 'jerk')).toBe('jerk');
  });
});

describe('real CV measurement ids', () => {
  it('knows every fault the CV can cue, with a safe fallback for one it has never seen', () => {
    expect(metricFor('jump_forward')).toMatchObject({ id: 'jump_forward', label: 'Jumped forward', unit: 'cm', lowerIsBetter: true });
    expect(metricFor('no_push_away').lowerIsBetter).toBe(false);
    expect(metricFor('bar_peak_height')).toMatchObject({ label: 'Bar peak height', lowerIsBetter: false });
    expect(metricFor('some_new_fault')).toMatchObject({ id: 'some_new_fault', label: 'Some new fault', unit: 'cm', lowerIsBetter: true });
    expect(metricText('some_new_fault', 4)).toBe('4 cm');
    expect(metricText('jump_forward', 9.4)).toBe('9.4 cm');
  });

  it('prefers the server session count over counting local sessions', () => {
    const c = { ...cue('c-stay-over'), metricId: 'jump_forward', sessionsDone: 3 };
    expect(sessionsCounter(c, lib.sessions)).toBe('3 of 6');
    expect(pastCueSummary({ ...c, status: 'stuck' }, [])).toBe('jumped forward');
    expect(didntStickHeadline({ ...c, status: 'didnt_stick' }, [])).toBe("Three sessions and it hasn't moved yet.");
  });

  it('lists only the measurements a movement actually has, in the lift order', () => {
    const sessions: Session[] = [
      { id: 's1', movement: 'snatch', date: '2026-10-10', values: { turnover_time: 0.21, jump_forward: 9, hips_rise_early: 3 } },
      { id: 's2', movement: 'snatch', date: '2026-10-12', values: { jump_forward: 6, bar_peak_height: 90 } },
    ];
    expect(measuredMetrics(sessions, 'snatch')).toEqual(['hips_rise_early', 'jump_forward', 'turnover_time', 'bar_peak_height']);
    expect(measuredMetrics(sessions, 'clean')).toEqual([]);
    expect(measuredMovements(sessions)).toEqual(['snatch']);
  });

  it('relative day labels', () => {
    expect(agoLabel('2026-10-11', TODAY)).toBe('today');
    expect(agoLabel('2026-10-10', TODAY)).toBe('yesterday');
    expect(agoLabel('2026-10-05', TODAY)).toBe('6 days ago');
    expect(agoLabel('2026-09-20', TODAY)).toBe('3 wks ago');
  });
});

describe('versionBoundary', () => {
  const s = (id: string, date: string, analysisVersion?: string, movement: Session['movement'] = 'snatch'): Session => ({
    id,
    movement,
    date,
    values: { jump_forward: 5 },
    analysisVersion,
  });

  it('is null while every lift of the movement was measured by one version', () => {
    expect(versionBoundary([s('a', '2026-10-01'), s('b', '2026-10-02')], 'snatch')).toBeNull();
    expect(versionBoundary([s('a', '2026-10-01', 'cv-2026.10.16'), s('b', '2026-10-02', 'cv-2026.10.16')], 'snatch')).toBeNull();
    expect(versionBoundary([], 'snatch')).toBeNull();
  });

  it('finds the day the newest version took over and every lift an older one measured', () => {
    const b = versionBoundary(
      [
        s('d', '2026-10-17', 'cv-2026.10.16'),
        s('a', '2026-10-01'),
        s('b', '2026-10-05', 'cv-2026.10.01'),
        s('c', '2026-10-16', 'cv-2026.10.16'),
        s('x', '2026-10-20', 'cv-2026.10.01', 'clean'),
      ],
      'snatch'
    );
    expect(b?.since).toBe('2026-10-16');
    expect([...(b?.older ?? [])].sort()).toEqual(['a', 'b']);
  });

  it('ignores other movements', () => {
    expect(versionBoundary([s('a', '2026-10-01', 'cv-2026.10.16'), s('x', '2026-10-02', undefined, 'clean')], 'snatch')).toBeNull();
  });

  it('says what changed in plain words', () => {
    expect(versionNote('2026-10-16')).toBe('Analysis improved on 16 Oct; earlier lifts were measured by the older version.');
  });
});
