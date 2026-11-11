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

describe('onboarding is three screens', () => {
  it('1. welcome records the consent the lifter accepts by continuing, then shows how to film', async () => {
    const view = await render(<WelcomeRoute />);
    expect(hasConsent(useOnboarding.getState().consent)).toBe(false);
    await press(view.getByText('Get started'));
    expect(hasConsent(useOnboarding.getState().consent)).toBe(true);
    expect(mockNav.push.mock.calls).toEqual([['/onboarding/guide']]);
    expect(useOnboarding.getState().completed).toBe(false);
  });

  it('2. how to film goes on to adding a video', async () => {
    const view = await render(<GuideRoute />);
    await press(view.getByText('Next'));
    expect(mockNav.push.mock.calls).toEqual([['/onboarding/camera']]);
  });

  it('3. choosing a video finishes onboarding and opens the picker, with no camera prompt', async () => {
    const view = await render(<AddVideoRoute />);
    await press(view.getByText('Choose a video'));
    expect(mockCamera.request).not.toHaveBeenCalled();
    expect(useOnboarding.getState().completed).toBe(true);
    expect(mockNav.replace.mock.calls).toEqual([['/capture/import']]);
  });

  it('3. filming asks for the camera, then finishes onboarding in the viewfinder', async () => {
    mockCamera.request.mockResolvedValue('granted');
    const view = await render(<AddVideoRoute />);
    await press(view.getByText('Film a lift'));
    expect(mockCamera.request).toHaveBeenCalledTimes(1);
    expect(useOnboarding.getState().completed).toBe(true);
    expect(mockNav.replace.mock.calls).toEqual([['/capture']]);
  });

  it('3. a refused camera stays on the step, with Settings and the picker still offered', async () => {
    mockCamera.request.mockResolvedValue('denied');
    const view = await render(<AddVideoRoute />);
    await press(view.getByText('Film a lift'));
    expect(mockNav.replace).not.toHaveBeenCalled();
    expect(useOnboarding.getState().completed).toBe(false);
    expect(view.getByTestId('camera-denied')).toBeOnTheScreen();
    await press(view.getByText('Open Settings'));
    expect(mockCamera.openSettings).toHaveBeenCalledTimes(1);
    await press(view.getByText('Choose a video'));
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
