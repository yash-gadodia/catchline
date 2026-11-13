import { render } from '@testing-library/react-native';
import PlayerRoute from '../../../app/analysis/player';
import ShareRoute from '../../../app/share';
import { track } from '../../lib/analytics';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), dismissTo: jest.fn() };
  return {
    __esModule: true,
    router: r,
    useRouter: () => r,
    useNavigation: () => ({ setOptions: () => {}, getParent: () => undefined }),
    useLocalSearchParams: () => params.current,
  };
});
jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));

beforeEach(() => jest.mocked(track).mockClear());

describe('what opening a lift reports', () => {
  it('player_opened once, for a lift shown on its stills', async () => {
    params.current = { fixture: 'snatch-mock' };
    const { rerender } = await render(<PlayerRoute />);
    await rerender(<PlayerRoute />);
    expect(jest.mocked(track).mock.calls).toEqual([['player_opened', { kind: 'stills', has_bar_path: true }]]);
  });

  it('share_opened once, from the player unless the link names another known place', async () => {
    params.current = { fixture: 'snatch-mock' };
    const first = await render(<ShareRoute />);
    await first.rerender(<ShareRoute />);
    expect(jest.mocked(track).mock.calls).toEqual([['share_opened', { from: 'player' }]]);
    await first.unmount();
    jest.mocked(track).mockClear();
    params.current = { fixture: 'snatch-mock', from: 'reveal' };
    await (await render(<ShareRoute />)).unmount();
    params.current = { fixture: 'snatch-mock', from: 'someone@example.com' };
    await render(<ShareRoute />);
    expect(jest.mocked(track).mock.calls).toEqual([['share_opened', { from: 'reveal' }], ['share_opened', { from: 'player' }]]);
  });
});
