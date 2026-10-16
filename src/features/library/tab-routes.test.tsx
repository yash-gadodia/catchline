import { act, fireEvent, render } from '@testing-library/react-native';
import TabsLayout from '../../../app/(tabs)/_layout';
import LiftsRoute from '../../../app/(tabs)/index';
import { useOnboarding } from '../onboarding/store';
import { useUsage } from '../paywall/usageStore';
import { loadLibrary } from './repository';

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => {
  const { View } = require('react-native');
  const Tabs = ({ tabBar }: { tabBar: (p: unknown) => unknown }) =>
    tabBar({ state: { index: 0, routes: [{ name: 'index' }] }, navigation: { navigate: jest.fn() } });
  Tabs.Screen = () => null;
  return { __esModule: true, useRouter: () => mockNav, Tabs, Redirect: View };
});

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  useUsage.getState().reset();
  useOnboarding.setState({ completed: true });
});

describe('import-first routing', () => {
  it('the tab bar centre button opens the picker directly', async () => {
    const view = await render(<TabsLayout />);
    await press(view.getByTestId('tab-import'));
    expect(mockNav.push).toHaveBeenCalledWith('/capture/import');
  });

  it('keeps the last-free-video heads-up in front of the picker', async () => {
    useUsage.setState({ usage: { lifetime: 2, month: '', thisMonth: 0 } });
    const view = await render(<TabsLayout />);
    await press(view.getByTestId('tab-import'));
    expect(mockNav.push).toHaveBeenCalledWith('/paywall/last?next=%2Fcapture%2Fimport');
  });

  it('the empty Lifts tab imports first, records second and replays the demo', async () => {
    loadLibrary('empty');
    const view = await render(<LiftsRoute />);
    await press(view.getByTestId('empty-import'));
    await press(view.getByTestId('empty-record'));
    await press(view.getByTestId('empty-demo'));
    expect(mockNav.push.mock.calls).toEqual([['/capture/import'], ['/capture'], ['/onboarding/demo?from=app']]);
  });
});
