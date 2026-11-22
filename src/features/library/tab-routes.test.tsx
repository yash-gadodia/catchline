import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState } from 'react-native';
import TabsLayout from '../../../app/(tabs)/_layout';
import LiftsRoute from '../../../app/(tabs)/index';
import { useOnboarding } from '../onboarding/store';
import { useUsage } from '../paywall/usageStore';
import { weekKey } from '../paywall/entitlements';
import { loadLibrary } from './repository';

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => {
  const { View } = require('react-native');
  const Tabs = ({ tabBar }: { tabBar: (p: unknown) => unknown }) =>
    tabBar({ state: { index: 0, routes: [{ name: 'index' }] }, navigation: { navigate: jest.fn() } });
  Tabs.Screen = () => null;
  // a focused screen: the callback runs as the screen mounts (expo-router runs it on every focus)
  const { useEffect } = require('react');
  return { __esModule: true, useRouter: () => mockNav, Tabs, Redirect: View, useFocusEffect: (cb: () => () => void) => useEffect(cb, [cb]) };
});
jest.mock('../../data/library', () => ({ ...jest.requireActual('../../data/library'), syncLibrary: jest.fn(async () => undefined) }));
const mockSync = jest.requireMock('../../data/library').syncLibrary as jest.Mock;

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

  it('with a free video left this week the picker opens directly: no heads-up screen', async () => {
    useUsage.setState({ usage: { lifetime: 3, week: weekKey(new Date()), thisWeek: 0 } });
    const view = await render(<TabsLayout />);
    await press(view.getByTestId('tab-import'));
    expect(mockNav.push.mock.calls).toEqual([['/capture/import']]);
  });

  it('with no free video left the paywall opens before the picker, not after the trim and the plate check', async () => {
    useUsage.setState({ usage: { lifetime: 3, week: weekKey(new Date()), thisWeek: 1 } }); // past the 3 starter videos
    const view = await render(<TabsLayout />);
    await press(view.getByTestId('tab-import'));
    expect(mockNav.push.mock.calls).toEqual([['/paywall']]);
  });

  it('the empty Lifts tab imports first and records second', async () => {
    loadLibrary('empty');
    const view = await render(<LiftsRoute />);
    await press(view.getByTestId('empty-import'));
    await press(view.getByTestId('empty-record'));
    expect(mockNav.push.mock.calls).toEqual([['/capture/import'], ['/capture']]);
    expect(view.queryByTestId('empty-demo')).toBeNull();
  });

  it('a finished lift opens on the player, a failed one on its failure, a queued one on the paywall', async () => {
    loadLibrary('seeded');
    const view = await render(<LiftsRoute />);
    await press(view.getByTestId('lift-l-snatch-today'));
    await press(view.getByTestId('lift-l-jerk'));
    await press(view.getByTestId('lift-l-snatch-queued'));
    expect(mockNav.push.mock.calls).toEqual([
      [{ pathname: '/analysis/player', params: { fixture: 'snatch-mock' } }],
      [{ pathname: '/failure/[id]', params: { id: 'l-jerk' } }],
      ['/paywall'],
    ]);
  });

  it('has two tabs: Lifts and You', async () => {
    const view = await render(<TabsLayout />);
    expect(view.getAllByRole('tab').map((t) => t.props.testID)).toEqual(['tab-index', 'tab-me']);
  });
});

describe('the Lifts tab follows the server (#206)', () => {
  it('lists again each time the tab is looked at and each time the app comes back to the front', async () => {
    const listeners: ((s: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
      listeners.push(fn as (s: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    await render(<LiftsRoute />);
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => {
      listeners.forEach((l) => l('background'));
    });
    expect(mockSync).toHaveBeenCalledTimes(1);
    await act(async () => {
      listeners.forEach((l) => l('active'));
    });
    expect(mockSync).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
