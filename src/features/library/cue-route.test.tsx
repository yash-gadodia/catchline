import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { snatchReal } from '../../analysis/fixtures';
import { putLiveAnalysis } from '../../analysis/live';
import CueRoute from '../../../app/cue/[id]';
import { emptyLibrary } from './seed';
import { useLibraryStore } from './store';
import type { CueRecord, Lift, Session } from './types';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => params.current };
});
jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/library', () => ({ syncLibrary: jest.fn(() => Promise.resolve()) }));
jest.mock('../../lib/api', () => ({ updateCue: jest.fn() }));
const { syncLibrary } = jest.requireMock('../../data/library') as { syncLibrary: jest.Mock };
const { updateCue } = jest.requireMock('../../lib/api') as { updateCue: jest.Mock };

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const TODAY = '2026-10-14';
const CUE_ID = '6c1d2e3f-0000-4000-8000-000000000001';
const cue: CueRecord = {
  id: CUE_ID,
  movement: 'snatch',
  text: 'Land on the line you started on.',
  why: 'Your feet landed 9 cm in front of where they started.',
  metricId: 'jump_forward',
  givenAt: '2026-10-10',
  status: 'trying',
  sessionsTarget: 6,
  sessionsDone: 3,
  firstLiftId: 'lift-1',
  lastLiftId: 'lift-3',
  before: { image: '' },
  after: { image: '' },
};
const lift = (id: string, date: string, over: Partial<Lift> = {}): Lift => ({ id, movement: 'snatch', date, loadKg: 60, reps: 2, status: 'done', analysisId: id, ...over });
const session = (id: string, date: string, jump: number): Session => ({
  id: `s-${id}`,
  liftId: id,
  movement: 'snatch',
  date,
  values: { hips_rise_early: 2, bar_forward_off_hips: 4, jump_forward: jump, turnover_time: 0.21 },
});
const LIFTS = [
  lift('lift-1', '2026-10-10'),
  lift('lift-2', '2026-10-12'),
  lift('lift-3', '2026-10-13'),
  lift('lift-4', '2026-10-14', { status: 'failed', reps: undefined, analysisId: undefined, failure: { reason: 'too_dark', message: 'Too dark to see the bar' } }),
  lift('old-clean', '2026-10-12', { movement: 'clean' }),
];
const SESSIONS = [session('lift-1', '2026-10-10', 9), session('lift-2', '2026-10-12', 7), session('lift-3', '2026-10-13', 5)];

function load(over: Partial<ReturnType<typeof emptyLibrary>>) {
  useLibraryStore.getState().load({ ...emptyLibrary(), today: TODAY, ...over });
}
const stored = () => useLibraryStore.getState().cues.find((c) => c.id === CUE_ID)!;

beforeEach(() => {
  jest.clearAllMocks();
  params.current = { id: CUE_ID };
  updateCue.mockImplementation((id: string, status: string) => Promise.resolve({ id, status }));
  load({ cues: [cue], lifts: LIFTS, sessions: SESSIONS });
});

describe('cue detail on a real account', () => {
  it('shows the cue, its why, the fault trend and every lift that fed it', async () => {
    const view = await render(<CueRoute />);
    expect(view.getByText('Land on the line you started on.')).toBeOnTheScreen();
    expect(view.getByText('TRYING · 3 OF 6')).toBeOnTheScreen();
    expect(view.getByTestId('cue-why')).toHaveTextContent('Your feet landed 9 cm in front of where they started.');
    expect(view.getByText('AI ESTIMATE')).toBeOnTheScreen();
    expect(view.getByText('Jumped forward')).toBeOnTheScreen();
    expect(view.getByText('cm · 3 sessions measured')).toBeOnTheScreen();
    expect(view.getByTestId('cue-chart')).toBeOnTheScreen();
    expect(view.getByTestId('cue-marker')).toBeOnTheScreen();
    expect(view.getByTestId('before-readout')).toHaveTextContent('10 oct · 9 cm');
    expect(view.getByTestId('after-readout')).toHaveTextContent('13 oct · 5 cm');
    expect(view.getByText('LIFTS ON THIS CUE')).toBeOnTheScreen();
    expect(view.getByTestId('cue-lift-lift-3')).toHaveTextContent('Snatch · 2 reps · 60 kgjump 5 cm13 oct');
    expect(view.getByTestId('cue-lift-lift-1')).toHaveTextContent('Snatch · 2 reps · 60 kgjump 9 cm10 oct');
    expect(view.getByTestId('cue-lift-lift-4')).toHaveTextContent('Snatch · 60 kgToo dark to see the bar14 oct');
    expect(view.queryByTestId('cue-lift-old-clean')).toBeNull();
    expect(view.queryByTestId('cue-why-open')).toBeNull();
  });

  it('opens the Why this? sheet from the last lift analysis and closes it', async () => {
    putLiveAnalysis({ ...snatchReal, id: 'lift-3' });
    const view = await render(<CueRoute />);
    await press(view.getByTestId('cue-why-open'));
    expect(view.getByText('Why this and not something else?')).toBeOnTheScreen();
    expect(view.getByTestId('why-row-jump_forward')).toBeOnTheScreen();
    await press(view.getByTestId('why-close'));
    expect(view.queryByTestId('why-drawer')).toBeNull();
  });

  it('It stuck updates the store at once, writes to the server and turns into the Stuck moment', async () => {
    const view = await render(<CueRoute />);
    await press(view.getByTestId('mark-stuck'));
    expect(stored()).toMatchObject({ status: 'stuck', endedAt: TODAY });
    expect(updateCue).toHaveBeenCalledWith(CUE_ID, 'stuck');
    expect(view.getByText('Stuck.')).toBeOnTheScreen();
    expect(view.getByTestId('stuck-summary')).toHaveTextContent("Jumped forward 9 → 5 cm over a week. It's yours now.");
  });

  it("Didn't stick writes the status and shows the kind next step", async () => {
    const view = await render(<CueRoute />);
    await press(view.getByTestId('didnt-stick'));
    expect(updateCue).toHaveBeenCalledWith(CUE_ID, 'didnt_stick');
    expect(stored().status).toBe('didnt_stick');
    expect(view.getByTestId('didnt-stick-headline')).toHaveTextContent('Three sessions and the feet still land 5 cm forward.');
    expect(view.getByText("That usually means the cue was aimed at the wrong thing. Film another set and I'll look for what's underneath it.")).toBeOnTheScreen();
  });

  it('a rejected write re-syncs from the server instead of lying', async () => {
    updateCue.mockImplementation(() => Promise.reject(new Error('network')));
    const view = await render(<CueRoute />);
    await press(view.getByTestId('mark-stuck'));
    await waitFor(() => expect(syncLibrary).toHaveBeenCalledTimes(1));
  });

  it('a cue the store does not have is fetched first, then reported gone', async () => {
    load({ synced: false, cues: [] });
    const view = await render(<CueRoute />);
    expect(view.getByTestId('cue-loading')).toBeOnTheScreen();
    expect(syncLibrary).toHaveBeenCalledTimes(1);
    await act(async () => {
      load({ synced: true, cues: [] });
    });
    expect(view.getByText('This cue is gone.')).toBeOnTheScreen();
    await press(view.getByTestId('cue-missing-back'));
    expect(jest.requireMock('expo-router').router.back).toHaveBeenCalledTimes(1);
  });

  it('a cue whose lifts were all deleted still renders with no list and no chart', async () => {
    load({ cues: [cue], lifts: [], sessions: [] });
    const view = await render(<CueRoute />);
    expect(view.getByText('Land on the line you started on.')).toBeOnTheScreen();
    expect(view.getByText('cm · 0 sessions measured')).toBeOnTheScreen();
    expect(view.queryByTestId('cue-lifts')).toBeNull();
    expect(view.queryByTestId('cue-chart')).toBeNull();
    expect(view.queryByTestId('before-readout')).toBeNull();
  });
});
