import { act, fireEvent, render } from '@testing-library/react-native';
import { ActionSheetIOS, Share } from 'react-native';
import * as Linking from 'expo-linking';
import { snatchMock, snatchMockLow } from '../../analysis/fixtures';
import { loadLibrary } from '../library/repository';
import PlayerRoute from '../../../app/analysis/player';
import CueRoute from '../../../app/analysis/cue';
import { openLiftActions, reportUrl } from './liftActions';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), dismissTo: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock('expo-linking', () => ({ __esModule: true, openURL: jest.fn(async () => true) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));

let pick = 0;
const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_, cb) => cb(pick));
const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
  mockParams.current = {};
});

describe('openLiftActions', () => {
  const on = { onShare: jest.fn(), onFilmAnother: jest.fn() };

  it('offers Share, Film another set and Report a wrong result, with no delete', () => {
    pick = 3;
    openLiftActions(snatchMock, on);
    expect(sheet.mock.calls[0][0]).toEqual({
      options: ['Share', 'Film another set', 'Report a wrong result', 'Cancel'],
      cancelButtonIndex: 3,
    });
    expect([on.onShare, on.onFilmAnother, Linking.openURL].map((f) => (f as jest.Mock).mock.calls.length)).toEqual([0, 0, 0]);
  });

  it('runs each item on its own handler', () => {
    pick = 0;
    openLiftActions(snatchMock, on);
    expect(on.onShare).toHaveBeenCalledTimes(1);
    pick = 1;
    openLiftActions(snatchMock, on);
    expect(on.onFilmAnother).toHaveBeenCalledTimes(1);
    pick = 2;
    openLiftActions(snatchMock, on);
    expect(Linking.openURL).toHaveBeenCalledWith(reportUrl(snatchMock));
  });

  it('the report mail names the lift, movement, cue and app version', () => {
    const url = reportUrl(snatchMock);
    expect(url.startsWith('mailto:pirsquare.yash+catchline@gmail.com?subject=Wrong%20result%20snatch-mock&body=')).toBe(true);
    expect(decodeURIComponent(url.split('&body=')[1])).toBe(
      `Lift: snatch-mock\nMovement: Snatch\nCue: ${snatchMock.cue!.text}\nApp version: 1.2.3\n\nWhat looks wrong:`
    );
  });
});

describe('the ··· button on the result screens', () => {
  it('player: opens the sheet; Share opens the share screen and Film another set goes to capture', async () => {
    mockParams.current = { fixture: 'snatch-mock' };
    const view = await render(<PlayerRoute />);
    pick = 0;
    await act(async () => {
      fireEvent.press(view.getByTestId('topbar-more'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/share', params: { fixture: 'snatch-mock' } });
    pick = 1;
    await act(async () => {
      fireEvent.press(view.getByTestId('topbar-more'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/capture');
    pick = 2;
    await act(async () => {
      fireEvent.press(view.getByTestId('topbar-more'));
    });
    expect(Linking.openURL).toHaveBeenCalledWith(reportUrl(snatchMock));
  });

  it('low-confidence cue: Film another set leaves the result for capture', async () => {
    mockParams.current = { fixture: 'snatch-mock-low' };
    const view = await render(<CueRoute />);
    pick = 1;
    await act(async () => {
      fireEvent.press(view.getByTestId('topbar-more'));
    });
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    expect(mockRouter.push).toHaveBeenCalledWith('/capture');
    pick = 2;
    await act(async () => {
      fireEvent.press(view.getByTestId('topbar-more'));
    });
    expect(Linking.openURL).toHaveBeenCalledWith(reportUrl(snatchMockLow));
  });
});
