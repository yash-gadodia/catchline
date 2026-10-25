import { act, fireEvent, render } from '@testing-library/react-native';
import { ActionSheetIOS, Share } from 'react-native';
import { snatchMock, snatchMockLow } from '../../analysis/fixtures';
import { loadLibrary } from '../library/repository';
import PlayerRoute from '../../../app/analysis/player';
import CueRoute from '../../../app/analysis/cue';
import { analysisSummary, openLiftActions, reportContext, reportHref } from './liftActions';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), dismissTo: jest.fn() };
const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => mockRouter,
  useNavigation: () => ({ setOptions: () => {}, getParent: () => undefined }),
  useLocalSearchParams: () => mockParams.current,
}));

let pick = 0;
const sheet = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_, cb) => cb(pick));
const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
  mockParams.current = {};
});

describe('openLiftActions', () => {
  const on = { onShare: jest.fn(), onFilmAnother: jest.fn(), onReport: jest.fn() };

  it('offers Share, Film another set and Report a wrong result, with no delete', () => {
    pick = 3;
    openLiftActions(snatchMock, on);
    expect(sheet.mock.calls[0][0]).toEqual({
      options: ['Share', 'Film another set', 'Report a wrong result', 'Cancel'],
      cancelButtonIndex: 3,
    });
    expect([on.onShare, on.onFilmAnother, on.onReport].map((f) => (f as jest.Mock).mock.calls.length)).toEqual([0, 0, 0]);
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
    expect(on.onReport).toHaveBeenCalledTimes(1);
  });

  it('the report names the lift, movement and cue', () => {
    expect(reportContext(snatchMock)).toBe(`Snatch · cue: ${snatchMock.cue!.text}`);
    expect(reportHref(snatchMock)).toEqual({ pathname: '/report', params: { lift: 'snatch-mock', context: reportContext(snatchMock) } });
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
    expect(mockRouter.push).toHaveBeenCalledWith(reportHref(snatchMock));
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
    expect(mockRouter.push).toHaveBeenCalledWith(reportHref(snatchMockLow));
  });
});

describe('analysisSummary', () => {
  it('is the compact numbers of a lift, never frames, stills, pose or the bar path', () => {
    const { snatchMockPartial } = jest.requireActual('../../analysis/fixtures') as typeof import('../../analysis/fixtures');
    const json = analysisSummary(snatchMockPartial);
    expect(JSON.parse(json)).toEqual({
      movement: 'snatch',
      phases: ['setup 0.5s', 'first_pull 0.42s', 'transition 0.22s', 'second_pull 0.18s', 'turnover 0.22s', 'catch 0.33s', 'recovery 0.8s'],
      made: true,
      angle: '34deg',
      confidence: null,
      detected: null,
      cue: null,
      noCue: 'off_side_on',
      error: null,
      measured: {
        hips_rise_early: '0.12s',
        bar_drift_hip: 'not seen',
        early_arm_bend: 'not seen',
        jump_forward: 'not seen',
        catch_depth: '4cm',
        turnover_time: '0.21s',
        pull_time: '0.59s',
        bar_speed: '1.82m/s',
      },
      version: null,
    });
    expect(json).not.toMatch(/asset:|file:|uri|path|keyFrames|"x"/);
    expect(json.length).toBe(479);
  });

  it('carries the failure code of a failed lift', () => {
    const failed = { ...snatchMock, reps: [], measurements: [], failure: { reason: 'clip_cut_off' as const, message: 'm', code: 'no_reps' } };
    expect(JSON.parse(analysisSummary(failed))).toMatchObject({ phases: [], made: null, error: 'no_reps', measured: {} });
  });
});

