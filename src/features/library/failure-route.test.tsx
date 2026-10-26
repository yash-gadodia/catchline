import { act, fireEvent, render } from '@testing-library/react-native';
import { newClip, useCapture } from '../capture/store';
import { useOnboarding } from '../onboarding/store';
import { usePurchases } from '../purchases/usePurchases';
import { useUsage } from '../paywall/usageStore';
import { startLift } from '../../data/pipeline';
import FailureRoute from '../../../app/failure/[id]';
import { useLibraryStore } from './store';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => params.current };
});
const mockNav = jest.requireMock('expo-router').router as { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/pipeline', () => ({ startLift: jest.fn() }));
jest.mock('../../data/localLifts', () => ({ localClipUri: jest.fn(() => null) }));
jest.mock('../../data/shareClip', () => ({ shareFailedClip: jest.fn() }));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  useCapture.setState({ draft: null, lastWeight: '' });
  useOnboarding.setState({ units: 'kg' });
  usePurchases.setState({ tier: 'pull', period: 'annual' });
  useUsage.getState().reset();
});

// Prod bug (14-10-2026): "Try again" on a failed lift opened /analysis/processing bare (the
// demo), "Analyse the pull only" opened the snatch-mock player, and a lift the library did
// not have showed the design's "Snatch · 62.5 kg" header.
describe('release build: a failed lift never falls back to the demo', () => {
  beforeEach(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = false;
  });
  afterEach(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
  });

  it('Try again re-sends the saved clip', async () => {
    useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera', movement: 'snatch' }) });
    params.current = { id: 'lift-7', reason: 'unknown' };
    const view = await render(<FailureRoute />);
    await press(view.getByTestId('failure-primary'));

    expect(startLift).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///clip.mov' }));
    expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
  });

  it('Try again with no saved clip goes to capture, not the demo', async () => {
    params.current = { id: 'lift-7', reason: 'unknown' };
    const view = await render(<FailureRoute />);
    await press(view.getByTestId('failure-primary'));

    expect(startLift).not.toHaveBeenCalled();
    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(mockNav.replace).not.toHaveBeenCalledWith('/analysis/processing');
  });

  it('a partial analysis with nothing to show just goes back', async () => {
    params.current = { id: 'lift-7', reason: 'clip_cut_off' };
    const view = await render(<FailureRoute />);
    await press(view.getByText('Analyse the pull only'));

    expect(mockNav.back).toHaveBeenCalledTimes(1);
    expect(mockNav.replace).not.toHaveBeenCalled();
  });

  it('no demo header for a lift the library does not have', async () => {
    params.current = { id: 'lift-7', reason: 'unknown' };
    const view = await render(<FailureRoute />);

    expect(view.queryByText('Snatch · 62.5 kg')).toBeNull();
  });
});

describe('dev build', () => {
  it('still previews a failure with the design header', async () => {
    params.current = { id: 'demo', reason: 'too_dark' };
    const view = await render(<FailureRoute />);

    expect(view.getByText('Snatch · 62.5 kg')).toBeOnTheScreen();
  });
});

// #23: a refused snatch read "looks like: wall walk" with a wall-walk stage, canned for every refusal.
it('a refused lift shows its own refusal line, not a canned movement', async () => {
  useLibraryStore.setState({
    lifts: [{ id: 'lift-9', movement: 'snatch', date: '2026-10-18', status: 'failed',
      failure: { reason: 'unsupported_movement', code: 'no_reps', message: 'No floor-to-overhead lift found in this clip.' } }],
  });
  params.current = { id: 'lift-9' };
  const view = await render(<FailureRoute />);

  expect(view.getByTestId('failure-readout')).toHaveTextContent('No floor-to-overhead lift found in this clip.');
  expect(view.queryByText(/wall walk/i)).toBeNull();
});

// 26-10: the server never sees a clip, so a failure it cannot reproduce needs the lifter to choose to send it.
describe('Send this clip so we can fix it', () => {
  const clipMock = jest.requireMock('../../data/localLifts') as { localClipUri: jest.Mock };
  const shareMock = jest.requireMock('../../data/shareClip') as { shareFailedClip: jest.Mock };
  beforeEach(() => {
    params.current = { id: 'lift-7', reason: 'unsupported_movement' };
    clipMock.localClipUri.mockReturnValue('file:///lifts/lift-7/clip.mp4');
  });

  it('is offered only when the failed clip is still on the phone', async () => {
    clipMock.localClipUri.mockReturnValue(null);
    const view = await render(<FailureRoute />);
    expect(view.queryByTestId('failure-share')).toBeNull();
  });

  it('sends the clip with its progress and says when it is there', async () => {
    let resolve: () => void = () => undefined;
    shareMock.shareFailedClip.mockImplementation((_id: string, _code: string | null, onProgress: (f: number) => void) => {
      onProgress(0.4);
      return new Promise<void>((r) => (resolve = r));
    });
    const view = await render(<FailureRoute />);
    expect(view.getByText('Only this clip, only to us, deleted after 30 days.')).toBeOnTheScreen();
    await press(view.getByTestId('failure-share-send'));
    expect(shareMock.shareFailedClip).toHaveBeenCalledWith('lift-7', null, expect.any(Function));
    expect(view.getByTestId('failure-share-state')).toHaveTextContent('Sending 40%');
    await act(async () => resolve());
    expect(view.getByTestId('failure-share-state')).toHaveTextContent('Sent. Thank you');
  });

  it('says so when the send fails, and offers it again', async () => {
    shareMock.shareFailedClip.mockRejectedValue(new Error('offline'));
    const view = await render(<FailureRoute />);
    await press(view.getByTestId('failure-share-send'));
    expect(view.getByTestId('failure-share-send')).toHaveTextContent("Couldn't send. Try again when online");
  });
});
