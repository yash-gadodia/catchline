import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import NotifyRoute from '../../../app/onboarding/notify';
import { usePushAsk } from '../notifications/ask';
import { useOnboarding } from './store';
import NotifyScreen from './NotifyScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));
jest.mock('../capture/camera', () => ({ useCameraPermission: () => ({ status: 'granted' }) }));
jest.mock('../../data/backend', () => ({ backendEnabled: () => false }));

const perms = Notifications.getPermissionsAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  usePushAsk.setState({ onboarded: false, reasked: false });
  useOnboarding.setState({ consent: { version: 1, acceptedAt: '2026-10-23T00:00:00.000Z', improveAccuracy: false }, completed: false });
});

describe('onboarding notifications step', () => {
  it('says what notifications are for and offers Not now', async () => {
    const view = await render(<NotifyScreen denied={false} onAllow={jest.fn()} onSkip={jest.fn()} />);
    expect(view.getByText('Turn on notifications.')).toBeOnTheScreen();
    expect(view.getByTestId('notify-allow')).toHaveTextContent('Turn on notifications');
    expect(view.getByTestId('notify-skip')).toHaveTextContent('Not now');
  });

  it('turns into a Settings link once iOS will not prompt again', async () => {
    const view = await render(<NotifyScreen denied onAllow={jest.fn()} onSkip={jest.fn()} />);
    expect(view.getByTestId('notify-allow')).toHaveTextContent('Open Settings');
  });

  it('shows the system prompt on Turn on, then moves on to filming', async () => {
    perms.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    const view = await render(<NotifyRoute />);
    await act(async () => fireEvent.press(view.getByTestId('notify-allow')));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(usePushAsk.getState().onboarded).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/capture');
  });

  it('skips itself when notifications are already on', async () => {
    perms.mockResolvedValue({ status: 'granted', canAskAgain: true });
    await render(<NotifyRoute />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/capture'));
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
