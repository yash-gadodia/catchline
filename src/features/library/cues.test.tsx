import { act, fireEvent, render } from '@testing-library/react-native';
import CuesScreen from './CuesScreen';
import { emptyLibrary } from './seed';
import { useLibraryStore } from './store';
import type { CueRecord, Session } from './types';

jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/library', () => ({ syncLibrary: jest.fn(() => Promise.resolve()) }));
const { syncLibrary } = jest.requireMock('../../data/library') as { syncLibrary: jest.Mock };

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

// The owner's real rows (14-10-2026): a trying jump_forward cue on the snatch and on the
// clean, sessions counted by the server, analyses whose measurement ids are the fault ids.
const TODAY = '2026-10-14';
const snatchCue: CueRecord = {
  id: '6c1d2e3f-0000-4000-8000-000000000001',
  movement: 'snatch',
  text: 'Land on the line you started on.',
  why: 'Your feet landed 9 cm in front of where they started.',
  metricId: 'jump_forward',
  givenAt: '2026-10-10',
  status: 'trying',
  sessionsTarget: 6,
  sessionsDone: 3,
  firstLiftId: 'lift-1',
  lastLiftId: 'lift-3',
  before: { image: '' },
  after: { image: '' },
};
const cleanCue: CueRecord = { ...snatchCue, id: '6c1d2e3f-0000-4000-8000-000000000002', movement: 'clean', givenAt: '2026-10-13', sessionsDone: 1 };
const session = (id: string, movement: Session['movement'], date: string, jump: number): Session => ({
  id: `s-${id}`,
  liftId: id,
  movement,
  date,
  values: { hips_rise_early: 2, bar_forward_off_hips: 4, jump_forward: jump, turnover_time: 0.21 },
});
const SESSIONS = [session('lift-1', 'snatch', '2026-10-10', 9), session('lift-2', 'snatch', '2026-10-12', 7), session('lift-3', 'snatch', '2026-10-13', 5)];

function load(over: { cues?: CueRecord[]; sessions?: Session[]; synced?: boolean }) {
  useLibraryStore.getState().load({ ...emptyLibrary(), today: TODAY, cues: [], sessions: [], ...over });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Cues tab on a real account', () => {
  it('lists every trying cue from its own row: text, movement, server count, how long ago, trend', async () => {
    load({ cues: [snatchCue, cleanCue], sessions: SESSIONS });
    const onOpen = jest.fn();
    const { getByText, getAllByText, getByTestId, queryByText } = await render(<CuesScreen onOpen={onOpen} />);
    expect(getByText('TRYING · SNATCH')).toBeOnTheScreen();
    expect(getByText('TRYING · CLEAN')).toBeOnTheScreen();
    expect(getAllByText('Land on the line you started on.')).toHaveLength(2);
    expect(getByText('3 of 6 sessions · 4 days ago')).toBeOnTheScreen();
    expect(getByText('1 of 6 sessions · yesterday')).toBeOnTheScreen();
    expect(getByTestId('cue-sparkline')).toBeOnTheScreen();
    expect(getByText('Feet forward, lift-off to catch, cm. Heading the right way.')).toBeOnTheScreen();
    expect(getByText('Feet forward, lift-off to catch, cm.')).toBeOnTheScreen();
    expect(queryByText('Past cues')).toBeNull();
    await press(getByTestId(`active-${snatchCue.id}`));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: snatchCue.id, metricId: 'jump_forward' }));
  });

  it('groups ended cues under Past cues with their status', async () => {
    load({
      cues: [snatchCue, { ...cleanCue, status: 'stuck', endedAt: '2026-10-13' }, { ...cleanCue, id: 'x3', status: 'didnt_stick', endedAt: '2026-10-01', sessionsDone: 6 }],
      sessions: SESSIONS,
    });
    const { getByText, getByTestId } = await render(<CuesScreen onOpen={jest.fn()} />);
    expect(getByText('PAST CUES')).toBeOnTheScreen();
    expect(getByText('Stuck')).toBeOnTheScreen();
    expect(getByText("Didn't stick")).toBeOnTheScreen();
    expect(getByText('clean · jumped forward · yesterday')).toBeOnTheScreen();
    expect(getByText('clean · jumped forward · 13 days ago')).toBeOnTheScreen();
    expect(getByTestId('past-x3')).toBeOnTheScreen();
  });

  it('shows a spinner until the first sync lands, then the empty state', async () => {
    load({ synced: false });
    const view = await render(<CuesScreen onOpen={jest.fn()} />);
    expect(view.getByTestId('cues-loading')).toBeOnTheScreen();
    expect(view.queryByText('Your first cue lands here.')).toBeNull();
    await act(async () => {
      load({ synced: true });
    });
    expect(view.getByTestId('cues-empty')).toBeOnTheScreen();
    expect(view.getByText('Your first cue lands here.')).toBeOnTheScreen();
  });

  it('pull-to-refresh re-syncs the library', async () => {
    load({ cues: [snatchCue], sessions: SESSIONS });
    const { container } = await render(<CuesScreen onOpen={jest.fn()} />);
    // RN's jest RefreshControl mock renders a bare RCTRefreshControl; fireEvent climbs to the composite's onRefresh.
    const [control] = container.queryAll((i) => i.type === 'RCTRefreshControl');
    await act(async () => {
      fireEvent(control, 'refresh');
    });
    expect(syncLibrary).toHaveBeenCalledTimes(1);
  });

  it('renders a cue whose lifts were deleted and a fault id it has never seen', async () => {
    load({ cues: [{ ...snatchCue, metricId: 'brand_new_fault', firstLiftId: undefined, lastLiftId: undefined }], sessions: [] });
    const { getByText, queryByTestId } = await render(<CuesScreen onOpen={jest.fn()} />);
    expect(getByText('Brand new fault, cm.')).toBeOnTheScreen();
    expect(getByText('3 of 6 sessions · 4 days ago')).toBeOnTheScreen();
    expect(queryByTestId('cue-sparkline')).toBeNull();
  });
});
