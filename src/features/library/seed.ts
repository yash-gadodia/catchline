import type { CueRecord, LibraryState, Lift, Session } from './types';

// Fixture library until Phase 3: today's snatch is the snatch-mock analysis,
// so its row, its trend point and its cue all read the same 6 cm.
export const TODAY = '2026-10-11';

const snatch = (
  date: string,
  loadKg: number,
  drift: number,
  pull: number,
  depth: number,
  turnover: number,
  extra: Partial<Session> = {}
): Session => ({
  id: `s-snatch-${date}`,
  movement: 'snatch',
  date,
  loadKg,
  values: { bar_drift_hip: drift, pull_time: pull, catch_depth: depth, turnover_time: turnover },
  ...extra,
});

const muscleUp = (date: string, hip: number, kip: number, line: number, cycle: number): Session => ({
  id: `s-mu-${date}`,
  movement: 'bar_muscle_up',
  date,
  thumb: 'library:mu-5-support',
  values: { hip_to_bar: hip, kip_height: kip, body_line: line, cycle_time: cycle },
});

const SESSIONS: Session[] = [
  { id: 's-snatch-2026-08-20', movement: 'snatch', date: '2026-08-20', loadKg: 55, values: { bar_height: 92 } },
  { id: 's-snatch-2026-08-27', movement: 'snatch', date: '2026-08-27', loadKg: 57.5, values: { bar_height: 94 } },
  { id: 's-snatch-2026-09-03', movement: 'snatch', date: '2026-09-03', loadKg: 57.5, values: { bar_height: 95 } },
  { id: 's-snatch-2026-09-10', movement: 'snatch', date: '2026-09-10', loadKg: 60, values: { bar_height: 96 } },
  snatch('2026-09-12', 60, 9, 0.63, 3, 0.24),
  snatch('2026-09-15', 60, 8, 0.62, 3, 0.23),
  snatch('2026-09-18', 65, 2, 0.58, 6, 0.19, { thumb: 'asset:snatch/6-catch' }),
  snatch('2026-09-22', 62.5, 8, 0.61, 4, 0.22),
  snatch('2026-09-26', 62.5, 8, 0.62, 4, 0.22),
  snatch('2026-09-30', 62.5, 8, 0.63, 4, 0.23),
  snatch('2026-10-02', 60, 8, 0.64, 4, 0.22),
  snatch('2026-10-04', 62.5, 7, 0.61, 4, 0.22, { liftId: 'l-snatch-low' }),
  snatch('2026-10-08', 67.5, 7, 0.6, 4, 0.23, { liftId: 'l-snatch-miss' }),
  snatch('2026-10-11', 62.5, 6, 0.59, 4, 0.21, { liftId: 'l-snatch-today' }),
  { id: 's-clean-2026-09-08', movement: 'clean', date: '2026-09-08', loadKg: 80, values: { elbow_turn: 0.32, bar_drift_hip: 5 } },
  muscleUp('2026-09-10', 14, 38, 31, 2.4),
  muscleUp('2026-09-14', 13, 40, 33, 2.3),
  muscleUp('2026-09-18', 13, 41, 33, 2.3),
  muscleUp('2026-09-22', 11, 42, 35, 2.2),
  muscleUp('2026-09-25', 3, 46, 38, 2.0),
  muscleUp('2026-09-29', 9, 43, 36, 2.2),
  muscleUp('2026-10-03', 10, 42, 35, 2.2),
  { ...muscleUp('2026-10-09', 8, 44, 36, 2.1), liftId: 'l-mu' },
];

const LIFTS: Lift[] = [
  { id: 'l-snatch-today', movement: 'snatch', date: '2026-10-11', loadKg: 62.5, reps: 3, status: 'done', analysisId: 'snatch-mock', thumb: 'asset:snatch/6-catch' },
  { id: 'l-clean', movement: 'clean', date: '2026-10-11', loadKg: 85, reps: 2, status: 'processing' },
  { id: 'l-mu', movement: 'bar_muscle_up', date: '2026-10-09', reps: 5, status: 'done', thumb: 'library:mu-5-support' },
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
  { id: 'l-snatch-miss', movement: 'snatch', date: '2026-10-08', loadKg: 67.5, reps: 1, status: 'done', analysisId: 'snatch-mock-miss', thumb: 'asset:snatch/5-turnover' },
  { id: 'l-snatch-real', movement: 'snatch', date: '2026-10-07', reps: 2, status: 'done', analysisId: 'snatch-real', thumb: 'asset:snatch-real/r1-6-catch' },
  { id: 'l-snatch-low', movement: 'snatch', date: '2026-10-04', loadKg: 62.5, reps: 3, status: 'done', analysisId: 'snatch-mock-low', thumb: 'asset:snatch/2-knee' },
];

const CUES: CueRecord[] = [
  {
    id: 'c-stay-over',
    movement: 'snatch',
    text: 'Stay over the bar longer',
    metricId: 'bar_drift_hip',
    givenAt: '2026-09-30',
    status: 'trying',
    sessionsTarget: 6,
    before: { image: 'asset:snatch/3-hip' },
    after: { image: 'asset:snatch/3-hip' },
  },
  {
    id: 'c-finish-pull',
    movement: 'snatch',
    text: 'Finish the pull before you drop',
    metricId: 'bar_height',
    givenAt: '2026-08-20',
    endedAt: '2026-09-10',
    status: 'stuck',
    sessionsTarget: 4,
    before: { image: 'asset:snatch/4-extension' },
    after: { image: 'asset:snatch/4-extension' },
  },
  {
    id: 'c-hips-mu',
    movement: 'bar_muscle_up',
    text: 'Hips to the bar on the MU',
    metricId: 'hip_to_bar',
    givenAt: '2026-09-14',
    endedAt: '2026-10-09',
    status: 'didnt_stick',
    sessionsTarget: 6,
    before: { image: 'library:mu-3-hip-drive' },
    after: { image: 'library:mu-3-hip-drive' },
    suggestion: {
      text: 'Bigger arch before the drive',
      why: "That usually means the cue was aimed at the wrong thing. The arch before the drive looks short, so I'd try that first: a bigger arch, then the hips come on their own.",
    },
  },
  {
    id: 'c-elbows',
    movement: 'clean',
    text: 'Elbows up in the clean catch',
    metricId: 'elbow_turn',
    givenAt: '2026-09-05',
    endedAt: '2026-09-08',
    status: 'dropped',
    sessionsTarget: 6,
    before: { image: 'asset:snatch/6-catch' },
    after: { image: 'asset:snatch/6-catch' },
  },
];

export function seededLibrary(): LibraryState {
  return {
    today: TODAY,
    synced: true,
    plan: 'free',
    freeVideosUsed: 3,
    lifts: LIFTS.map((l) => ({ ...l })),
    sessions: SESSIONS.map((s) => ({ ...s, values: { ...s.values } })),
    cues: CUES.map((c) => ({ ...c })),
  };
}

export function emptyLibrary(synced = true): LibraryState {
  return { today: TODAY, synced, plan: 'free', freeVideosUsed: 0, lifts: [], sessions: [], cues: [] };
}
