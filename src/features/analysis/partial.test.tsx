import { act, fireEvent, render } from '@testing-library/react-native';
import { snatchMockPartial } from '../../analysis/fixtures';
import { putLiveAnalysis } from '../../analysis/live';
import type { Analysis } from '../../analysis/types';
import CueRoute from '../../../app/analysis/cue';
import PlayerRoute from '../../../app/analysis/player';
import { emptyLibrary } from '../library/seed';
import { useLibraryStore } from '../library/store';
import type { CueRecord } from '../library/types';
import RevealScreen from './RevealScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), dismissTo: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockRouter,
  useRouter: () => mockRouter,
  useNavigation: () => ({ setOptions: () => {}, getParent: () => undefined }),
  useLocalSearchParams: () => mockParams.current,
}));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const trying: CueRecord = {
  id: 'c1',
  movement: 'snatch',
  text: 'Stay over the bar longer',
  metricId: 'bar_drift_hip',
  givenAt: '2026-10-01',
  status: 'trying',
  sessionsTarget: 6,
  sessionsDone: 2,
  before: { image: '' },
  after: { image: '' },
};

beforeEach(() => {
  jest.clearAllMocks();
  useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-17' });
  mockParams.current = { fixture: 'snatch-mock-partial' };
});

describe('a partial result (path and phases, no cue)', () => {
  it('shows the no-cue card with the angle, the tip and the bar path', async () => {
    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('no-cue-title')).toHaveTextContent('No cue this time');
    expect(screen.getByTestId('no-cue-reason')).toHaveTextContent(
      "Filmed about 34° off side-on, so forward and back distances aren't reliable."
    );
    expect(screen.getByTestId('no-cue-tip')).toHaveTextContent('Film from the side, phone level with the bar.');
    expect(screen.getByTestId('partial-path')).toBeOnTheScreen();
    expect(screen.queryByTestId('cue-text')).toBeNull();
    expect(screen.queryByText('Nothing to fix on this set')).toBeNull();
  });

  it('names a hidden plate and how to film it', async () => {
    const hidden: Analysis = { ...snatchMockPartial, id: 'partial-plate', noCueReason: { code: 'plate_hidden' } };
    putLiveAnalysis(hidden);
    mockParams.current = { fixture: 'partial-plate' };
    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('no-cue-reason')).toHaveTextContent("The plate was partly hidden, so the lift couldn't be sized.");
    expect(screen.getByTestId('no-cue-tip')).toHaveTextContent('Keep the near plate fully in view, nothing in front of it.');
  });

  it('films again or opens the breakdown', async () => {
    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('film-again')).toHaveTextContent('Film again');
    expect(screen.queryByTestId('cue-retest')).toBeNull();
    await press(screen.getByTestId('see-breakdown'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/analysis/player', params: { fixture: 'snatch-mock-partial' } });
    await press(screen.getByTestId('film-again'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    expect(mockRouter.push).toHaveBeenLastCalledWith('/capture');
  });

  it('Ask why falls back to the report form with the lift when Intercom is not set up', async () => {
    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('ask-why')).toHaveTextContent('Ask why');
    await press(screen.getByTestId('ask-why'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/report',
      params: { lift: 'snatch-mock-partial', context: 'Snatch · cue: none' },
    });
  });

  it('leads with Retest when the lift was a retest of a trying cue', async () => {
    useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-17', cues: [trying] });
    mockParams.current = { fixture: 'snatch-mock-partial', retest: 'c1' };
    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('cue-retest')).toHaveTextContent('Retest this cue');
    expect(screen.queryByTestId('film-again')).toBeNull();
    await press(screen.getByTestId('cue-retest'));
    expect(mockRouter.push).toHaveBeenCalledWith('/capture?retest=c1');
  });

  it('says why in the player instead of a cue', async () => {
    const screen = await render(<PlayerRoute />);
    expect(screen.getByTestId('player-no-cue')).toHaveTextContent(
      "Filmed about 34° off side-on, so forward and back distances aren't reliable. Film from the side, phone level with the bar."
    );
    expect(screen.queryByTestId('player-confidence')).toBeNull();
  });
});

describe('RevealScreen on a lift with no cue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('draws the path and types "No cue this time" without a number', async () => {
    const onDone = jest.fn();
    const screen = await render(<RevealScreen analysis={snatchMockPartial} onDone={onDone} reduceMotion={false} />);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('hero-number')).toBeNull();
    expect(screen.getByTestId('reveal-cue')).toHaveTextContent('No cue this time');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
