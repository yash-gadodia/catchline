import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCapture } from './store';
import TrimRoute from '../../../app/capture/trim';
import ImportRoute from '../../../app/capture/import';
import ShareRoute from '../../../app/capture/share';

const params: { current: Record<string, string> } = { current: {} };
const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) };
const mockStack = { setOptions: jest.fn(), getParent: () => undefined };

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    get router() {
      return mockNav;
    },
    useRouter: () => mockNav,
    useNavigation: () => mockStack,
    useLocalSearchParams: () => params.current,
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});

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
    expect(mockNav.replace).not.toHaveBeenCalledWith('/capture/trim');
    expect(view.queryByTestId('import-empty')).not.toBeNull();
  });

  it('share: no shared video means back to capture', async () => {
    const view = await render(<ShareRoute />);

    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(useCapture.getState().draft).toBeNull();
    expect(view.queryByTestId('redirect')).toBeNull();
  });
});

describe('dev build: the simulator still gets its sample clip', () => {
  it('trim with no draft loads the sample', async () => {
    const view = await render(<TrimRoute />);

    expect(mockNav.replace).not.toHaveBeenCalled();
    expect(useCapture.getState().draft?.uri).toBeNull();
    expect(view.getByTestId('trim-screen')).toBeOnTheScreen();
  });

  it('import ?demo=1 loads the long sample without the picker and goes to trim', async () => {
    params.current = { demo: '1' };
    await render(<ImportRoute />);

    expect(launch).not.toHaveBeenCalled();
    expect(useCapture.getState().draft?.source).toBe('library');
    expect(mockNav.replace).toHaveBeenCalledWith('/capture/trim');
  });

  it('a shared video lands on trim', async () => {
    params.current = { uri: 'file:///shared.mov', from: 'WhatsApp', duration: '9', fps: '60' };
    const view = await render(<ShareRoute />);

    await waitFor(() => expect(view.getByTestId('redirect')).toHaveTextContent('/capture/trim'));
    expect(useCapture.getState().draft).toEqual({
      uri: 'file:///shared.mov',
      durationS: 9,
      fps: 60,
      source: 'share',
      from: 'WhatsApp',
      trim: { start: 0, end: 9 },
      overridden: [],
    });
  });
});

describe('add a video, trim, track', () => {
  it('a picked video goes straight to trim, with no movement to choose', async () => {
    launch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///lift.mov', duration: 8000 }] });
    const view = await render(<ImportRoute />);

    await waitFor(() => expect(mockNav.replace).toHaveBeenCalledWith('/capture/trim'));
    expect(useCapture.getState().draft).toEqual({ uri: 'file:///lift.mov', durationS: 8, fps: null, source: 'library', trim: { start: 0, end: 8 }, overridden: [] });
    expect(view.queryByTestId('lift-chip')).toBeNull();
  });

  it('Track on the trim screen keeps the trim and starts tracking, with no plate to mark first', async () => {
    useCapture.setState({ draft: { uri: 'file:///lift.mov', durationS: 8, fps: 30, source: 'library', trim: { start: 1, end: 6 }, overridden: [] }, lastWeight: '62.5' });
    const view = await render(<TrimRoute />);
    expect(view.queryByTestId('lift-chip')).toBeNull();
    expect(view.getByTestId('weight-input')).toHaveProp('value', '62.5');
    // dragging a trim handle must not swipe the screen away
    expect(mockStack.setOptions).toHaveBeenCalledWith({ gestureEnabled: false, fullScreenGestureEnabled: false });

    await act(async () => {
      fireEvent.press(view.getByTestId('trim-track'));
    });
    expect(useCapture.getState().draft?.trim).toEqual({ start: 1, end: 6 });
    expect(useCapture.getState().draft?.plateMark).toBeNull();
    expect(mockNav.push).not.toHaveBeenCalledWith('/capture/mark');
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
