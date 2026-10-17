import { act, fireEvent, render } from '@testing-library/react-native';
import { snatchMockClean } from '../../analysis/fixtures';
import fs from 'fs';
import path from 'path';
import CueRoute from '../../../app/analysis/cue';
import PlayerRoute from '../../../app/analysis/player';
import { emptyLibrary } from '../library/seed';
import { useLibraryStore } from '../library/store';
import { liftDetail } from '../library/derive';
import type { Lift } from '../library/types';
import CueScreen from './CueScreen';
import RevealScreen from './RevealScreen';

// Build 31 crashed on lift eeed17ec: a made snatch where no fault fired came back with cue null, and the reveal and
// result screens read `analysis.cue!`.

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), dismissTo: jest.fn() };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockRouter,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ fixture: 'snatch-mock-clean' }),
}));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-17' });
});

describe('a clean rep (no fault fired)', () => {
  it('plays the reveal and types "Clean rep." where the cue would be', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const screen = await render(<RevealScreen analysis={snatchMockClean} onDone={onDone} reduceMotion={false} />);
    expect(screen.getByTestId('strobe-setup')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('reveal-cue')).toHaveTextContent('Clean rep.');
    expect(screen.queryByTestId('hero-number')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('shows the reduced-motion reveal without throwing', async () => {
    jest.useFakeTimers();
    const screen = await render(<RevealScreen analysis={snatchMockClean} onDone={jest.fn()} reduceMotion />);
    await act(async () => {
      jest.advanceTimersByTime(1400);
    });
    expect(screen.getByTestId('reveal-cue')).toHaveTextContent('Clean rep.');
    jest.useRealTimers();
  });

  it('says so on the result with the path, then offers Retest heavier and Share', async () => {
    const screen = await render(<CueRoute />);
    expect(screen.getByTestId('clean-title')).toHaveTextContent('Clean rep.');
    expect(screen.getByTestId('clean-body')).toHaveTextContent('Nothing crossed a fault threshold. Bar path and phases below.');
    expect(screen.getByTestId('clean-path')).toBeOnTheScreen();
    expect(screen.queryByText('Nothing to fix on this set')).toBeNull();
    await press(screen.getByTestId('retest-heavier'));
    expect(screen.getByTestId('retest-heavier')).toHaveTextContent('Retest heavier');
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    expect(mockRouter.push).toHaveBeenLastCalledWith('/capture');
    await press(screen.getByTestId('clean-share'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/share', params: { fixture: 'snatch-mock-clean' } });
    await press(screen.getByTestId('see-breakdown'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/analysis/player', params: { fixture: 'snatch-mock-clean' } });
  });

  it('keeps the could-not-read screen for a failure', async () => {
    const failed = { ...snatchMockClean, reps: [], failure: { reason: 'too_dark' as const, message: 'Too dark to see the bar.' } };
    const nav = { onTry: jest.fn(), onNotForMe: jest.fn(), onBack: jest.fn(), onFilmAgain: jest.fn() };
    const screen = await render(<CueScreen analysis={failed} nav={nav} />);
    expect(screen.getByText("We couldn't read this one")).toBeOnTheScreen();
    expect(screen.queryByTestId('clean-title')).toBeNull();
  });

  it('opens in the player without a cue', async () => {
    const screen = await render(<PlayerRoute />);
    expect(screen.queryByTestId('player-confidence')).toBeNull();
    expect(screen.toJSON()).not.toBeNull();
  });

  it('is never asserted non-null in app code', () => {
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return files(p);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
      });
    const root = path.join(__dirname, '../../..');
    const hits = [...files(path.join(root, 'src')), ...files(path.join(root, 'app'))].filter((f) => /\bcue!/.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('reads "clean" on its Lifts row', () => {
    const lift: Lift = { id: 'lc', movement: 'snatch', date: '2026-10-16', status: 'done', analysisId: 'snatch-mock-clean' };
    expect(liftDetail(lift, [])).toBe('clean');
  });
});
