import * as Clipboard from 'expo-clipboard';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import LiftsScreen from './LiftsScreen';
import CuesScreen from './CuesScreen';
import CueDetailScreen, { DidntStickScreen, StuckScreen } from './CueDetailScreen';
import TrendsScreen from './TrendsScreen';
import FailureScreen from './FailureScreen';
import TabBar from './TabBar';
import YouTab from './YouTab';
import { FAILURE_COPY, FAILURE_REASONS, type FailureReason } from './failures';
import { keepTrying, loadLibrary, markStuck, tryNewCue } from './repository';
import { useLibraryStore } from './store';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const cue = (id: string) => useLibraryStore.getState().cues.find((c) => c.id === id)!;
const liftsNav = () => ({
  onOpen: jest.fn(),
  onRetake: jest.fn(),
  onUnlock: jest.fn(),
  onRecord: jest.fn(),
  onImport: jest.fn(),
  onDemo: jest.fn(),
  onCue: jest.fn(), onDelete: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
  require('../paywall/usageStore').useUsage.setState({ usage: { lifetime: 0, month: '', thisMonth: 0 } });
});

describe('LiftsScreen', () => {
  it('shows a low-confidence cue once: the status line, never "possible" on the same row', async () => {
    const lib = useLibraryStore.getState();
    lib.load({ ...lib, lifts: lib.lifts.filter((l) => l.id === 'l-snatch-low') });
    const { getByTestId, queryByText } = await render(<LiftsScreen nav={liftsNav()} />);
    expect(getByTestId('lift-l-snatch-low')).toHaveTextContent('Snatch · 3 reps · 62.5 kgdrift 7 cm · best 2 cmTrying · stay over the bar longer');
    expect(queryByText(/possible/)).toBeNull();
  });

  it('shows every row state with the counter chip and the current cue', async () => {
    require('../paywall/usageStore').useUsage.setState({ usage: { lifetime: 3, month: '', thisMonth: 0 } });
    const nav = liftsNav();
    const { getByText, getAllByText, getByTestId } = await render(<LiftsScreen nav={nav} />);
    expect(getByText('Free videos used')).toBeOnTheScreen();
    expect(getByText('Stay over the bar longer')).toBeOnTheScreen();
    expect(getByText('4 of 6 sessions')).toBeOnTheScreen();
    expect(getByText('TODAY · SUN 11 OCT')).toBeOnTheScreen();
    expect(getAllByText('Snatch · 3 reps · 62.5 kg')).toHaveLength(2);
    expect(getByText('drift 6 cm · best 2 cm')).toBeOnTheScreen();
    expect(getByText('analysing')).toBeOnTheScreen();
    expect(getByText("Couldn't see the bar at the catch")).toBeOnTheScreen();
    expect(getByText('Queued · free videos used')).toBeOnTheScreen();
    expect(getByTestId('dot-l-snatch-today-trying')).toBeOnTheScreen();
    expect(getByTestId('dot-l-mu-didnt_stick')).toBeOnTheScreen();

    await press(getByTestId('lift-l-snatch-today'));
    expect(nav.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'l-snatch-today', analysisId: 'snatch-mock' }));
    await press(getByTestId('retake-l-jerk'));
    expect(nav.onRetake).toHaveBeenCalledWith(expect.objectContaining({ id: 'l-jerk' }));
    await press(getByTestId('unlock-l-snatch-queued'));
    await press(getByTestId('free-chip'));
    expect(nav.onUnlock).toHaveBeenCalledTimes(2);
    await press(getByTestId('cue-strip'));
    expect(nav.onCue).toHaveBeenCalledWith('c-stay-over');
  });

  it('filters by group, then by movement', async () => {
    const { getByTestId, queryByTestId, queryByText } = await render(<LiftsScreen nav={liftsNav()} />);
    await press(getByTestId('group-gymnastics'));
    expect(getByTestId('lift-l-mu')).toBeOnTheScreen();
    expect(queryByTestId('lift-l-snatch-today')).toBeNull();
    expect(queryByTestId('movement-snatch')).toBeNull();
    await press(getByTestId('group-barbell'));
    await press(getByTestId('movement-jerk'));
    expect(getByTestId('lift-l-jerk')).toBeOnTheScreen();
    expect(queryByTestId('lift-l-snatch-today')).toBeNull();
    await press(getByTestId('movement-clean'));
    expect(getByTestId('lift-l-clean')).toBeOnTheScreen();
    expect(queryByText('Bar muscle-up · 5 reps')).toBeNull();
  });

  it('starts day one with the side-on instruction, Import first and Record second', async () => {
    loadLibrary('empty');
    const nav = liftsNav();
    const { getByText, getByTestId, getAllByRole } = await render(<LiftsScreen nav={nav} />);
    expect(getByText('3 free videos')).toBeOnTheScreen();
    expect(getByText('Add your first lift.')).toBeOnTheScreen();
    const buttons = getAllByRole('button').map((b) => b.props.testID).filter((id) => /^empty-/.test(id ?? ''));
    expect(buttons).toEqual(['empty-import', 'empty-record', 'empty-demo']);
    expect(getByTestId('empty-import')).toHaveTextContent('Import a video');
    expect(getByTestId('empty-record')).toHaveTextContent('Record');
    await press(getByTestId('empty-import'));
    expect(nav.onImport).toHaveBeenCalledTimes(1);
    expect(nav.onRecord).toHaveBeenCalledTimes(0);
    await press(getByTestId('empty-record'));
    await press(getByText('See how it works'));
    expect(nav.onRecord).toHaveBeenCalledTimes(1);
    expect(nav.onDemo).toHaveBeenCalledTimes(1);
  });
});

describe('TabBar', () => {
  it('marks the active tab and makes the centre button Import', async () => {
    const onTab = jest.fn();
    const onImport = jest.fn();
    const { getByTestId, getByText } = await render(<TabBar active="cues" onTab={onTab} onImport={onImport} />);
    expect(getByTestId('tab-cues')).toBeSelected();
    expect(getByTestId('tab-index')).not.toBeSelected();
    expect(getByText('You')).toBeOnTheScreen();
    await press(getByTestId('tab-trends'));
    expect(onTab).toHaveBeenCalledWith('trends');
    expect(getByTestId('tab-import')).toHaveProp('accessibilityLabel', 'Import a video');
    await press(getByTestId('tab-import'));
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe('CuesScreen', () => {
  it('shows the active cue with its counter and sparkline, then past cues by status', async () => {
    const onOpen = jest.fn();
    const { getByText, getByTestId } = await render(<CuesScreen onOpen={onOpen} />);
    expect(getByText('TRYING · SNATCH')).toBeOnTheScreen();
    expect(getByText('4 of 6 sessions · 11 days ago')).toBeOnTheScreen();
    expect(getByTestId('cue-sparkline')).toBeOnTheScreen();
    expect(getByText('Bar drift at hip, cm forward. Heading the right way.')).toBeOnTheScreen();
    expect(getByText('snatch · bar height 92 → 96 cm · 3 wks · 4 wks ago')).toBeOnTheScreen();
    expect(getByText('Stuck')).toBeOnTheScreen();
    expect(getByText("Didn't stick")).toBeOnTheScreen();
    expect(getByText('clean · dropped after 1 session · 5 wks ago')).toBeOnTheScreen();
    expect(getByText('Dropped')).toBeOnTheScreen();
    await press(getByTestId('past-c-hips-mu'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-hips-mu' }));
  });

  it('has an empty state before the first cue', async () => {
    loadLibrary('empty');
    const { getByText } = await render(<CuesScreen onOpen={jest.fn()} />);
    expect(getByText('Your first cue lands here.')).toBeOnTheScreen();
  });
});

describe('Cue detail and outcomes', () => {
  it('shows before and after evidence and the chart with the cue marker', async () => {
    const nav = { onBack: jest.fn(), onStuck: jest.fn(), onDidntStick: jest.fn(), onDrop: jest.fn() };
    const { getByText, getByTestId } = await render(<CueDetailScreen cue={cue('c-stay-over')} nav={nav} />);
    expect(getByText('TRYING · 4 OF 6')).toBeOnTheScreen();
    expect(getByTestId('before-readout')).toHaveTextContent('30 sep · 8 cm');
    expect(getByTestId('after-readout')).toHaveTextContent('today · 6 cm');
    expect(getByText('cm · 7 sessions measured')).toBeOnTheScreen();
    expect(getByTestId('cue-marker')).toBeOnTheScreen();
    expect(getByTestId('cue-lift-l-snatch-today')).toHaveTextContent('Snatch · 3 reps · 62.5 kgdrift 6 cm11 oct');
    await press(getByTestId('mark-stuck'));
    await press(getByTestId('didnt-stick'));
    await press(getByTestId('drop-cue'));
    expect(nav.onStuck).toHaveBeenCalledTimes(1);
    expect(nav.onDidntStick).toHaveBeenCalledTimes(1);
    expect(nav.onDrop).toHaveBeenCalledTimes(1);
  });

  it('lists other ways to say a measured cue', async () => {
    const nav = { onBack: jest.fn(), onStuck: jest.fn(), onDidntStick: jest.fn(), onDrop: jest.fn() };
    const jump = { ...cue('c-stay-over'), metricId: 'jump_forward' };
    const { getByTestId } = await render(<CueDetailScreen cue={jump} nav={nav} />);
    expect(getByTestId('cue-alternates')).toHaveTextContent(
      'OTHER WAYS TO SAY ITJump straight up, not forwardStay behind the linePull the bar into youPush the floor straight down'
    );
  });

  it('lists no other ways for a fault without them', async () => {
    const nav = { onBack: jest.fn(), onStuck: jest.fn(), onDidntStick: jest.fn(), onDrop: jest.fn() };
    const { queryByTestId } = await render(<CueDetailScreen cue={cue('c-stay-over')} nav={nav} />);
    expect(queryByTestId('cue-alternates')).toBeNull();
  });

  it('celebrates a cue that stuck with the change it made', async () => {
    const nav = { onNext: jest.fn(), onShare: jest.fn() };
    const { getByText, getByTestId } = await render(<StuckScreen cue={cue('c-finish-pull')} nav={nav} />);
    expect(getByText('Stuck.')).toBeOnTheScreen();
    expect(getByText('STUCK · SNATCH')).toBeOnTheScreen();
    expect(getByTestId('stuck-summary')).toHaveTextContent("Bar height 92 → 96 cm over 3 weeks. It's yours now.");
    await press(getByTestId('next-cue'));
    expect(nav.onNext).toHaveBeenCalledTimes(1);
  });

  it("offers a kind next step when a cue didn't stick", async () => {
    const nav = { onTryNew: jest.fn(), onKeepTrying: jest.fn(), onBack: jest.fn() };
    const { getByText, getByTestId } = await render(<DidntStickScreen cue={cue('c-hips-mu')} nav={nav} />);
    expect(getByText("DIDN'T STICK · BAR MUSCLE-UP")).toBeOnTheScreen();
    expect(getByTestId('didnt-stick-headline')).toHaveTextContent('Six sessions and the hips are still 8 cm off the bar.');
    await press(getByTestId('try-new-cue'));
    await press(getByTestId('keep-trying'));
    expect(nav.onTryNew).toHaveBeenCalledTimes(1);
    expect(nav.onKeepTrying).toHaveBeenCalledTimes(1);
  });

  it('records outcomes through the repository', () => {
    markStuck('c-stay-over');
    expect(cue('c-stay-over')).toMatchObject({ status: 'stuck', endedAt: '2026-10-11' });
    expect(tryNewCue('c-hips-mu')).toBe('c-hips-mu-next');
    expect(cue('c-hips-mu-next')).toMatchObject({ status: 'trying', text: 'Bigger arch before the drive', givenAt: '2026-10-11' });
    keepTrying('c-hips-mu');
    expect(cue('c-hips-mu')).toMatchObject({ status: 'trying', sessionsTarget: 9, endedAt: undefined });
  });
});

describe('TrendsScreen', () => {
  it('shows the latest value, pinned best and the measurement chips for the movement', async () => {
    const { getByTestId, getByText } = await render(<TrendsScreen />);
    expect(getByTestId('trend-hero')).toHaveTextContent('6 cm');
    expect(getByTestId('trend-recap')).toHaveTextContent('Bar drift at hip: 6 cm today. Best 2 cm on 18 Sep. Trying “Stay over the bar longer”: 4 of 6 sessions.');
    expect(getByText('65 kg · 18 Sep · drift 2 cm')).toBeOnTheScreen();
    expect(getByText('Bar drift at hip, cm forward. Lower is better. 10 sessions.')).toBeOnTheScreen();
    expect(getByTestId('cue-marker')).toBeOnTheScreen();
    await press(getByTestId('range-7'));
    expect(getByText('Bar drift at hip, cm forward. Lower is better. 2 sessions.')).toBeOnTheScreen();
    await press(getByTestId('metric-pull_time'));
    expect(getByTestId('trend-hero')).toHaveTextContent('0.59 s');
  });

  it('has gymnastics measurements', async () => {
    const { getByTestId, getByText } = await render(<TrendsScreen initialMovement="bar_muscle_up" />);
    expect(getByTestId('trend-hero')).toHaveTextContent('8 cm');
    expect(getByText('25 Sep · hip to bar 3 cm')).toBeOnTheScreen();
    for (const label of ['Kip height', 'Hip to bar', 'Body-line angle', 'Cycle time']) expect(getByText(label)).toBeOnTheScreen();
    await press(getByTestId('metric-body_line'));
    expect(getByTestId('trend-hero')).toHaveTextContent('36°');
  });

  it('switches movement, lists only movements with lifts and explains a trend needs two', async () => {
    const { getByTestId, getByText, queryByTestId } = await render(<TrendsScreen />);
    await press(getByTestId('movement-switcher'));
    expect(queryByTestId('pick-jerk')).toBeNull();
    await press(getByTestId('pick-clean'));
    expect(getByText('One clean so far.')).toBeOnTheScreen();
    expect(getByText('Trends need two lifts of the same movement. Film the next one and this fills in.')).toBeOnTheScreen();
  });

  it('a lift with no analysis still lands on its movement', async () => {
    const { getByText } = await render(<TrendsScreen initialMovement="jerk" />);
    expect(getByText('No jerks yet.')).toBeOnTheScreen();
  });
});

describe('FailureScreen', () => {
  it.each(FAILURE_REASONS)('renders %s with its cause, fix and primary action', async (reason) => {
    const onAction = jest.fn();
    const { getByText, getByTestId } = await render(
      <FailureScreen reason={reason} header="Snatch · 62.5 kg · frame 158" refCode="7f3a21" onAction={onAction} />
    );
    const copy = FAILURE_COPY[reason];
    expect(getByText(copy.title)).toBeOnTheScreen();
    expect(getByText(copy.body)).toBeOnTheScreen();
    expect(getByTestId('failure-header')).toHaveTextContent('Snatch · 62.5 kg · frame 158');
    await press(getByTestId('failure-primary'));
    expect(onAction).toHaveBeenCalledWith(copy.primary.action);
  });

  // #17: the longest body (unsupported_movement) overflowed the fixed copy block and the pinned
  // actions painted over its last line, so "The clip stays in your library." could not be read.
  it.each(FAILURE_REASONS)('%s: the body stays reachable in the scrollable copy block', async (reason) => {
    const { getByTestId } = await render(<FailureScreen reason={reason} header="Snatch" refCode="7f3a21" onAction={jest.fn()} />);
    const block = getByTestId('failure-copy');
    expect(block.type).toBe('RCTScrollView');
    expect(within(block).getByText(FAILURE_COPY[reason].body)).toBeOnTheScreen();
  });

  it('describes the refused lift with its own refusal line, never a canned movement', async () => {
    const { getByTestId, queryByText } = await render(
      <FailureScreen reason="unsupported_movement" header="Snatch" refCode="x" detail="No floor-to-overhead lift found in this clip." onAction={jest.fn()} />
    );
    expect(getByTestId('failure-readout')).toHaveTextContent('No floor-to-overhead lift found in this clip.');
    expect(queryByText(/wall walk/i)).toBeNull();
  });

  it('shows no readout for a refused lift with nothing real to say', async () => {
    const { queryByTestId, queryByText } = await render(<FailureScreen reason="unsupported_movement" header="" refCode="x" onAction={jest.fn()} />);
    expect(queryByTestId('failure-readout')).toBeNull();
    expect(queryByText(/wall walk/i)).toBeNull();
  });

  it('shows the native error under the copy of an unreadable clip', async () => {
    const native = 'Could not analyse on device: clip_unreadable: Cannot Decode';
    const { getByTestId } = await render(<FailureScreen reason="clip_unreadable" header="" refCode="x" detail={native} onAction={jest.fn()} />);
    expect(getByTestId('failure-detail')).toHaveTextContent(native);
  });

  it('lets the lifter pick between two people', async () => {
    const onAction = jest.fn();
    const { getByTestId } = await render(<FailureScreen reason="multiple_lifters" header="Snatch" refCode="x" onAction={onAction} />);
    await press(getByTestId('failure-alt'));
    expect(onAction).toHaveBeenCalledWith('pickB');
  });

  it('shows the generic copy for a reason it does not know and never prints the raw string', async () => {
    const raw = 'ZeroDivisionError: division by zero' as FailureReason;
    const { getByText, queryByText, getByTestId } = await render(<FailureScreen reason={raw} header="Snatch" refCode="7f3a21" onAction={jest.fn()} />);
    expect(getByText(FAILURE_COPY.unknown.title)).toBeOnTheScreen();
    expect(getByText(FAILURE_COPY.unknown.body)).toBeOnTheScreen();
    expect(getByTestId('failure-unknown')).toBeOnTheScreen();
    expect(queryByText(/ZeroDivisionError/)).toBeNull();
    expect(queryByText(/division by zero/)).toBeNull();
  });

  it('owns our own errors with a reference and no charge', async () => {
    const { getByText } = await render(<FailureScreen reason="unknown" header="Snatch" refCode="7f3a21" onAction={jest.fn()} />);
    expect(getByText('ref 7f3a21')).toBeOnTheScreen();
    expect(getByText(/didn't use one of your videos/)).toBeOnTheScreen();
    await press(getByText('ref 7f3a21'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('7f3a21');
    expect(getByText('Copied ref')).toBeOnTheScreen();
  });
});

describe('YouTab', () => {
  it('links to You and hides the dev entry behind a long-press on the version', async () => {
    const onOpen = jest.fn();
    const onDev = jest.fn();
    const { getByTestId } = await render(<YouTab onOpen={onOpen} onDev={onDev} />);
    await press(getByTestId('open-you'));
    await act(async () => {
      fireEvent(getByTestId('version'), 'longPress');
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDev).toHaveBeenCalledTimes(1);
  });
});

describe('LiftsScreen with the backend on', () => {
  const backend = require('../../data/backend');
  const { usePurchases } = require('../purchases/usePurchases');
  const { useUsage } = require('../paywall/usageStore');
  beforeEach(() => jest.spyOn(backend, 'backendEnabled').mockReturnValue(true));
  afterEach(() => {
    jest.restoreAllMocks();
    usePurchases.setState({ tier: 'free' });
  });

  it('the free-videos chip follows a purchase without a library sync', async () => {
    useUsage.setState({ usage: { lifetime: 2, month: '', thisMonth: 0 } });
    const { getByText, queryByTestId } = await render(<LiftsScreen nav={liftsNav()} />);
    expect(getByText('1 free video left')).toBeOnTheScreen();
    await act(async () => {
      usePurchases.setState({ tier: 'pull' });
    });
    expect(queryByTestId('free-chip')).toBeNull();
  });

  it('a long press asks to delete the lift', async () => {
    const nav = liftsNav();
    const { getByTestId } = await render(<LiftsScreen nav={nav} />);
    await act(async () => {
      fireEvent(getByTestId('lift-l-snatch-today'), 'longPress');
    });
    expect(nav.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'l-snatch-today' }));
  });
});
