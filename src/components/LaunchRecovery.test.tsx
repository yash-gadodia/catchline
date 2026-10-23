import { act, fireEvent, render } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { useLaunch } from '../lib/launch';
import { LaunchRecovery } from './LaunchRecovery';

jest.mock('expo-updates', () => ({ reloadAsync: jest.fn(() => Promise.resolve()) }));

beforeEach(() => useLaunch.setState({ ready: false, stalled: false }));

describe('LaunchRecovery', () => {
  it('shows nothing while the launch is on time', async () => {
    const { queryByTestId } = await render(<LaunchRecovery />);
    expect(queryByTestId('launch-recovery')).toBeNull();
  });

  it('offers a retry that reloads the app once the launch stalls', async () => {
    const { getByText, getByTestId } = await render(<LaunchRecovery />);
    await act(async () => useLaunch.setState({ stalled: true }));
    expect(getByText('Catchline is taking too long to open')).toBeTruthy();
    await act(async () => fireEvent.press(getByTestId('launch-retry')));
    expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
  });
});
