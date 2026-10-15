import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCapture } from './store';
import ReviewRoute from '../../../app/capture/review';
import TrimRoute from '../../../app/capture/trim';
import ImportRoute from '../../../app/capture/import';
import ShareRoute from '../../../app/capture/share';

const params: { current: Record<string, string> } = { current: {} };
const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockNav,
  useRouter: () => mockNav,
  useLocalSearchParams: () => params.current,
}));

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { __esModule: true, VideoView: View, useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) }) };
});
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { availableDiskSpace: 0 } }));

jest.mock('../onboarding/store', () => {
  const actual = jest.requireActual('../onboarding/store');
  return { ...actual, useHydrated: () => true, hasConsent: () => true };
});

const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  useCapture.setState({ draft: null });
});

// Prod bug (14-10-2026, TestFlight): with no draft (the app was relaunched, or the paywall
// opened over an empty capture store) Review and Trim loaded the bundled sample snatch as
// if it were the lifter's clip. In a release build they send the lifter back to capture.
describe('release build: no draft means back to capture, never the sample', () => {
  beforeEach(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = false;
  });
  afterEach(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
  });

  it('review: goes back to capture', async () => {
    const view = await render(<ReviewRoute />);

    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(useCapture.getState().draft).toBeNull();
    expect(view.queryByTestId('review-screen')).toBeNull();
  });

  it('review: ignores the ?demo link', async () => {
    params.current = { demo: 'ok' };
    const view = await render(<ReviewRoute />);

    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(useCapture.getState().draft).toBeNull();
    expect(view.queryByTestId('review-screen')).toBeNull();
  });

  it('trim: goes back to capture', async () => {
    const view = await render(<TrimRoute />);

    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(useCapture.getState().draft).toBeNull();
    expect(view.queryByTestId('trim-screen')).toBeNull();
  });

  it('import: ?demo=1 opens the real picker instead of the sample', async () => {
    params.current = { demo: '1' };
    const view = await render(<ImportRoute />);

    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    expect(useCapture.getState().draft).toBeNull();
    expect(view.queryByTestId('import-screen')).toBeNull();
  });

  it('share: no shared video means back to capture', async () => {
    const view = await render(<ShareRoute />);

    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(useCapture.getState().draft).toBeNull();
    expect(view.queryByTestId('review-screen')).toBeNull();
  });
});

describe('dev build: the simulator still gets its sample clip', () => {
  it('review with no draft loads the sample', async () => {
    const view = await render(<ReviewRoute />);

    expect(mockNav.replace).not.toHaveBeenCalled();
    expect(useCapture.getState().draft?.uri).toBeNull();
    expect(view.getByTestId('review-screen')).toBeOnTheScreen();
  });

  it('import ?demo=1 loads the long sample without the picker', async () => {
    params.current = { demo: '1' };
    const view = await render(<ImportRoute />);

    expect(launch).not.toHaveBeenCalled();
    expect(useCapture.getState().draft?.source).toBe('library');
    expect(view.getByTestId('import-screen')).toBeOnTheScreen();
  });
});

describe('import is the main way in', () => {
  it('a cancelled picker shows the empty state with Record instead, not the viewfinder', async () => {
    const view = await render(<ImportRoute />);

    await waitFor(() => expect(view.getByTestId('import-empty')).toBeOnTheScreen());
    expect(launch).toHaveBeenCalledTimes(1);
    expect(mockNav.replace).not.toHaveBeenCalled();
    expect(view.getByTestId('import-record')).toHaveTextContent('Record instead');

    fireEvent.press(view.getByTestId('import-record'));
    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
  });

  it('Choose a video opens the picker again; Cancel goes home', async () => {
    const view = await render(<ImportRoute />);
    await waitFor(() => expect(view.getByTestId('import-empty')).toBeOnTheScreen());

    await act(async () => {
      fireEvent.press(view.getByTestId('import-pick'));
    });
    await waitFor(() => expect(launch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.getByTestId('import-empty')).toBeOnTheScreen());

    fireEvent.press(view.getByTestId('import-cancel'));
    expect(mockNav.replace).toHaveBeenCalledWith('/');
  });
});
