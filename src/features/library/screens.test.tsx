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
  onDetails: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
  require('./liftDetails').useLiftDetails.setState({ details: {} });
  require('./liftNames').useLiftNames.setState({ shapes: {} });
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

  it('names lifts by kind and keeps the list to one kind on a tap', async () => {
    const { useLiftNames } = require('./liftNames');
    useLiftNames.setState({ shapes: { 'a-1': 'floor-overhead', 'a-2': 'floor-overhead', 'a-3': 'floor-shoulders' } });
    useLibraryStore.getState().load({
      ...emptyLibrary(),
      lifts: [
        { id: 'l1', movement: 'snatch', date: '2026-03-11', status: 'done', analysisId: 'a-1' },
        { id: 'l2', movement: 'snatch', date: '2026-03-10', status: 'done', analysisId: 'a-2' },
        { id: 'l3', movement: 'snatch', date: '2026-03-09', status: 'done', analysisId: 'a-3' },
        { id: 'l4', movement: 'snatch', date: '2026-03-08', status: 'done', analysisId: 'a-4' },
      ],
    });
    const { getByTestId, getAllByTestId } = await render(<LiftsScreen nav={liftsNav()} />);
    expect(getByTestId('lift-title-l1')).toHaveTextContent('Snatch');
    expect(getByTestId('lift-title-l3')).toHaveTextContent('Clean');
    expect(getByTestId('lift-title-l4')).toHaveTextContent('8 Mar');
    expect(getAllByTestId(/^kind-/).map((n) => n.props.testID)).toEqual(['kind-filter', 'kind-all', 'kind-Snatch', 'kind-Clean']);
    await press(getByTestId('kind-Snatch'));
    expect(getAllByTestId(/^lift-title-/).map((n) => n.props.testID)).toEqual(['lift-title-l1', 'lift-title-l2']);
    await press(getByTestId('kind-all'));
    expect(getAllByTestId(/^lift-title-/)).toHaveLength(4);
  });

  it("titles a lift by the lifter's own name, with its tags and the first line of its note", async () => {
    const at = new Date(2026, 2, 11, 14, 32).toISOString();
    const { useLiftNames } = require('./liftNames');
    const { useLiftDetails } = require('./liftDetails');
    useLiftNames.setState({ shapes: { 'a-1': 'floor-overhead' } });
    useLiftDetails.setState({
      details: {
        'a-1': { name: 'Opener', tags: ['pr', 'comp prep'], note: 'Felt fast.\nStay over the bar.' },
        l2: { name: 'Warm up', tags: [], note: '' },
      },
    });
    useLibraryStore.getState().load({
      ...emptyLibrary(),
      lifts: [
        { id: 'l1', movement: 'snatch', date: '2026-03-11', at, status: 'done', analysisId: 'a-1', loadKg: 62.5 },
        { id: 'l2', movement: 'snatch', date: '2026-03-10', status: 'done', loadKg: 40 },
        { id: 'l3', movement: 'snatch', date: '2026-03-09', status: 'done', analysisId: 'a-3' },
        { id: 'l4', movement: 'snatch', date: '2026-03-08', status: 'processing' },
      ],
    });
    const nav = liftsNav();
    const { getByTestId, queryByTestId } = await render(<LiftsScreen nav={nav} />);
    expect(getByTestId('lift-title-l1')).toHaveTextContent('Opener');
    expect(getByTestId('lift-detail-l1')).toHaveTextContent('14:32 · 62.5 kg · Snatch');
    expect(getByTestId('lift-tags-l1')).toHaveTextContent('#pr  #comp prep');
    expect(getByTestId('lift-note-l1')).toHaveTextContent('Felt fast. Stay over the bar.');
    expect(getByTestId('lift-note-l1')).toHaveProp('numberOfLines', 1);
    expect(getByTestId('lift-title-l2')).toHaveTextContent('Warm up');
    expect(getByTestId('lift-detail-l2')).toHaveTextContent('10 Mar · 40 kg · Snatch');
    expect(getByTestId('lift-title-l3')).toHaveTextContent('9 Mar');
    for (const none of ['lift-tags-l2', 'lift-note-l2', 'lift-tags-l3', 'lift-note-l3']) expect(queryByTestId(none)).toBeNull();
  });

  it('opens the details from the button on a tracked row, without opening the player or the delete prompt', async () => {
    const nav = liftsNav();
    const { getByTestId, queryByTestId } = await render(<LiftsScreen nav={nav} />);
    expect(getByTestId('lift-details-l-snatch-today')).toHaveProp('accessibilityLabel', 'Name, tags and note');
    await press(getByTestId('lift-details-l-snatch-today'));
    expect(nav.onDetails).toHaveBeenCalledWith(expect.objectContaining({ id: 'l-snatch-today' }));
    expect(nav.onOpen).not.toHaveBeenCalled();
    expect(nav.onDelete).not.toHaveBeenCalled();
    for (const id of ['l-clean', 'l-jerk', 'l-snatch-queued']) expect(queryByTestId(`lift-details-${id}`)).toBeNull();
  });

  it('searches by name, kind, tag, note and weight, together with the kind filter', async () => {
    const { useLiftNames } = require('./liftNames');
    const { useLiftDetails } = require('./liftDetails');
    useLiftNames.setState({ shapes: { a1: 'floor-overhead', a2: 'floor-overhead', a3: 'floor-shoulders', a4: 'floor-shoulders' } });
    useLiftDetails.setState({
      details: {
        a1: { name: 'Opener', tags: ['pr'], note: 'Felt fast' },
        a2: { name: '', tags: ['heavy'], note: 'Hips shot up' },
        a3: { name: '', tags: ['heavy', 'pr'], note: '' },
      },
    });
    const done = (n: number, loadKg?: number) => ({ id: `l${n}`, movement: 'snatch' as const, date: `2026-03-${String(20 - n).padStart(2, '0')}`, status: 'done' as const, analysisId: `a${n}`, loadKg });
    useLibraryStore.getState().load({
      ...emptyLibrary(),
      lifts: [done(1, 62.5), done(2, 70), done(3, 90), done(4, 62.5), done(5), done(6), done(7), { id: 'l8', movement: 'snatch', date: '2026-03-01', status: 'processing', loadKg: 70 }],
    });
    const { getByTestId, getAllByTestId, queryByTestId, queryAllByTestId } = await render(<LiftsScreen nav={liftsNav()} />);
    const rows = () => queryAllByTestId(/^lift-title-/).map((n) => n.props.testID.replace('lift-title-', ''));
    const search = async (text: string) => {
      await act(async () => {
        fireEvent.changeText(getByTestId('lift-search'), text);
      });
    };
    expect(getAllByTestId(/^lift-title-/)).toHaveLength(8);
    expect(queryByTestId('lift-search-clear')).toBeNull();
    await search('open');
    expect(rows()).toEqual(['l1']);
    await search('clean');
    expect(rows()).toEqual(['l3', 'l4']);
    await search('PR');
    expect(rows()).toEqual(['l1', 'l3']);
    await search('hips');
    expect(rows()).toEqual(['l2']);
    await search('62.5');
    expect(rows()).toEqual(['l1', 'l4']);
    await search('70kg');
    expect(rows()).toEqual(['l2', 'l8']);
    await search('heavy shot');
    expect(rows()).toEqual(['l2']);

    await search('pr');
    await press(getByTestId('kind-Clean'));
    expect(rows()).toEqual(['l3']);
    await search('opener');
    expect(rows()).toEqual([]);
    expect(getByTestId('lifts-no-match')).toHaveTextContent('No lifts foundNothing in Clean matches "opener".Clear search');
    await press(getByTestId('kind-all'));
    expect(rows()).toEqual(['l1']);

    await search('zzz');
    expect(getByTestId('lifts-no-match')).toHaveTextContent('No lifts foundNothing matches "zzz". Search looks at names, tags, notes and weights.Clear search');
    await press(getByTestId('lifts-no-match-clear'));
    expect(getByTestId('lift-search')).toHaveProp('value', '');
    expect(rows()).toHaveLength(8);
    await search('zzz');
    await press(getByTestId('lift-search-clear'));
    expect(queryByTestId('lifts-no-match')).toBeNull();
    expect(rows()).toHaveLength(8);
  });

  it('keeps the search field away until there are eight lifts', async () => {
    const lifts = Array.from({ length: 7 }, (_, n) => ({ id: `l${n}`, movement: 'snatch' as const, date: `2026-03-${String(10 + n)}`, status: 'done' as const }));
    useLibraryStore.getState().load({ ...emptyLibrary(), lifts });
    const { queryByTestId, getByTestId } = await render(<LiftsScreen nav={liftsNav()} />);
    expect(queryByTestId('lift-search')).toBeNull();
    await act(async () => {
      useLibraryStore.getState().load({ ...emptyLibrary(), lifts: [...lifts, { id: 'l7', movement: 'snatch', date: '2026-03-17', status: 'done' }] });
    });
    expect(getByTestId('lift-search')).toHaveProp('placeholder', 'Search lifts');
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
  // the tier is reset before each test, while nothing is mounted (after one, the screen still is and would re-render)
  beforeEach(() => {
    usePurchases.setState({ tier: 'free' });
    jest.spyOn(backend, 'backendEnabled').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

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
