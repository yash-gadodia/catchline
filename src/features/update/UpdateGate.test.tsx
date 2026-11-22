import { Linking } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import UpdateGate from './UpdateGate';
import { useAppUpdate } from './appUpdate';
import { track } from '../../lib/analytics';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '4.0.7' }));
jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));

const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

beforeEach(() => {
  jest.clearAllMocks();
  useAppUpdate.setState({ need: 'none', dismissedOn: null });
});

describe('UpdateGate', () => {
  it('shows nothing when the version is supported', async () => {
    const { toJSON } = await render(<UpdateGate />);
    expect(toJSON()).toBeNull();
  });

  it('below the minimum: a full screen with only the App Store button', async () => {
    useAppUpdate.setState({ need: 'required' });
    const { getByTestId, getByText, queryByTestId } = await render(<UpdateGate />);
    expect(getByTestId('update-required')).toBeOnTheScreen();
    expect(getByText('Update Catchline')).toBeOnTheScreen();
    expect(queryByTestId('update-later')).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId('update-store'));
    });
    expect(openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id6785406082');
    expect(track).toHaveBeenCalledWith('update_store_opened', { need: 'required' });
    expect(getByTestId('update-required')).toBeOnTheScreen();
  });

  it('below the recommended version: a sheet that "Not now" closes for the day', async () => {
    useAppUpdate.setState({ need: 'recommended' });
    const { getByTestId, queryByTestId } = await render(<UpdateGate />);
    expect(getByTestId('update-recommended')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(getByTestId('update-later'));
    });
    expect(queryByTestId('update-recommended')).toBeNull();
    expect(useAppUpdate.getState().dismissedOn).toBe(new Date().toISOString().slice(0, 10));
  });

  it('the recommended sheet opens the App Store too', async () => {
    useAppUpdate.setState({ need: 'recommended' });
    const { getByTestId } = await render(<UpdateGate />);
    await act(async () => {
      fireEvent.press(getByTestId('update-soon-store'));
    });
    expect(openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id6785406082');
    expect(track).toHaveBeenCalledWith('update_store_opened', { need: 'recommended' });
  });
});
