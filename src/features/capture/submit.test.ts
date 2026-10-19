import { submitDraft } from './submit';
import { newClip, useCapture } from './store';
import { useOnboarding } from '../onboarding/store';
import { usePurchases } from '../purchases/usePurchases';
import { useUsage } from '../paywall/usageStore';
import { startLift } from '../../data/pipeline';

jest.mock('expo-router', () => ({ __esModule: true, router: { push: jest.fn(), replace: jest.fn() } }));
const mockNav = jest.requireMock('expo-router').router as { push: jest.Mock; replace: jest.Mock };
jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/pipeline', () => ({ startLift: jest.fn() }));
jest.mock('../../lib/api', () => ({ ...jest.requireActual('../../lib/api'), getAllowance: jest.fn() }));
const mockAllowance = jest.requireMock('../../lib/api').getAllowance as jest.Mock;
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  useCapture.setState({ draft: null, lastWeight: '80' });
  useOnboarding.setState({ units: 'kg' });
  useUsage.getState().reset();
  mockAllowance.mockRejectedValue(new Error('offline'));
});

test('after a purchase the saved clip is uploaded, replacing the paywall', () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'library', movement: 'clean' }) });
  usePurchases.setState({ tier: 'pull', period: 'annual' });

  expect(submitDraft({ replace: true })).toBe(true);

  expect(startLift).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///clip.mov', movement: 'clean', loadKg: 80 }));
  expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
  expect(mockNav.push).not.toHaveBeenCalled();
});

test('a free lifter with no videos left still gets the paywall, not a loop', async () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera', movement: 'snatch' }) });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.setState({ usage: { lifetime: 3, month: '', thisMonth: 0 } });
  mockAllowance.mockResolvedValue({ plan: 'free', period: 'lifetime', cap: 3, used: 3, bonus: 0, remaining: 0 });

  expect(submitDraft({ replace: true })).toBe(true);
  await flush();
  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
});

test('a stale local count that says no videos left defers to the server', async () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera', movement: 'snatch' }) });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.setState({ usage: { lifetime: 3, month: '', thisMonth: 0 } });
  mockAllowance.mockResolvedValue({ plan: 'free', period: 'lifetime', cap: 3, used: 2, bonus: 0, remaining: 1 });

  expect(submitDraft({ replace: true })).toBe(true);
  await flush();

  expect(useUsage.getState().usage.lifetime).toBe(2);
  expect(startLift).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///clip.mov', movement: 'snatch' }));
  expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
});

test('offline, the local count still gates', async () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera', movement: 'snatch' }) });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.setState({ usage: { lifetime: 3, month: '', thisMonth: 0 } });

  submitDraft({ replace: true });
  await flush();

  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall' }));
});

test('no saved clip: nothing is submitted', () => {
  expect(submitDraft({ replace: true })).toBe(false);
  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).not.toHaveBeenCalled();
});

test('release build: a clip with no file goes back to capture, never to the fixture', async () => {
  (global as unknown as { __DEV__: boolean }).__DEV__ = false;
  try {
    useCapture.setState({ draft: newClip({ uri: null, durationS: 8, fps: 30, source: 'camera', movement: 'snatch' }) });
    usePurchases.setState({ tier: 'pull', period: 'annual' });

    expect(submitDraft({ replace: true })).toBe(true);
    await Promise.resolve();

    expect(startLift).not.toHaveBeenCalled();
    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(mockNav.replace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/analysis/processing' }));
  } finally {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
  }
});

describe('retest', () => {
  const retest = { cueId: 'c-stay-over', movement: 'snatch' as const };

  test('the cue under test goes up with the lift', () => {
    useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera', movement: 'snatch', retest }) });
    usePurchases.setState({ tier: 'pull', period: 'annual' });

    submitDraft();

    expect(startLift).toHaveBeenCalledWith(expect.objectContaining({ movement: 'snatch', retestCueId: 'c-stay-over' }));
  });

  test('a clip moved to another movement is no longer a retest', () => {
    useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera', movement: 'clean', retest }) });
    usePurchases.setState({ tier: 'pull', period: 'annual' });

    submitDraft();

    expect((startLift as jest.Mock).mock.calls[0][0].retestCueId).toBeUndefined();
  });

  test('dev build: the sample result still knows which cue it tested', () => {
    useCapture.setState({ draft: newClip({ uri: null, durationS: 8, fps: 30, source: 'camera', movement: 'snatch', retest }) });
    usePurchases.setState({ tier: 'pull', period: 'annual' });

    submitDraft();

    expect(mockNav.push).toHaveBeenCalledWith({
      pathname: '/analysis/processing',
      params: { fixture: 'snatch-mock', count: '1', retest: 'c-stay-over' },
    });
  });
});
