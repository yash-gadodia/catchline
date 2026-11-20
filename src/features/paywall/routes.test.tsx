import { act, fireEvent, render } from '@testing-library/react-native';
import { newClip, useCapture } from '../capture/store';
import { useOnboarding } from '../onboarding/store';
import { presentCustomerCenter, usePurchases } from '../purchases/usePurchases';
import { weekKey } from './entitlements';
import { useUsage } from './usageStore';
import { usePipeline } from '../../data/pipeline';
import { usePendingLifts } from '../../data/pendingLifts';
import { deviceLiftInFlight } from '../../data/devicePipeline';
import PaywallRoute from '../../../app/paywall/index';
import CapRoute from '../../../app/paywall/cap';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return { __esModule: true, router: r, useRouter: () => r, useLocalSearchParams: () => params.current };
});
const mockNav = jest.requireMock('expo-router').router as { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
jest.mock('../../data/backend', () => ({ backendEnabled: () => false }));
jest.mock('../../data/onDeviceAnalysis', () => ({ onDeviceAnalysisEnabled: () => true }));
jest.mock('./seats', () => ({
  ...jest.requireActual('./seats'),
  getFoundingSeats: jest.fn(async () => ({ total: 500, remaining: 137 })),
}));
jest.mock('../purchases/usePurchases', () => ({
  ...jest.requireActual('../purchases/usePurchases'),
  presentCustomerCenter: jest.fn(async () => true),
}));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const draft = () => newClip({ uri: 'file:///clip.mov', durationS: 8, fps: 30, source: 'camera' });
const usedUp = () => useUsage.setState({ usage: { lifetime: 3, week: weekKey(new Date()), thisWeek: 3 } });

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  useCapture.setState({ draft: null, lastWeight: '' });
  useOnboarding.setState({ units: 'kg' });
  usePurchases.setState({ tier: 'free', period: null, demo: true, demoOutcome: 'success' });
  useUsage.getState().reset();
  usePendingLifts.setState({ items: [] });
  usePipeline.getState().clear();
});

describe('/paywall/cap: the weekly free videos are used and a clip is saved', () => {
  beforeEach(() => {
    usedUp();
    useCapture.setState({ draft: draft() });
    params.current = { clip: 'clip-1', movement: 'snatch' };
    // Track at the cap saved the clip (submitClip, #247)
    usePendingLifts.setState({ items: [{ liftId: 'held-1', at: '2026-11-20T08:00:00.000Z', held: true, sub: { uri: 'file:///clip.mov', movement: 'snatch', loadKg: null, trim: { start: 0, end: 8 }, rep: 'all', source: 'camera', fps: 30, overridden: [] } }] });
  });

  it('is the paywall leading with the cap', async () => {
    const view = await render(<CapRoute />);
    expect(view.getByText("You've used this week's free video.")).toBeOnTheScreen();
    expect(view.getByText(/^They come back on Monday, /)).toBeOnTheScreen();
    expect(view.getByTestId('plan-pro')).toBeSelected();
  });

  it('Not now closes and keeps the clip', async () => {
    const view = await render(<CapRoute />);
    await press(view.getByText('Not now'));
    expect(mockNav.back).toHaveBeenCalledTimes(1);
    expect(usePipeline.getState().job).toBeNull();
    expect(usePendingLifts.getState().items.map((i) => [i.liftId, i.held])).toEqual([['held-1', true]]);
  });

  it('buying Pro tracks the saved clip straight away', async () => {
    const view = await render(<CapRoute />);
    await press(view.getByTestId('continue'));
    expect(usePurchases.getState().tier).toBe('pull');
    await press(view.getByText('Track my video'));
    expect(usePipeline.getState().job).toMatchObject({ liftId: 'held-1', uri: 'file:///clip.mov' });
    expect(mockNav.replace).toHaveBeenCalledWith({ pathname: '/analysis/processing', params: { live: '1' } });
    await act(async () => {
      await deviceLiftInFlight()?.done;
    });
    expect(usePendingLifts.getState().items).toEqual([]);
  });
});

describe('/paywall from the Plan row', () => {
  it('with free videos left, does not claim they are used', async () => {
    const view = await render(<PaywallRoute />);
    expect(view.getByText('Unlimited videos.')).toBeOnTheScreen();
    expect(view.queryByText(/used this week/)).toBeNull();
  });

  it('buying with no clip saved just closes', async () => {
    const view = await render(<PaywallRoute />);
    await press(view.getByTestId('continue'));
    await press(view.getByText('Done'));
    expect(usePipeline.getState().job).toBeNull();
    expect(mockNav.back).toHaveBeenCalledTimes(1);
  });

  it.each(['hook', 'pull', 'platform', 'founding'] as const)('an owner of %s sees Catchline Pro, even with the week used up', async (tier) => {
    usedUp();
    usePurchases.setState({ tier });
    const view = await render(<PaywallRoute />);
    expect(view.getByText('You have Catchline Pro.')).toBeOnTheScreen();
    expect(view.queryByTestId('continue')).toBeNull();
    expect(view.queryByText(/used this week/)).toBeNull();
  });

  it('Manage subscription opens the store’s customer centre', async () => {
    usePurchases.setState({ tier: 'pull', period: 'annual' });
    const view = await render(<PaywallRoute />);
    await press(view.getByText('Manage subscription'));
    expect(presentCustomerCenter).toHaveBeenCalledTimes(1);
  });
});
