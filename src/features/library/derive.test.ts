import {
  activeCue,
  cueWindow,
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
  sessionsCounter,
} from './derive';
import { emptyLibrary, seededLibrary, TODAY } from './seed';

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
    expect(liftDetail(lift('l-snatch-today'), lib.sessions)).toBe('bar drift at hip 6 cm · best 2');
    expect(liftDetail(lift('l-mu'), lib.sessions)).toBe('hip to bar 8 cm · best 3');
    expect(liftDetail(lift('l-clean'), lib.sessions)).toBe('analysing · about 20 s');
    expect(liftDetail(lift('l-jerk'), lib.sessions)).toBe("Couldn't see the bar at the catch");
    expect(liftDetail(lift('l-snatch-queued'), lib.sessions)).toBe('Queued · free videos used');
    expect(liftDetail(lift('l-snatch-low'), lib.sessions)).toBe('possible · bar drifting at the knee');
    expect(liftDetail(lift('l-snatch-miss'), lib.sessions)).toBe('miss · the bar was out front at the turnover');
  });

  it('opens each row in the right screen with the right fixture', () => {
    expect(liftLink(lift('l-snatch-today'))).toEqual({ pathname: '/analysis/cue', params: { fixture: 'snatch-mock' } });
    expect(liftLink(lift('l-snatch-low'))).toEqual({ pathname: '/analysis/cue', params: { fixture: 'snatch-mock-low' } });
    expect(liftLink(lift('l-snatch-real'))).toEqual({ pathname: '/analysis/cue', params: { fixture: 'snatch-real' } });
    expect(liftLink(lift('l-snatch-miss'))).toEqual({ pathname: '/analysis/miss', params: { fixture: 'snatch-mock-miss' } });
    expect(liftLink(lift('l-clean'))).toEqual({ pathname: '/analysis/processing', params: {} });
    expect(liftLink(lift('l-jerk'))).toEqual({ pathname: '/failure/[id]', params: { id: 'l-jerk' } });
    expect(liftLink(lift('l-mu'))).toEqual({ pathname: '/trends', params: { movement: 'bar_muscle_up' } });
    expect(liftLink(lift('l-snatch-queued'))).toBeNull();
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
