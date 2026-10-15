import { act, fireEvent, render } from '@testing-library/react-native';
import { snatchMock } from '../../analysis/fixtures';
import { putLiveAnalysis } from '../../analysis/live';
import type { Analysis } from '../../analysis/types';
import CueRoute from '../../../app/analysis/cue';
import PlayerRoute from '../../../app/analysis/player';
import CueDetailRoute from '../../../app/cue/[id]';
import CaptureRoute from '../../../app/capture/index';
import { useCapture } from '../capture/store';
import { loadLibrary } from '../library/repository';
import { emptyLibrary } from '../library/seed';
import { useLibraryStore } from '../library/store';
import type { CueRecord, Lift } from '../library/types';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), dismissTo: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockRouter,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    CameraView: View,
    useCameraPermissions: () => [{ granted: true, status: 'granted', canAskAgain: true }, jest.fn()],
  };
});
jest.mock('expo-speech', () => ({ __esModule: true, speak: jest.fn(), stop: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { availableDiskSpace: 1e12 } }));
jest.mock('../onboarding/store', () => {
  const actual = jest.requireActual('../onboarding/store');
  return { ...actual, useHydrated: () => true, hasConsent: () => true };
});

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
  mockParams.current = {};
});

describe('the result of a retest', () => {
  it('opens with the tested cue, before and now, though another fault is the headline', async () => {
    mockParams.current = { fixture: 'snatch-mock', retest: 'c-stay-over' };
    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('retest-verdict')).toHaveTextContent('Retest · Stay over the bar longer', { exact: false });
    expect(screen.getByTestId('retest-verdict-text')).toHaveTextContent('Bar drift at hip 7 cm → 6 cm. Same.');
    expect(screen.getByTestId('cue-text')).toHaveTextContent(snatchMock.cue!.text);
  });

  it('films the same cue again from the result', async () => {
    mockParams.current = { fixture: 'snatch-mock', retest: 'c-stay-over' };
    const screen = await render(<CueRoute />);
    await press(screen.getByTestId('cue-retest'));
    expect(mockRouter.push).toHaveBeenCalledWith('/capture?retest=c-stay-over');
  });

  it('is an ordinary result when the lift was not a retest', async () => {
    mockParams.current = { fixture: 'snatch-mock' };
    const screen = await render(<CueRoute />);
    expect(screen.queryByTestId('retest-verdict')).toBeNull();
    expect(screen.queryByTestId('cue-retest')).toBeNull();
  });

  it('offers "It stuck" after two clean retests in a row, and marks it', async () => {
    const clean = (id: string): Analysis => ({
      ...snatchMock,
      id,
      measurements: snatchMock.measurements.map((m) => (m.id === 'bar_drift_hip' ? { ...m, value: 3, status: 'normal' } : m)),
    });
    putLiveAnalysis(clean('retest-1'));
    putLiveAnalysis(clean('retest-2'));
    const lib = useLibraryStore.getState();
    const retest = (id: string, date: string): Lift => ({ id, movement: 'snatch', date, status: 'done', analysisId: id, retestCueId: 'c-stay-over' });
    lib.load({ ...lib, lifts: [retest('retest-2', '2026-10-11'), retest('retest-1', '2026-10-10'), ...lib.lifts] });
    mockParams.current = { fixture: 'retest-2' };

    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('retest-verdict-text')).toHaveTextContent('Bar drift at hip 6 cm → 3 cm. Better.');
    expect(screen.getByTestId('retest-streak')).toHaveTextContent("Bar drift at hip didn't come up on your last 2 retests.");
    await press(screen.getByTestId('retest-stuck'));
    expect(useLibraryStore.getState().cues.find((c) => c.id === 'c-stay-over')?.status).toBe('stuck');
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/cue/[id]', params: { id: 'c-stay-over' } });
  });
});

describe('the player', () => {
  it('carries the cue under test into the next capture', async () => {
    mockParams.current = { fixture: 'snatch-mock', retest: 'c-stay-over' };
    const screen = await render(<PlayerRoute />);
    await press(screen.getByTestId('player-retest'));
    expect(mockRouter.push).toHaveBeenCalledWith('/capture?retest=c-stay-over');
  });

  it('has no retest when no trying cue matches the lift', async () => {
    mockParams.current = { fixture: 'snatch-mock' };
    const screen = await render(<PlayerRoute />);
    expect(screen.queryByTestId('player-retest')).toBeNull();
  });
});

describe('cue detail', () => {
  const cue: CueRecord = {
    id: 'c1',
    movement: 'snatch',
    text: 'Stay over the bar longer',
    metricId: 'bar_drift_hip',
    givenAt: '2026-10-01',
    status: 'trying',
    sessionsTarget: 6,
    before: { image: '' },
    after: { image: '' },
  };

  it('leads with "Retest this cue" and keeps "It stuck" one step down', async () => {
    useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-11', cues: [cue] });
    mockParams.current = { id: 'c1' };
    const screen = await render(<CueDetailRoute />);
    expect(screen.getByTestId('cue-retest')).toHaveTextContent('Retest this cue');
    expect(screen.getByTestId('mark-stuck')).toHaveTextContent('It stuck');
    expect(screen.queryByTestId('cue-streak')).toBeNull();
    await press(screen.getByTestId('cue-retest'));
    expect(mockRouter.push).toHaveBeenCalledWith('/capture?retest=c1');
  });

  it('leads with "It stuck" once the last two retests came back clean', async () => {
    const clean: Analysis = { ...snatchMock, id: 'd-clean', cue: null, notes: [], measurements: [] };
    putLiveAnalysis(clean);
    const lift = (id: string, date: string): Lift => ({ id, movement: 'snatch', date, status: 'done', analysisId: 'd-clean', retestCueId: 'c1' });
    useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-11', cues: [cue], lifts: [lift('a', '2026-10-11'), lift('b', '2026-10-09')] });
    mockParams.current = { id: 'c1' };
    const screen = await render(<CueDetailRoute />);
    expect(screen.getByTestId('cue-streak')).toHaveTextContent("Bar drift at hip didn't come up on your last 2 retests.");
    await press(screen.getByTestId('mark-stuck'));
    expect(useLibraryStore.getState().cues[0].status).toBe('stuck');
  });
});

describe('capture for a retest', () => {
  it('preselects the cue movement and shows the cue with the number to beat', async () => {
    useCapture.setState({ movement: 'clean', draft: null });
    mockParams.current = { still: '1', retest: 'c-stay-over' };
    const screen = await render(<CaptureRoute />);
    expect(useCapture.getState().movement).toBe('snatch');
    expect(screen.getByTestId('retest-target')).toHaveTextContent('Stay over the bar longer: bar drift at hip under 6 cm');
  });

  it('shows no target on an ordinary capture', async () => {
    mockParams.current = { still: '1' };
    const screen = await render(<CaptureRoute />);
    expect(screen.queryByTestId('retest-target')).toBeNull();
  });
});
