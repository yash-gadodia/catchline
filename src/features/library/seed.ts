import type { LibraryState, Lift } from './types';

// Fixture library for dev mode (no backend): 3.x lifts in every row state.
export const TODAY = '2026-10-11';

const LIFTS: Lift[] = [
  { id: 'l-snatch-today', movement: 'snatch', date: '2026-10-11', loadKg: 62.5, status: 'done', analysisId: 'snatch-mock', thumb: 'asset:snatch/6-catch' },
  { id: 'l-clean', movement: 'clean', date: '2026-10-11', loadKg: 85, status: 'processing' },
  { id: 'l-mu', movement: 'bar_muscle_up', date: '2026-10-09', status: 'done', thumb: 'library:mu-5-support' },
  {
    id: 'l-jerk',
    movement: 'jerk',
    date: '2026-10-09',
    loadKg: 80,
    status: 'failed',
    thumb: 'asset:snatch/4-extension',
    failure: { reason: 'bar_out_of_frame', frame: 158, message: "Couldn't see the bar at the catch" },
  },
  { id: 'l-snatch-queued', movement: 'snatch', date: '2026-10-09', loadKg: 60, status: 'queued', thumb: 'asset:snatch/1-setup' },
  { id: 'l-snatch-miss', movement: 'snatch', date: '2026-10-08', loadKg: 67.5, status: 'done', analysisId: 'snatch-mock-miss', thumb: 'asset:snatch/5-turnover' },
  { id: 'l-snatch-real', movement: 'snatch', date: '2026-10-07', status: 'done', analysisId: 'snatch-real', thumb: 'asset:snatch-real/r1-6-catch' },
  { id: 'l-snatch-low', movement: 'snatch', date: '2026-10-04', loadKg: 62.5, status: 'done', analysisId: 'snatch-mock-low', thumb: 'asset:snatch/2-knee' },
];

export function seededLibrary(): LibraryState {
  return {
    today: TODAY,
    synced: true,
    plan: 'free',
    freeVideosUsed: 3,
    lifts: LIFTS.map((l) => ({ ...l })),
    sessions: [],
    cues: [],
  };
}

export function emptyLibrary(synced = true): LibraryState {
  return { today: TODAY, synced, plan: 'free', freeVideosUsed: 0, lifts: [], sessions: [], cues: [] };
}
