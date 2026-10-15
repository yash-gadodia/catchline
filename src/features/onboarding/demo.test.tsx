import { act, fireEvent, render } from '@testing-library/react-native';
import { startLift, usePipeline } from '../../data/pipeline';
import { EMPTY_USAGE } from '../paywall/entitlements';
import { useUsage } from '../paywall/usageStore';
import DemoRoute from '../../../app/onboarding/demo';
import YouRoute from '../../../app/(tabs)/me';
import DemoScreen from './DemoScreen';
import { DEMO_STEPS, demoCaption, nextDemoStep } from './demo';
import { useOnboarding } from './store';

const params: { current: Record<string, string> } = { current: {} };
const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockNav,
  useRouter: () => mockNav,
  useLocalSearchParams: () => params.current,
}));

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { __esModule: true, VideoView: View, useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) }) };
});

jest.mock('../../data/pipeline', () => {
  const actual = jest.requireActual('../../data/pipeline');
  return { ...actual, startLift: jest.fn() };
});

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  params.current = {};
  useUsage.setState({ usage: EMPTY_USAGE, warnedAt: null });
  useOnboarding.setState({ completed: false, accountChoice: null, consent: null });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('demo step logic', () => {
  it('runs processing, reveal, cue, player, then the end card, in about 20 s', () => {
    expect(nextDemoStep('processing')).toBe('reveal');
    expect(nextDemoStep('reveal')).toBe('cue');
    expect(nextDemoStep('cue')).toBe('player');
    expect(nextDemoStep('player')).toBe('end');
    expect(nextDemoStep('end')).toBe('end');
    expect(DEMO_STEPS.reduce((t, s) => t + s.ms, 0)).toBe(20000);
  });

  it('captions each step and none on the end card', () => {
    expect(demoCaption('processing')).toBe('Catchline finds the bar');
    expect(demoCaption('reveal')).toBe('Catchline finds the bar');
    expect(demoCaption('cue')).toBe('One thing to fix');
    expect(demoCaption('player')).toBe('Scrub any frame');
    expect(demoCaption('end')).toBeNull();
  });
});

describe('DemoScreen', () => {
  it('plays the real screens on the bundled lift with a caption each, then "Now try yours"', async () => {
    const onImport = jest.fn();
    const onRecord = jest.fn();
    const view = await render(<DemoScreen onImport={onImport} onRecord={onRecord} />);

    expect(view.getByTestId('demo-processing')).toBeOnTheScreen();
    expect(view.getByTestId('processing-progress')).toBeOnTheScreen();
    expect(view.getByTestId('processing-clip')).toBeOnTheScreen();
    expect(view.getByTestId('demo-caption')).toHaveTextContent('Catchline finds the bar');
    await advance(4000);
    expect(view.getByTestId('processing-done')).toBeOnTheScreen();

    await advance(1000);
    expect(view.getByTestId('demo-reveal')).toBeOnTheScreen();
    await advance(4500);
    expect(view.getByTestId('demo-cue')).toBeOnTheScreen();
    expect(view.getByTestId('cue-screen')).toBeOnTheScreen();
    expect(view.getByTestId('cue-text')).toHaveTextContent("Brush the bar up, don't bump it.");
    expect(view.getByTestId('evidence-readout')).toHaveTextContent('frame 358 · hip · 15 cm fwd');
    expect(view.getByTestId('demo-caption')).toHaveTextContent('One thing to fix');

    await advance(4500);
    expect(view.getByTestId('demo-player')).toBeOnTheScreen();
    expect(view.getByTestId('frame-number')).toHaveTextContent('327');
    expect(view.getByTestId('demo-caption')).toHaveTextContent('Scrub any frame');
    await advance(Math.ceil(6000 / 7) * 2);
    expect(view.getByTestId('frame-number')).toHaveTextContent('348');

    await advance(6000);
    expect(view.getByTestId('demo-try-yours')).toBeOnTheScreen();
    expect(view.getByText('Now try yours')).toBeOnTheScreen();
    expect(view.getByTestId('demo-import')).toHaveTextContent('Import a video');
    expect(view.getByTestId('demo-record')).toHaveTextContent('Record instead');
    await press(view.getByTestId('demo-import'));
    await press(view.getByTestId('demo-record'));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  it('never starts a lift or counts a free video', async () => {
    await render(<DemoScreen onImport={jest.fn()} onRecord={jest.fn()} />);
    await advance(21000);
    expect(startLift).not.toHaveBeenCalled();
    expect(usePipeline.getState().job).toBeNull();
    expect(useUsage.getState().usage).toEqual(EMPTY_USAGE);
  });

  it('Skip lands on "Now try yours" from any step', async () => {
    const view = await render(<DemoScreen onImport={jest.fn()} onRecord={jest.fn()} />);
    await press(view.getByTestId('demo-skip'));
    expect(view.getByTestId('demo-try-yours')).toBeOnTheScreen();
    expect(view.queryByTestId('demo-caption')).toBeNull();

    const later = await render(<DemoScreen onImport={jest.fn()} onRecord={jest.fn()} start="cue" />);
    await press(later.getByTestId('demo-skip'));
    expect(later.getByTestId('demo-try-yours')).toBeOnTheScreen();
  });

  it('is watch-only: the screens underneath take no touches', async () => {
    const view = await render(<DemoScreen onImport={jest.fn()} onRecord={jest.fn()} start="cue" />);
    expect(view.getByTestId('demo-cue').children[0]).toHaveProp('pointerEvents', 'none');
  });
});

describe('demo route', () => {
  it('first run: Import continues into the account step with the import intent, and completes nothing yet', async () => {
    const view = await render(<DemoRoute />);
    await press(view.getByTestId('demo-skip'));
    await press(view.getByTestId('demo-import'));
    expect(mockNav.push).toHaveBeenCalledWith('/onboarding/account?intent=import');
    expect(useOnboarding.getState().completed).toBe(false);
  });

  it('first run: Record instead goes to the film path, lift picker first', async () => {
    const view = await render(<DemoRoute />);
    await press(view.getByTestId('demo-skip'));
    await press(view.getByTestId('demo-record'));
    expect(mockNav.push).toHaveBeenCalledWith('/onboarding/lifts');
  });

  it('from the app: Import opens the picker, Record the viewfinder', async () => {
    params.current = { from: 'app' };
    const view = await render(<DemoRoute />);
    await press(view.getByTestId('demo-skip'));
    await press(view.getByTestId('demo-import'));
    await press(view.getByTestId('demo-record'));
    expect(mockNav.replace).toHaveBeenNthCalledWith(1, '/capture/import');
    expect(mockNav.replace).toHaveBeenNthCalledWith(2, '/capture');
  });

  it('You -> See how it works re-enters the demo from the start', async () => {
    useOnboarding.setState({ completed: true });
    const you = await render(<YouRoute />);
    await press(you.getByTestId('row-demo'));
    expect(mockNav.push).toHaveBeenCalledWith('/onboarding/demo?from=app');

    params.current = { from: 'app' };
    const demo = await render(<DemoRoute />);
    expect(demo.getByTestId('demo-processing')).toBeOnTheScreen();
    expect(demo.getByTestId('demo-caption')).toHaveTextContent('Catchline finds the bar');
  });
});
