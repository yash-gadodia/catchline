import { Linking, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import PaywallSheet from './PaywallSheet';
import { artFrame } from './ui';
import { PRIVACY_URL, TERMS_URL } from '../../lib/links';

const WED = new Date(2026, 10, 11, 9, 0);
const SEATS = { total: 500, remaining: 137 };
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => jest.clearAllMocks());

const handlers = () => ({
  purchase: jest.fn(() => Promise.resolve('success' as const)),
  onNotNow: jest.fn(),
  onRestore: jest.fn(),
  onManage: jest.fn(),
  onDone: jest.fn(),
});

const renderPaywall = (h: ReturnType<typeof handlers>, extra: Partial<Parameters<typeof PaywallSheet>[0]> = {}) =>
  render(<PaywallSheet tier="free" freeLeft={0} seats={SEATS} platform="ios" now={WED} queued {...h} {...extra} />);

describe('PaywallSheet for a free lifter', () => {
  it('with this week’s videos used, says when they come back and offers Pro annual preselected', async () => {
    const { getByText, getByTestId } = await renderPaywall(handlers());
    expect(getByText("You've used this week's 3 free videos.")).toBeOnTheScreen();
    expect(getByText('They come back on Monday, 16 Nov. Catchline Pro has no limit.')).toBeOnTheScreen();
    expect(getByTestId('plan-pro')).toBeSelected();
    expect(getByTestId('period-annual')).toBeSelected();
    expect(getByTestId('plan-pro')).toHaveTextContent('Catchline ProUnlimited videos$19.99/yr');
    expect(getByText('Annual · save 44%')).toBeOnTheScreen();
    expect(getByText('Continue · $19.99 a year')).toBeOnTheScreen();
    expect(getByText('Charged today, renews yearly, cancel any time. Your video is saved and goes first.')).toBeOnTheScreen();
    expect(getByTestId('founding-seats')).toHaveTextContent('137 of 500 left');
  });

  it('with free videos in hand, sells unlimited videos and claims nothing is used up', async () => {
    const { getByText, queryByText } = await renderPaywall(handlers(), { freeLeft: 2, queued: false });
    expect(getByText('Unlimited videos.')).toBeOnTheScreen();
    expect(getByText('Free gives you 3 videos a week. Catchline Pro has no limit.')).toBeOnTheScreen();
    expect(queryByText(/used this week/)).toBeNull();
    expect(getByText('Charged today, renews yearly, cancel any time.')).toBeOnTheScreen();
  });

  it('offers one plan and the founding seat: no Hook, no Pull, no Platform, no cue pitch', async () => {
    const { queryByTestId, queryByText } = await renderPaywall(handlers());
    expect(queryByTestId('tier-hook')).toBeNull();
    expect(queryByTestId('tier-platform')).toBeNull();
    expect(queryByText(/Hook|Pull|Platform|cue|trial/i)).toBeNull();
  });

  it('shows the saving computed from the store prices', async () => {
    const { getByText } = await renderPaywall(handlers(), { savePct: 34 });
    expect(getByText('Annual · save 34%')).toBeOnTheScreen();
  });

  it('switches to monthly and to the founding seat with exact charge copy', async () => {
    const { getByText, getByTestId } = await renderPaywall(handlers());
    await press(getByTestId('period-monthly'));
    expect(getByText('Continue · $2.99 a month')).toBeOnTheScreen();
    expect(getByTestId('plan-pro')).toHaveTextContent('Catchline ProUnlimited videos$2.99/mo');
    await press(getByTestId('plan-founding'));
    expect(getByTestId('plan-founding')).toHaveTextContent('Founding member · Pro for life137 of 500 left$29.99 once');
    expect(getByText('Take a seat · $29.99')).toBeOnTheScreen();
    expect(getByText('Charged once today. No renewal, Pro for life. Your video is saved and goes first.')).toBeOnTheScreen();
  });

  it('hides the founding row when sold out or when the seats did not load', async () => {
    const soldOut = await renderPaywall(handlers(), { seats: { total: 500, remaining: 0 } });
    expect(soldOut.queryByTestId('plan-founding')).toBeNull();
    const unknown = await renderPaywall(handlers(), { seats: null });
    expect(unknown.queryByTestId('plan-founding')).toBeNull();
  });

  it('buys the founding seat', async () => {
    const h = handlers();
    const { getByTestId } = await renderPaywall(h);
    await press(getByTestId('plan-founding'));
    await press(getByTestId('continue'));
    expect(h.purchase).toHaveBeenCalledWith({ kind: 'founding' });
  });

  it('buys the selected period and, with a video saved, offers to track it', async () => {
    const h = handlers();
    const { getByTestId, getByText } = await renderPaywall(h);
    await press(getByTestId('period-monthly'));
    await press(getByTestId('continue'));
    expect(h.purchase).toHaveBeenCalledWith({ kind: 'pro', period: 'monthly' });
    expect(getByText('You have Catchline Pro.')).toBeOnTheScreen();
    expect(getByText('Unlimited videos. Renews 11 Dec 2026.')).toBeOnTheScreen();
    await press(getByText('Track my video'));
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('with no video saved, success just closes', async () => {
    const h = handlers();
    const { getByTestId, getByText, queryByText } = await renderPaywall(h, { queued: false });
    await press(getByTestId('continue'));
    expect(h.purchase).toHaveBeenCalledWith({ kind: 'pro', period: 'annual' });
    expect(queryByText('Track my video')).toBeNull();
    await press(getByText('Done'));
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('shows failed with retry, and offline', async () => {
    const h = handlers();
    h.purchase.mockResolvedValueOnce('failed' as never).mockResolvedValueOnce('offline' as never);
    const { getByTestId, getByText } = await renderPaywall(h);
    await press(getByTestId('continue'));
    expect(getByText("The App Store didn't go through")).toBeOnTheScreen();
    expect(getByText('Nothing was charged. Your video is still saved.')).toBeOnTheScreen();
    await press(getByText('Try again'));
    expect(h.purchase).toHaveBeenCalledTimes(2);
    expect(getByText("You're offline")).toBeOnTheScreen();
    expect(getByText("Buying needs a connection. Try again when you're back online.")).toBeOnTheScreen();
    await press(getByText('OK'));
    expect(h.onNotNow).toHaveBeenCalledTimes(1);
  });

  it('returns to the plan when the store sheet is cancelled', async () => {
    const h = handlers();
    h.purchase.mockResolvedValueOnce('cancelled' as never);
    const { getByTestId } = await renderPaywall(h);
    await press(getByTestId('continue'));
    expect(getByTestId('continue')).toBeOnTheScreen();
  });

  it('renders the purchasing state on Google Play', async () => {
    const { getByTestId, getByText } = await renderPaywall(handlers(), { platform: 'android', initialPhase: 'purchasing' });
    expect(getByTestId('state-purchasing')).toBeOnTheScreen();
    expect(getByText('Confirming with Google Play')).toBeOnTheScreen();
    expect(getByText('Catchline Pro · $19.99 a year')).toBeOnTheScreen();
  });

  it('Not now closes; Restore purchases restores', async () => {
    const h = handlers();
    const { getByText } = await renderPaywall(h);
    await press(getByText('Not now'));
    await press(getByText('Restore purchases'));
    expect(h.onNotNow).toHaveBeenCalledTimes(1);
    expect(h.onRestore).toHaveBeenCalledTimes(1);
  });

  it('uses store price strings when offerings loaded', async () => {
    const { getByText } = await renderPaywall(handlers(), { priceFor: (p) => (p.kind === 'pro' ? 'S$78.98' : '$1') });
    expect(getByText('Continue · S$78.98 a year')).toBeOnTheScreen();
  });

  it('links Terms and Privacy', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText } = await renderPaywall(handlers());
    await press(getByText('Terms of Use'));
    await press(getByText('Privacy Policy'));
    expect(open.mock.calls).toEqual([[TERMS_URL], [PRIVACY_URL]]);
  });
});

describe('PaywallSheet for someone who already owns a plan', () => {
  it.each(['hook', 'pull', 'platform'] as const)('%s is shown as Catchline Pro with nothing to buy', async (tier) => {
    const h = handlers();
    const { getByText, queryByTestId, queryByText } = await renderPaywall(h, { tier, freeLeft: 3 });
    expect(getByText('You have Catchline Pro.')).toBeOnTheScreen();
    expect(getByText('Unlimited videos.')).toBeOnTheScreen();
    expect(queryByTestId('continue')).toBeNull();
    expect(queryByTestId('plan-pro')).toBeNull();
    expect(queryByText(/Hook|Pull|Platform/)).toBeNull();
    await press(getByText('Manage subscription'));
    expect(h.onManage).toHaveBeenCalledTimes(1);
    await press(getByText('Done'));
    expect(h.onNotNow).toHaveBeenCalledTimes(1);
  });

  it('a founding member has no subscription to manage', async () => {
    const { getByText, queryByText, queryByTestId } = await renderPaywall(handlers(), { tier: 'founding' });
    expect(getByText('Founding member. Unlimited videos, for life.')).toBeOnTheScreen();
    expect(queryByText('Manage subscription')).toBeNull();
    expect(queryByTestId('continue')).toBeNull();
  });
});

describe('Backdrop art', () => {
  const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 402, height: 874 - y } } });

  it('fits the whole figure, centred, between the status bar and a tall sheet', () => {
    const f = artFrame({ width: 507, height: 720 }, { top: 62, bottom: 273 }, 402);
    expect(f.height).toBe(179);
    expect(f.width).toBeCloseTo(126.0458, 3);
    expect(f.left).toBeCloseTo(137.9771, 3);
    expect(f.top).toBe(78);
  });

  it('caps a wide pose by width and height above a short sheet', () => {
    const f = artFrame({ width: 792, height: 720 }, { top: 59, bottom: 600 }, 402);
    expect(f.width).toBeCloseTo(289.44, 3);
    expect(f.height).toBeCloseTo(263.1273, 3);
    expect(f.left).toBeCloseTo(56.28, 3);
    expect(f.top).toBeCloseTo(197.9364, 3);
  });

  it('shows the silhouette once the sheet top is known, clear of the sheet', async () => {
    const screen = await renderPaywall(handlers());
    expect(screen.queryByTestId('paywall-art')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId('paywall-sheet'), 'layout', layout(500));
    });
    const img = screen.getByTestId('paywall-art');
    expect(img).toHaveProp('source', require('../../../assets/art/paywall-catch.png'));
    expect(img).toHaveStyle({ opacity: 0.4 });
    const box = StyleSheet.flatten(img.props.style);
    expect(box.top + box.height).toBeLessThanOrEqual(500);
  });
});
