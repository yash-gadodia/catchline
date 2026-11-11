import { weekKey } from '../paywall/entitlements';
import * as Clipboard from 'expo-clipboard';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import LiftsScreen from './LiftsScreen';
import FailureScreen from './FailureScreen';
import TabBar from './TabBar';
import { FAILURE_COPY, FAILURE_REASONS, type FailureReason } from './failures';
import { loadLibrary } from './repository';
import { emptyLibrary } from './seed';
import { useLibraryStore } from './store';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const liftsNav = () => ({
  onOpen: jest.fn(),
  onUnlock: jest.fn(),
  onRecord: jest.fn(),
  onImport: jest.fn(),
  onDelete: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
  require('../paywall/usageStore').useUsage.setState({ usage: { lifetime: 0, month: '', thisMonth: 0 } });
});

describe('LiftsScreen', () => {
  it('lists every lift newest first under its day: a still, the time, the load, and nothing about cues', async () => {
    const at = new Date(2026, 2, 11, 14, 32).toISOString();
    useLibraryStore.getState().load({
      ...emptyLibrary(),
      lifts: [
        { id: 'old', movement: 'clean', date: '2026-03-09', status: 'done', analysisId: 'snatch-mock-low', loadKg: 80, thumb: 'asset:snatch/2-knee' },
        { id: 'new', movement: 'snatch', date: '2026-03-11', at, status: 'done', analysisId: 'snatch-mock', loadKg: 62.5, thumb: 'asset:snatch/6-catch' },
        { id: 'bare', movement: 'snatch', date: '2026-03-10', status: 'processing' },
      ],
    });
    const nav = liftsNav();
    const { getByTestId, getAllByTestId, queryByTestId, queryByText } = await render(<LiftsScreen nav={nav} />);
    expect(getAllByTestId(/^lift-title-/).map((n) => n.props.testID)).toEqual(['lift-title-new', 'lift-title-bare', 'lift-title-old']);
    expect(getAllByTestId(/^day-/).map((n) => n.props.testID)).toEqual(['day-2026-03-11', 'day-2026-03-10', 'day-2026-03-09']);
    expect(getByTestId('day-2026-03-11')).toHaveTextContent(/^11 MAR/);
    expect(getByTestId('lift-title-new')).toHaveTextContent('14:32 · 62.5 kg');
    expect(getByTestId('lift-title-bare')).toHaveTextContent('10 Mar');
    expect(getByTestId('lift-detail-bare')).toHaveTextContent('tracking');
    expect(getByTestId('lift-title-old')).toHaveTextContent('9 Mar · 80 kg');
    expect(within(getByTestId('lift-new')).getByTestId('lift-thumb')).toBeOnTheScreen();
    for (const gone of ['cue-strip', 'group', 'movement-chips', 'made-counts']) expect(queryByTestId(gone)).toBeNull();
    expect(queryByText(/best|Trying|possible/)).toBeNull();
    await press(getByTestId('lift-new'));
    expect(nav.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  });

  it('shows every row state of the seeded library, with Unlock only on the queued lift', async () => {
    const nav = liftsNav();
    const { getByTestId, queryByTestId } = await render(<LiftsScreen nav={nav} />);
    expect(getByTestId('lift-detail-l-clean')).toHaveTextContent('tracking');
    expect(getByTestId('lift-detail-l-jerk')).toHaveTextContent("Couldn't see the bar at the catch");
    expect(getByTestId('lift-detail-l-snatch-queued')).toHaveTextContent('Queued · free videos used');
    expect(queryByTestId('retake-l-jerk')).toBeNull();
    await press(getByTestId('unlock-l-snatch-queued'));
    expect(nav.onUnlock).toHaveBeenCalledTimes(1);
  });

  it('starts day one with Import first and Record second, and no demo', async () => {
    loadLibrary('empty');
    const nav = liftsNav();
    const { getByTestId, getByText, queryByTestId } = await render(<LiftsScreen nav={nav} />);
    expect(getByTestId('lifts-empty')).toBeOnTheScreen();
    expect(getByText('Add your first lift.')).toBeOnTheScreen();
    expect(getByText('Any lift or gymnastics clip. Whole body in frame.')).toBeOnTheScreen();
    await press(getByTestId('empty-import'));
    await press(getByTestId('empty-record'));
    expect(nav.onImport).toHaveBeenCalledTimes(1);
    expect(nav.onRecord).toHaveBeenCalledTimes(1);
    expect(queryByTestId('empty-demo')).toBeNull();
  });
});

describe('TabBar', () => {
  it('marks the active tab and makes the centre button Import', async () => {
    const onTab = jest.fn();
    const onImport = jest.fn();
    const { getByTestId, getByText, getAllByRole } = await render(<TabBar active="me" onTab={onTab} onImport={onImport} />);
    expect(getAllByRole('tab')).toHaveLength(2);
    expect(getByTestId('tab-me')).toBeSelected();
    expect(getByTestId('tab-index')).not.toBeSelected();
    expect(getByText('You')).toBeOnTheScreen();
    await press(getByTestId('tab-index'));
    expect(onTab).toHaveBeenCalledWith('index');
    expect(getByTestId('tab-import')).toHaveProp('accessibilityLabel', 'Import a video');
    await press(getByTestId('tab-import'));
    expect(onImport).toHaveBeenCalledTimes(1);
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
    useUsage.setState({ usage: { lifetime: 2, week: weekKey(new Date()), thisWeek: 2 } });
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
