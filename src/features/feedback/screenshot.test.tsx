import { act, fireEvent, render } from '@testing-library/react-native';
import ScreenshotSheet from './ScreenshotSheet';
import { onScreenshot, useScreenshotFeedback, watchScreenshots } from './screenshot';

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return { __esModule: true, router: r, useRouter: () => r, usePathname: () => '/cues' };
});

const viewShot = jest.requireMock('react-native-view-shot') as { captureScreen: jest.Mock };
const capture = jest.requireMock('expo-screen-capture') as { addScreenshotListener: jest.Mock };
const core = { requireOptionalNativeModule: jest.spyOn(require('expo-modules-core'), 'requireOptionalNativeModule') };
const router = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

beforeEach(() => {
  jest.clearAllMocks();
  core.requireOptionalNativeModule.mockReturnValue({});
  useScreenshotFeedback.setState({ enabled: true, shot: null });
});

describe('onScreenshot', () => {
  it('captures the screen and offers it', async () => {
    await onScreenshot();
    expect(viewShot.captureScreen).toHaveBeenCalledWith({ format: 'jpg', quality: 0.8, result: 'tmpfile' });
    expect(useScreenshotFeedback.getState().shot).toBe('file:///mock/screen.jpg');
  });

  it('does nothing while the prompt is off, or while one is already up', async () => {
    useScreenshotFeedback.setState({ enabled: false });
    await onScreenshot();
    expect(viewShot.captureScreen).not.toHaveBeenCalled();
    useScreenshotFeedback.setState({ enabled: true, shot: 'file:///up.jpg' });
    await onScreenshot();
    expect(viewShot.captureScreen).not.toHaveBeenCalled();
    expect(useScreenshotFeedback.getState().shot).toBe('file:///up.jpg');
  });

  it('listens for the system screenshot and stops listening on cleanup', () => {
    const stop = watchScreenshots();
    expect(capture.addScreenshotListener).toHaveBeenCalledTimes(1);
    stop();
    expect(capture.addScreenshotListener.mock.results[0].value.remove).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a binary without the native module (a 3.1 phone)', () => {
    core.requireOptionalNativeModule.mockReturnValueOnce(null);
    expect(() => watchScreenshots()()).not.toThrow();
    expect(core.requireOptionalNativeModule).toHaveBeenCalledWith('ExpoScreenCapture');
    expect(capture.addScreenshotListener).not.toHaveBeenCalled();
  });
});

describe('ScreenshotSheet', () => {
  it('renders nothing without a shot', async () => {
    const view = await render(<ScreenshotSheet />);
    expect(view.queryByTestId('screenshot-sheet')).toBeNull();
  });

  it('shows the capture and sends it to the report screen', async () => {
    useScreenshotFeedback.setState({ shot: 'file:///mock/screen.jpg' });
    const view = await render(<ScreenshotSheet />);
    expect(view.getByTestId('screenshot-thumb').props.source).toEqual({ uri: 'file:///mock/screen.jpg' });
    expect(view.getByText('Help improve Catchline')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByTestId('screenshot-give')));
    expect(router.router.push).toHaveBeenCalledWith({ pathname: '/report', params: { shot: 'file:///mock/screen.jpg', context: 'screenshot /cues' } });
    expect(useScreenshotFeedback.getState().shot).toBeNull();
  });

  it('turning the switch off closes the sheet and keeps the prompt off', async () => {
    useScreenshotFeedback.setState({ shot: 'file:///mock/screen.jpg' });
    const view = await render(<ScreenshotSheet />);
    await act(async () => fireEvent(view.getByTestId('screenshot-toggle'), 'valueChange', false));
    expect(useScreenshotFeedback.getState()).toMatchObject({ enabled: false, shot: null });
    expect(view.queryByTestId('screenshot-sheet')).toBeNull();
  });

  it('a tap outside dismisses it', async () => {
    useScreenshotFeedback.setState({ shot: 'file:///mock/screen.jpg' });
    const view = await render(<ScreenshotSheet />);
    await act(async () => fireEvent.press(view.getByTestId('screenshot-dismiss')));
    expect(useScreenshotFeedback.getState().shot).toBeNull();
  });
});
