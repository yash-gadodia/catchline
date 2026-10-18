import { render } from '@testing-library/react-native';
import { snatchMockPartial } from '../../analysis/fixtures';
import type { Analysis } from '../../analysis/types';
import { toLift, toSession } from '../../data/library';
import type { Lift as LiftRow } from '../../types/db';
import LiftsScreen from './LiftsScreen';
import TrendsScreen from './TrendsScreen';
import { liftDetail, liftLink } from './derive';
import { emptyLibrary } from './seed';
import { useLibraryStore } from './store';
import type { Lift } from './types';

jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/library', () => ({ ...jest.requireActual('../../data/library'), syncLibrary: jest.fn(() => Promise.resolve()) }));

const row = (id: string, created: string): LiftRow =>
  ({ id, movement: 'snatch', created_at: created, load_kg: 60, status: 'done', error: null, retest_cue_id: null }) as LiftRow;

// A partial as the worker writes it: real fault ids, the horizontal ones not judged.
const partial = (id: string): Analysis => ({
  ...snatchMockPartial,
  id,
  measurements: [
    { id: 'jump_forward', label: 'Jumped forward', value: 0, unit: 'cm', frame: 10, status: 'not_seen', note: 'not judged' },
    { id: 'catch_depth', label: 'Catch depth', value: 7, unit: 'cm', frame: 90, status: 'normal', note: '' },
    { id: 'turnover_time', label: 'Extension to catch', value: 0.24, unit: 's', frame: 80, status: 'normal', note: '' },
  ],
});
const full = (id: string, jump: number, depth: number): Analysis => ({
  ...partial(id),
  noCueReason: undefined,
  measurements: [
    { id: 'jump_forward', label: 'Jumped forward', value: jump, unit: 'cm', frame: 10, status: 'normal', note: '' },
    { id: 'catch_depth', label: 'Catch depth', value: depth, unit: 'cm', frame: 90, status: 'normal', note: '' },
  ],
});

describe('a partial in the library', () => {
  it('is a done lift with its reps, no failure and no cue headline', () => {
    const l = toLift(row('p1', '2026-10-16T09:00:00Z'), partial('p1'));
    expect([l.status, l.reps, l.analysisId, l.failure, l.headline]).toEqual(['done', 3, 'p1', undefined, undefined]);
  });

  it('counts as a session with only its trusted numbers', () => {
    expect(toSession(row('p1', '2026-10-16T09:00:00Z'), partial('p1')).values).toEqual({ catch_depth: 7, turnover_time: 0.24 });
  });

  it('reads "no cue" on its row and opens the result, never the miss or failure screen', async () => {
    const lift: Lift = { id: 'lp', movement: 'snatch', date: '2026-10-16', loadKg: 60, reps: 3, status: 'done', analysisId: 'snatch-mock-partial' };
    expect(liftDetail(lift, [])).toBe('analysed · no cue');
    expect(liftLink(lift)).toEqual({ pathname: '/analysis/cue', params: { fixture: 'snatch-mock-partial' } });
    useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-17', lifts: [lift] });
    const nav = { onOpen: jest.fn(), onRetake: jest.fn(), onUnlock: jest.fn(), onRecord: jest.fn(), onImport: jest.fn(), onDemo: jest.fn(), onCue: jest.fn(), onDelete: jest.fn() };
    const screen = await render(<LiftsScreen nav={nav} />);
    expect(screen.getByTestId('lift-lp')).toHaveTextContent('Snatch · 3 reps · 60 kganalysed · no cue');
    expect(screen.queryByTestId('retake-lp')).toBeNull();
  });

  it('puts the head number first when the partial measured it', () => {
    const lift: Lift = { id: 'lp', movement: 'snatch', date: '2026-10-16', status: 'done', analysisId: 'snatch-mock-partial' };
    const session = { id: 's-lp', liftId: 'lp', movement: 'snatch' as const, date: '2026-10-16', values: { bar_drift_hip: 4 } };
    expect(liftDetail(lift, [session])).toBe('drift 4 cm · no cue');
  });

  it('plots on Trends as a session of the numbers it measured, with no cue marker', async () => {
    const sessions = [
      toSession(row('f1', '2026-10-12T09:00:00Z'), full('f1', 9, 5)),
      toSession(row('f2', '2026-10-14T09:00:00Z'), full('f2', 7, 6)),
      toSession(row('p1', '2026-10-16T09:00:00Z'), partial('p1')),
    ];
    useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-17', sessions });
    const screen = await render(<TrendsScreen />);
    expect(screen.queryAllByTestId('cue-marker')).toHaveLength(0);
    expect(screen.getByTestId('metric-catch_depth')).toBeOnTheScreen();
    expect(screen.getByTestId('trend-hero')).toHaveTextContent('7 cm');
  });
});
