import { act, fireEvent, render } from '@testing-library/react-native';
import { hasConsent, useOnboarding } from './store';
import WelcomeRoute from '../../../app/onboarding/index';
import GuideRoute from '../../../app/onboarding/guide';
import AddVideoRoute from '../../../app/onboarding/camera';
import PrivacyRoute from '../../../app/onboarding/privacy';

const params: { current: Record<string, string> } = { current: {} };
const mockCamera = { ready: true, status: 'undetermined', canAskAgain: true, request: jest.fn(), openSettings: jest.fn() };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => params.current };
});
const mockNav = jest.requireMock('expo-router').router as { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
jest.mock('../../data/backend', () => ({ backendEnabled: () => false, syncConsent: jest.fn() }));
jest.mock('../capture/camera', () => ({ useCameraPermission: () => mockCamera }));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  mockCamera.status = 'undetermined';
  mockCamera.canAskAgain = true;
  useOnboarding.getState().reset();
});

describe('onboarding is one screen', () => {
  it('picking a lift records the consent, finishes onboarding and opens the picker, with no camera prompt', async () => {
    const view = await render(<WelcomeRoute />);
    expect(hasConsent(useOnboarding.getState().consent)).toBe(false);
    await press(view.getByText('Pick one of your lifts'));
    expect(hasConsent(useOnboarding.getState().consent)).toBe(true);
    expect(mockCamera.request).not.toHaveBeenCalled();
    expect(useOnboarding.getState().completed).toBe(true);
    expect(mockNav.replace.mock.calls).toEqual([['/capture/import']]);
  });

  it('filming records the consent, asks for the camera, then finishes onboarding in the viewfinder', async () => {
    mockCamera.request.mockResolvedValue('granted');
    const view = await render(<WelcomeRoute />);
    await press(view.getByText('Film a lift now'));
    expect(hasConsent(useOnboarding.getState().consent)).toBe(true);
    expect(mockCamera.request).toHaveBeenCalledTimes(1);
    expect(useOnboarding.getState().completed).toBe(true);
    expect(mockNav.replace.mock.calls).toEqual([['/capture']]);
  });

  it('a refused camera goes to the camera-off screen, onboarding not finished yet', async () => {
    mockCamera.request.mockResolvedValue('denied');
    const view = await render(<WelcomeRoute />);
    await press(view.getByText('Film a lift now'));
    expect(mockNav.replace).not.toHaveBeenCalled();
    expect(mockNav.push.mock.calls).toEqual([['/onboarding/camera?state=denied']]);
    expect(useOnboarding.getState().completed).toBe(false);
  });
});

describe('the camera-off screen', () => {
  it('choosing a video finishes onboarding and opens the picker', async () => {
    params.current = { state: 'denied' };
    const view = await render(<AddVideoRoute />);
    expect(view.getByTestId('camera-denied')).toBeOnTheScreen();
    await press(view.getByText('Open Settings'));
    expect(mockCamera.openSettings).toHaveBeenCalledTimes(1);
    await press(view.getByText('Choose a video'));
    expect(useOnboarding.getState().completed).toBe(true);
    expect(mockNav.replace.mock.calls).toEqual([['/capture/import']]);
  });
});

describe('outside onboarding', () => {
  it('the viewfinder’s "?" opens the guide and closes it again', async () => {
    params.current = { from: 'capture', group: 'gymnastics' };
    const view = await render(<GuideRoute />);
    await press(view.getByText('Got it'));
    expect(mockNav.back).toHaveBeenCalledTimes(1);
    expect(mockNav.push).not.toHaveBeenCalled();
  });

  it('a lifter sent back for consent goes on to what they opened', async () => {
    params.current = { intent: 'import' };
    const view = await render(<PrivacyRoute />);
    await press(view.getByTestId('consent-required'));
    await press(view.getByTestId('privacy-continue'));
    expect(hasConsent(useOnboarding.getState().consent)).toBe(true);
    expect(mockNav.replace.mock.calls).toEqual([['/capture/import']]);
  });
});
