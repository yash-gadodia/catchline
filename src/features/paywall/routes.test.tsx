import { act, fireEvent, render } from '@testing-library/react-native';
import { newClip, useCapture } from '../capture/store';
import { useOnboarding } from '../onboarding/store';
import { usePurchases } from '../purchases/usePurchases';
import { useUsage } from './usageStore';
import { startLift } from '../../data/pipeline';
import QuizRoute from '../../../app/paywall/funnel/quiz';
import PaywallRoute from '../../../app/paywall/index';
import CapRoute from '../../../app/paywall/cap';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => params.current };
});
const mockNav = jest.requireMock('expo-router').router as { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/pipeline', () => ({ startLift: jest.fn() }));
jest.mock('./seats', () => ({
  ...jest.requireActual('./seats'),
  getFoundingSeats: jest.fn(async () => ({ total: 500, remaining: 137 })),
}));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const draft = () => newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera', movement: 'snatch' });

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  useCapture.setState({ draft: null, lastWeight: '' });
  useOnboarding.setState({ units: 'kg' });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.getState().reset();
});

async function finishQuiz(view: Awaited<ReturnType<typeof render>>) {
  await press(view.getByText('Snatch'));
  await press(view.getByTestId('quiz-next'));
  await press(view.getByText('I miss behind'));
  await press(view.getByTestId('quiz-next'));
  await press(view.getByText('2 to 3 times a week'));
  await press(view.getByTestId('quiz-next'));
  await press(view.getByText('Sometimes'));
  await press(view.getByTestId('quiz-next'));
}

// Prod bug (14-10-2026): finishing the ad quiz opened /analysis/processing bare, which
// plays the bundled snatch instead of the clip the lifter had just picked.
describe('ad quiz', () => {
  it('uploads the saved clip when the quiz is done', async () => {
    useCapture.setState({ draft: draft() });
    const view = await render(<QuizRoute />);
    await finishQuiz(view);

    expect(useUsage.getState().variant).toBe('ad');
    expect(startLift).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///clip.mov', movement: 'snatch' }));
    expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
    expect(mockNav.replace).not.toHaveBeenCalledWith('/analysis/processing');
  });

  it('with no saved clip falls back to processing', async () => {
    const view = await render(<QuizRoute />);
    await finishQuiz(view);

    expect(startLift).not.toHaveBeenCalled();
    expect(mockNav.replace).toHaveBeenCalledWith('/analysis/processing');
  });
});

// The clip queue was never consumed (takeQueued has no caller), so "queue" only wrote a fake
// clip-<timestamp> id to disk. Not now / queue just close the sheet; the draft stays where
// it is and Review is still underneath.
describe('not now / queue keep the draft and queue nothing', () => {
  it('paywall: Not now', async () => {
    useCapture.setState({ draft: draft() });
    params.current = { clip: 'clip-1', movement: 'snatch' };
    const view = await render(<PaywallRoute />);
    await press(view.getByText('Not now, keep it queued'));

    expect(mockNav.back).toHaveBeenCalledTimes(1);
    expect(useUsage.getState().queue).toEqual([]);
    expect(useCapture.getState().draft?.uri).toBe('file:///clip.mov');
  });

  it('cap: Queue until next month', async () => {
    useCapture.setState({ draft: draft() });
    params.current = { tier: 'pull', period: 'annual', clip: 'clip-1', movement: 'snatch' };
    const view = await render(<CapRoute />);
    await press(view.getByText(/^Queue until/));

    expect(mockNav.back).toHaveBeenCalledTimes(1);
    expect(useUsage.getState().queue).toEqual([]);
    expect(useCapture.getState().draft?.uri).toBe('file:///clip.mov');
  });
});
