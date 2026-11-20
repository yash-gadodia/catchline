import { submitDraft } from './submit';
import { newClip, useCapture } from './store';
import { useOnboarding } from '../onboarding/store';
import { usePurchases } from '../purchases/usePurchases';
import { useUsage } from '../paywall/usageStore';
import { weekKey } from '../paywall/entitlements';
import { startLift } from '../../data/pipeline';
import * as SecureStore from 'expo-secure-store';
import { usePendingLifts } from '../../data/pendingLifts';

jest.mock('expo-router', () => ({ __esModule: true, router: { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() } }));
const mockNav = jest.requireMock('expo-router').router as { push: jest.Mock; replace: jest.Mock; dismissTo: jest.Mock };
jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/pipeline', () => ({ startLift: jest.fn() }));
jest.mock('../../data/devicePipeline', () => ({ deviceLiftInFlight: jest.fn(() => null) }));
const mockInFlight = jest.requireMock('../../data/devicePipeline').deviceLiftInFlight as jest.Mock;
jest.mock('../../lib/api', () => ({ ...jest.requireActual('../../lib/api'), getAllowance: jest.fn() }));
const mockAllowance = jest.requireMock('../../lib/api').getAllowance as jest.Mock;
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  useCapture.setState({ draft: null, lastWeight: '80' });
  useOnboarding.setState({ units: 'kg' });
  useUsage.getState().reset();
  (SecureStore as unknown as { __reset: () => void }).__reset();
  mockAllowance.mockRejectedValue(new Error('offline'));
  usePendingLifts.setState({ items: [] });
  mockInFlight.mockReturnValue(null);
});

// clip A is tracking: it is on disk as pending and the phone's run is busy with it
function trackingA() {
  const a = { liftId: 'lift-a', sub: { uri: 'file:///a.mov', movement: 'snatch' as const, loadKg: null, trim: { start: 0, end: 5 }, rep: 'all' as const, source: 'library' as const, fps: 30, overridden: [] }, at: '2026-11-20T08:00:00.000Z' };
  usePendingLifts.setState({ items: [a] });
  mockInFlight.mockReturnValue({ cancelled: false, done: new Promise(() => undefined) });
}

test('a second clip tracked while the first is still tracking waits behind it, and the lifter lands on Lifts (#252)', async () => {
  trackingA();
  usePurchases.setState({ tier: 'pull', period: 'annual' });
  useCapture.setState({ draft: newClip({ uri: 'file:///b.mov', durationS: 5, fps: 30, source: 'library' }) });

  submitDraft({ replace: true });
  await flush();

  expect(startLift).toHaveBeenCalledWith(expect.objectContaining({ uri: 'file:///b.mov' }));
  expect(mockNav.dismissTo).toHaveBeenCalledWith('/');
  expect(mockNav.replace).not.toHaveBeenCalled();
});

test('the same clip tracked again while it is still on its way is that lift, not a second one', async () => {
  trackingA();
  usePurchases.setState({ tier: 'pull', period: 'annual' });
  useCapture.setState({ draft: newClip({ uri: 'file:///a.mov', durationS: 5, fps: 30, source: 'library' }) });

  submitDraft({ replace: true });
  await flush();

  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
});

test('a free lifter whose one video this week is on the lift tracking meets the cap for a second clip, not a second free lift (#252)', async () => {
  trackingA();
  usePurchases.setState({ tier: 'free', period: null });
  useCapture.setState({ draft: newClip({ uri: 'file:///b.mov', durationS: 5, fps: 30, source: 'library' }) });

  submitDraft({ replace: true });
  await flush();

  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall/cap' }));
});

test('after a purchase the saved clip is tracked (always submitted as a snatch, whatever it shows), replacing the paywall', async () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'library' }) });
  usePurchases.setState({ tier: 'pull', period: 'annual' });

  expect(submitDraft({ replace: true })).toBe(true);
  await flush();

  expect(startLift).toHaveBeenCalledWith({ uri: 'file:///clip.mov', movement: 'snatch', loadKg: 80, trim: { start: 0, end: 8 }, rep: 'all', source: 'library', fps: 30, overridden: [], plateMark: null });
  expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
  expect(mockNav.push).not.toHaveBeenCalled();
});

test('a free lifter with no videos left this week still gets the paywall, not a loop', async () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera' }) });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.setState({ usage: { lifetime: 3, week: weekKey(new Date()), thisWeek: 3 } });
  mockAllowance.mockResolvedValue({ plan: 'free', period: 'lifetime', cap: 3, used: 3, bonus: 0, remaining: 0 });

  expect(submitDraft({ replace: true })).toBe(true);
  await flush();
  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall/cap' }));
});

test('the gate never waits on the server: a lower server count changes nothing (3.1: the phone decides)', async () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera' }) });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.setState({ usage: { lifetime: 3, week: weekKey(new Date()), thisWeek: 3 } });
  mockAllowance.mockResolvedValue({ plan: 'free', period: 'lifetime', cap: 3, used: 2, bonus: 0, remaining: 1 });

  expect(submitDraft({ replace: true })).toBe(true);
  await flush();

  expect(useUsage.getState().usage.lifetime).toBe(3);
  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall/cap' }));
});

test('a reinstall: this week’s Keychain count survives and gates the fourth lift', async () => {
  await SecureStore.setItemAsync('catchline.free_week', `${weekKey(new Date())}:3`);
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera' }) });
  usePurchases.setState({ tier: 'free', period: null });

  submitDraft({ replace: true });
  await flush();

  expect(useUsage.getState().usage.thisWeek).toBe(3);
  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall/cap' }));
});

test('offline, the local count still gates', async () => {
  useCapture.setState({ draft: newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera' }) });
  usePurchases.setState({ tier: 'free', period: null });
  useUsage.setState({ usage: { lifetime: 3, week: weekKey(new Date()), thisWeek: 3 } });

  submitDraft({ replace: true });
  await flush();

  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/paywall/cap' }));
});

test('no saved clip: nothing is submitted', () => {
  expect(submitDraft({ replace: true })).toBe(false);
  expect(startLift).not.toHaveBeenCalled();
  expect(mockNav.replace).not.toHaveBeenCalled();
});

test('release build: a clip with no file goes back to capture, never to the fixture', async () => {
  (global as unknown as { __DEV__: boolean }).__DEV__ = false;
  try {
    useCapture.setState({ draft: newClip({ uri: null, durationS: 8, fps: 30, source: 'camera' }) });
    usePurchases.setState({ tier: 'pull', period: 'annual' });

    expect(submitDraft({ replace: true })).toBe(true);
    await flush();

    expect(startLift).not.toHaveBeenCalled();
    expect(mockNav.replace).toHaveBeenCalledWith('/capture');
    expect(mockNav.replace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/analysis/processing' }));
  } finally {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
  }
});
