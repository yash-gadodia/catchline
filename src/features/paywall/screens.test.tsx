import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import CapSheet from './CapSheet';
import LastFreeSheet from './LastFreeSheet';
import FoundingSheet from './FoundingSheet';
import PaywallSheet from './PaywallSheet';
import PlansScreen from './PlansScreen';
import QuizScreen from './QuizScreen';
import TrialPaywall from './TrialPaywall';
import type { ProofCue } from './proofCues';
import { ART, FreeVideosChip, artFrame } from './ui';

const NOW = new Date(2026, 9, 11);
const CUES: ProofCue[] = [
  { text: 'Finish the pull before you drop', status: 'stuck' },
  { text: 'Stay over the bar longer', status: 'trying', tries: 3, of: 6 },
  { text: 'Hips to the bar on the MU', status: 'trying', tries: 1, of: 6 },
];
const SEATS = { total: 500, remaining: 137 };
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => jest.clearAllMocks());

describe('FreeVideosChip', () => {
  it('renders the last free video in flare and nothing when hidden', async () => {
    const { getByText, getByTestId, rerender, toJSON } = await render(
      <FreeVideosChip state={{ label: 'Last free video', tone: 'last' }} />
    );
    expect(getByText('Last free video')).toBeOnTheScreen();
    expect(getByTestId('free-chip-last')).toHaveStyle({ borderColor: '#FF1F3D' });
    await rerender(<FreeVideosChip state={null} />);
    expect(toJSON()).toBeNull();
  });

  it('is pressable when used up', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      <FreeVideosChip state={{ label: 'Free videos used · Unlock', tone: 'used' }} onPress={onPress} />
    );
    await press(getByText('Free videos used · Unlock'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('PaywallSheet', () => {
  const handlers = () => ({
    purchase: jest.fn(() => Promise.resolve('success' as const)),
    onNotNow: jest.fn(),
    onRestore: jest.fn(),
    onWatch: jest.fn(),
  });

  const renderPaywall = (h: ReturnType<typeof handlers>, extra: Partial<Parameters<typeof PaywallSheet>[0]> = {}) =>
    render(
      <PaywallSheet
        cues={CUES}
        freeLeft={0}
        seats={SEATS}
        platform="ios"
        now={NOW}
        queuedMovement="snatch"
        {...h}
        {...extra}
      />
    );

  it('uses the lifter’s own cues as proof with Pull annual preselected', async () => {
    const { getByText, getByTestId, getAllByTestId} = await renderPaywall(handlers());
    expect(getByText('Your 3 free videos are done. Keep the cues coming.')).toBeOnTheScreen();
    expect(getByText('Stay over the bar longer')).toBeOnTheScreen();
    expect(getByText('Trying · 3 of 6')).toBeOnTheScreen();
    expect(getAllByTestId('dot-trying')).toHaveLength(2);
    expect(getAllByTestId('dot-stuck')).toHaveLength(1);
    expect(getByTestId('tier-pull')).toBeSelected();
    expect(getByTestId('period-annual')).toBeSelected();
    expect(getByText('Continue · $59.99 a year')).toBeOnTheScreen();
    expect(
      getByText('Charged today, renews yearly, cancel any time. This lift is saved and goes first.')
    ).toBeOnTheScreen();
    expect(getByText('Annual · save 50%')).toBeOnTheScreen();
    expect(getByTestId('tier-pull')).toHaveTextContent('Pull40 videos a month · ghost of best · did it stick · no watermark$59.99/yr');
    expect(getByTestId('founding-seats')).toHaveTextContent('137 of 500 left');
  });

  it('offers one plan, Pull, and the founding seat: no Hook, no Platform', async () => {
    const { queryByTestId, queryByText } = await renderPaywall(handlers());
    expect(queryByTestId('tier-hook')).toBeNull();
    expect(queryByTestId('tier-platform')).toBeNull();
    expect(queryByText(/Hook|Platform/)).toBeNull();
  });

  it('shows the saving computed from the store prices', async () => {
    const { getByText } = await renderPaywall(handlers(), { savePct: 34 });
    expect(getByText('Annual · save 34%')).toBeOnTheScreen();
  });

  it('switches to monthly and to the founding seat with exact charge copy', async () => {
    const { getByText, getByTestId } = await renderPaywall(handlers());
    await press(getByTestId('period-monthly'));
    expect(getByText('Continue · $9.99 a month')).toBeOnTheScreen();
    expect(getByTestId('tier-pull')).toHaveTextContent('Pull40 videos a month · ghost of best · did it stick · no watermark$9.99/mo');
    await press(getByTestId('tier-founding'));
    expect(getByText('Take a seat · $49.99')).toBeOnTheScreen();
    expect(
      getByText('Charged once today. No renewal, Pull for life. This lift is saved and goes first.')
    ).toBeOnTheScreen();
  });

  it('hides the founding row when sold out', async () => {
    const { queryByTestId } = await renderPaywall(handlers(), { seats: { total: 500, remaining: 0 } });
    expect(queryByTestId('tier-founding')).toBeNull();
  });

  it('buys the founding seat', async () => {
    const h = handlers();
    const { getByTestId } = await renderPaywall(h);
    await press(getByTestId('tier-founding'));
    await press(getByTestId('continue'));
    expect(h.purchase).toHaveBeenCalledWith({ kind: 'founding' });
  });

  it('buys the selected plan and shows success', async () => {
    const h = handlers();
    const { getByTestId, getByText } = await renderPaywall(h);
    await press(getByTestId('period-monthly'));
    await press(getByTestId('continue'));
    expect(h.purchase).toHaveBeenCalledWith({ kind: 'sub', tier: 'pull', period: 'monthly' });
    expect(getByText('Unlocked. Analysing your lift.')).toBeOnTheScreen();
    expect(getByText('Pull, renews 11 Nov 2026. Your queued snatch is first in line.')).toBeOnTheScreen();
    await press(getByText('Watch it'));
    expect(h.onWatch).toHaveBeenCalledTimes(1);
  });

  it('shows failed with retry, and offline', async () => {
    const h = handlers();
    h.purchase.mockResolvedValueOnce('failed' as never).mockResolvedValueOnce('offline' as never);
    const { getByTestId, getByText } = await renderPaywall(h);
    await press(getByTestId('continue'));
    expect(getByText("The App Store didn't go through")).toBeOnTheScreen();
    expect(getByText('Nothing was charged. Your lift is still queued.')).toBeOnTheScreen();
    await press(getByText('Try again'));
    expect(h.purchase).toHaveBeenCalledTimes(2);
    expect(getByText("You're offline")).toBeOnTheScreen();
    await press(getByText('OK'));
    expect(h.onNotNow).toHaveBeenCalledTimes(1);
  });

  it('returns to the plans when the store sheet is cancelled', async () => {
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
    expect(getByText('Pull · $59.99 a year')).toBeOnTheScreen();
  });

  it('Not now keeps the clip queued; Restore restores', async () => {
    const h = handlers();
    const { getByText } = await renderPaywall(h);
    await press(getByText('Not now, keep it queued'));
    await press(getByText('Restore'));
    expect(h.onNotNow).toHaveBeenCalledTimes(1);
    expect(h.onRestore).toHaveBeenCalledTimes(1);
  });

  it('uses store price strings when offerings loaded', async () => {
    const { getByText } = await renderPaywall(handlers(), {
      priceFor: (p) => (p.kind === 'sub' && p.tier === 'pull' ? 'S$78.98' : '$1'),
    });
    expect(getByText('Continue · S$78.98 a year')).toBeOnTheScreen();
  });
});

describe('PlansScreen', () => {
  it('marks the current plan and its renewal', async () => {
    const onChangePlan = jest.fn();
    const { getByTestId, getByText, queryByText } = await render(
      <PlansScreen current="pull" renews={new Date(2027, 9, 11)} onBack={jest.fn()} onChangePlan={onChangePlan} />
    );
    expect(getByTestId('col-current-pull')).toHaveStyle({ backgroundColor: '#1F1F1F' });
    expect(getByTestId('current-plan')).toHaveTextContent('Current plan: Pullrenews 11 Oct 2027');
    expect(getByText('$59.99/yr')).toBeOnTheScreen();
    expect(getByText('once')).toBeOnTheScreen();
    expect(getByText('Free')).toBeOnTheScreen();
    expect(getByText('Founding')).toBeOnTheScreen();
    expect(queryByText(/Hook|Platf|Coach link|CSV|Explainer/)).toBeNull();
    await press(getByText('Change plan'));
    expect(onChangePlan).toHaveBeenCalledTimes(1);
  });

  it('a founding member has no renewal date', async () => {
    const { getByTestId } = await render(
      <PlansScreen current="founding" renews={null} onBack={jest.fn()} onChangePlan={jest.fn()} />
    );
    expect(getByTestId('current-plan')).toHaveTextContent('Current plan: Pull · Founding memberfor life');
  });
});

describe('FoundingSheet', () => {
  const props = () => ({
    platform: 'ios' as const,
    now: NOW,
    purchase: jest.fn(() => Promise.resolve('success' as const)),
    onYearly: jest.fn(),
    onSeePlans: jest.fn(),
    onDone: jest.fn(),
  });

  it('shows the live counter with no timer', async () => {
    const p = props();
    const { getByTestId, getByText, queryByText } = await render(<FoundingSheet seats={SEATS} {...p} />);
    expect(getByText('Pull, for life, for $49.99 once.')).toBeOnTheScreen();
    expect(getByTestId('seats-remaining')).toHaveTextContent('137');
    expect(getByText('of 500 seats left. Seats are the only limit.')).toBeOnTheScreen();
    expect(getByTestId('seats-bar-open')).toHaveStyle({ width: '27.4%', backgroundColor: '#EDE9E1' });
    expect(queryByText(/days|hours|ends/i)).toBeNull();
    await press(getByText("I'll pay yearly instead"));
    expect(p.onYearly).toHaveBeenCalledTimes(1);
  });

  it('under 10% the bar goes flare and the copy stays flat', async () => {
    const { getByTestId, getByText } = await render(<FoundingSheet seats={{ total: 500, remaining: 41 }} {...props()} />);
    expect(getByText('of 500 left. Under 10%.')).toBeOnTheScreen();
    expect(getByTestId('seats-bar-low')).toHaveStyle({ backgroundColor: '#FF1F3D' });
  });

  it('sold out points to plans', async () => {
    const p = props();
    const { getByText } = await render(<FoundingSheet seats={{ total: 500, remaining: 0 }} {...p} />);
    expect(getByText('All 500 seats are taken.')).toBeOnTheScreen();
    expect(getByText('Thanks to the first 500. Pull is $59.99 a year, cancel any time.')).toBeOnTheScreen();
    await press(getByText('See plans'));
    expect(p.onSeePlans).toHaveBeenCalledTimes(1);
  });

  it('taking a seat buys the founding product', async () => {
    const p = props();
    const { getByText } = await render(<FoundingSheet seats={SEATS} {...p} />);
    await press(getByText('Take a seat · $49.99'));
    expect(p.purchase).toHaveBeenCalledWith({ kind: 'founding' });
    expect(getByText('Pull, for life. No renewal.')).toBeOnTheScreen();
  });
});

describe('CapSheet', () => {
  it('a Pull subscriber at the cap sees the reset date and no upgrade', async () => {
    const onQueue = jest.fn();
    const { getByText, queryByTestId, queryByText } = await render(<CapSheet tier="pull" now={NOW} onQueue={onQueue} />);
    expect(getByText("You've used your 40 this month.")).toBeOnTheScreen();
    expect(
      getByText("Resets on 1 Nov. This clip is saved and goes through then. Filming and everything you've already analysed keep working.")
    ).toBeOnTheScreen();
    await press(getByText('Queue until 1 Nov'));
    expect(onQueue).toHaveBeenCalledTimes(1);
    expect(queryByTestId('cap-upgrade')).toBeNull();
    expect(queryByText(/Upgrade|Platform/)).toBeNull();
  });

  it('a founding member gets the same 40 and reset', async () => {
    const { getByText } = await render(<CapSheet tier="founding" now={NOW} onQueue={jest.fn()} />);
    expect(getByText("You've used your 40 this month.")).toBeOnTheScreen();
  });
});

describe('Backdrop art', () => {
  const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 402, height: 874 - y } } });

  it('fits the whole figure, centred, between the status bar and a tall sheet', () => {
    const f = artFrame(ART.catch, { top: 62, bottom: 273 }, 402);
    expect(f.height).toBe(179);
    expect(f.width).toBeCloseTo(126.0458, 3);
    expect(f.left).toBeCloseTo(137.9771, 3);
    expect(f.top).toBe(78);
  });

  it('caps a wide pose by width and height above a short sheet', () => {
    const f = artFrame(ART.setup, { top: 59, bottom: 600 }, 402);
    expect(f.width).toBeCloseTo(289.44, 3);
    expect(f.height).toBeCloseTo(263.1273, 3);
    expect(f.left).toBeCloseTo(56.28, 3);
    expect(f.top).toBeCloseTo(197.9364, 3);
  });

  it.each([
    ['CapSheet', 'setup', () => <CapSheet tier="pull" now={NOW} onQueue={jest.fn()} />],
    ['LastFreeSheet', 'power', () => <LastFreeSheet onContinue={jest.fn()} onPlans={jest.fn()} />],
    ['FoundingSheet', 'trail', () => <FoundingSheet seats={SEATS} platform="ios" now={NOW} purchase={jest.fn()} onYearly={jest.fn()} onSeePlans={jest.fn()} onDone={jest.fn()} />],
    [
      'PaywallSheet',
      'catch',
      () => (
        <PaywallSheet cues={[]} freeLeft={0} seats={SEATS} platform="ios" now={NOW} purchase={jest.fn()} onNotNow={jest.fn()} onRestore={jest.fn()} onWatch={jest.fn()} />
      ),
    ],
  ] as const)('%s shows the %s silhouette once the sheet top is known, never the photo cutout', async (_, name, ui) => {
    const screen = await render(ui());
    expect(screen.queryByTestId(`paywall-art-${name}`)).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId('paywall-sheet'), 'layout', layout(500));
    });
    const img = screen.getByTestId(`paywall-art-${name}`);
    expect(img).toHaveProp('source', ART[name].source);
    expect(img).toHaveStyle({ opacity: 0.4 });
    const box = StyleSheet.flatten(img.props.style);
    expect(box.top + box.height).toBeLessThanOrEqual(500);
  });
});

describe('QuizScreen', () => {
  it('needs an answer per step and hands back all four', async () => {
    const onDone = jest.fn();
    const { getByText, getByTestId } = await render(<QuizScreen onDone={onDone} />);
    expect(getByText('1 OF 4')).toBeOnTheScreen();
    await press(getByTestId('quiz-next'));
    expect(getByText('1 OF 4')).toBeOnTheScreen();
    await press(getByText('Snatch'));
    await press(getByTestId('quiz-next'));
    expect(getByText('Where does your snatch go wrong?')).toBeOnTheScreen();
    await press(getByText('I miss behind'));
    await press(getByTestId('quiz-next'));
    await press(getByText('2 to 3 times a week'));
    await press(getByTestId('quiz-next'));
    await press(getByText('Sometimes'));
    await press(getByTestId('quiz-next'));
    expect(onDone).toHaveBeenCalledWith(['Snatch', 'I miss behind', '2 to 3 times a week', 'Sometimes']);
  });
});

describe('TrialPaywall', () => {
  const props = () => ({
    now: NOW,
    platform: 'ios' as const,
    purchase: jest.fn(() => Promise.resolve('success' as const)),
    onWeb: jest.fn(),
    onDone: jest.fn(),
    onClose: jest.fn(),
  });

  it('leads with annual and states the first charge', async () => {
    const p = props();
    const { getByText, getByTestId, queryByText } = await render(<TrialPaywall webCheckout={false} {...p} />);
    expect(getByText('Try Pull free for 7 days')).toBeOnTheScreen();
    expect(getByTestId('trial-annual')).toBeSelected();
    expect(getByText('$5 a month, billed $59.99')).toBeOnTheScreen();
    expect(getByText('save 50%')).toBeOnTheScreen();
    expect(
      getByText("Today: nothing. 18 Oct: $59.99 unless you cancel. We'll remind you two days before.")
    ).toBeOnTheScreen();
    expect(queryByText('Pay on the web instead')).toBeNull();
    await press(getByTestId('trial-monthly'));
    expect(
      getByText("Today: nothing. 18 Oct: $9.99 unless you cancel. We'll remind you two days before.")
    ).toBeOnTheScreen();
    await press(getByText('Start free trial'));
    expect(p.purchase).toHaveBeenCalledWith({ kind: 'sub', tier: 'pull', period: 'monthly', trial: true });
    expect(getByText('Pull trial, first charge 18 Oct.')).toBeOnTheScreen();
  });

  it('offers web checkout only behind the flag', async () => {
    const p = props();
    const { getByText } = await render(<TrialPaywall webCheckout {...p} />);
    await press(getByText('Pay on the web instead'));
    expect(p.onWeb).toHaveBeenCalledWith('annual');
  });
});

describe('LastFreeSheet', () => {
  it('warns before the last free video and lets the lifter carry on or see plans', async () => {
    const onContinue = jest.fn();
    const onPlans = jest.fn();
    const { getByText } = await render(<LastFreeSheet onContinue={onContinue} onPlans={onPlans} />);
    expect(getByText('This is your last free video')).toBeOnTheScreen();
    expect(getByText('video 3 of 3 free')).toBeOnTheScreen();
    await press(getByText('Film it'));
    await press(getByText('See plans'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onPlans).toHaveBeenCalledTimes(1);
  });
});
