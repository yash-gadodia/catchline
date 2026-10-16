import { act, fireEvent, render } from '@testing-library/react-native';
import TrendsScreen from './TrendsScreen';
import { emptyLibrary } from './seed';
import { useLibraryStore } from './store';
import type { CueRecord, Session } from './types';

jest.mock('../../data/backend', () => ({ backendEnabled: () => true }));
jest.mock('../../data/library', () => ({ syncLibrary: jest.fn(() => Promise.resolve()) }));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

// The owner's account: snatches and cleans analysed by the real CV (measurement ids are the
// fault ids), a trying jump_forward cue on each, nothing else.
const TODAY = '2026-10-14';
const session = (id: string, movement: Session['movement'], date: string, values: Record<string, number>, loadKg?: number): Session => ({
  id: `s-${id}`,
  liftId: id,
  movement,
  date,
  loadKg,
  values,
});
const SNATCH = { hips_rise_early: 2, bar_forward_off_hips: 4, turnover_time: 0.21, bar_peak_height: 88, catch_depth: 5 };
const SESSIONS = [
  session('l1', 'snatch', '2026-10-10', { ...SNATCH, jump_forward: 9 }, 60),
  session('l2', 'snatch', '2026-10-12', { ...SNATCH, jump_forward: 7 }, 62.5),
  session('l3', 'snatch', '2026-10-13', { ...SNATCH, jump_forward: 5 }, 60),
  session('l4', 'snatch', '2026-10-13', { ...SNATCH, jump_forward: 6 }, 60),
  session('c1', 'clean', '2026-10-13', { hips_rise_early: 3, early_arm_bend: 0.1, jump_forward: 8 }, 80),
];
const cue: CueRecord = {
  id: 'cue-snatch',
  movement: 'snatch',
  text: 'Land on the line you started on.',
  metricId: 'jump_forward',
  givenAt: '2026-10-10',
  status: 'trying',
  sessionsTarget: 6,
  sessionsDone: 3,
  before: { image: '' },
  after: { image: '' },
};

function load(over: Partial<ReturnType<typeof emptyLibrary>>) {
  useLibraryStore.getState().load({ ...emptyLibrary(), today: TODAY, ...over });
}

describe('Trends tab on a real account', () => {
  it('opens on the most-lifted movement with the cue metric, its chips, recap, hero and cue marker', async () => {
    load({ sessions: SESSIONS, cues: [cue] });
    const { getByTestId, getByText, queryByTestId, getAllByTestId } = await render(<TrendsScreen />);
    expect(getByText('Snatch')).toBeOnTheScreen();
    expect(getByTestId('trend-hero')).toHaveTextContent('6 cm');
    expect(getByTestId('trend-recap')).toHaveTextContent(
      'Jumped forward: 6 cm on 13 Oct. Best 5 cm on 13 Oct. Trying “Land on the line you started on.”: 3 of 6 sessions.'
    );
    expect(getByText('60 kg · 13 Oct · jump 5 cm')).toBeOnTheScreen();
    expect(getByText('Feet forward, lift-off to catch, cm. Lower is better. 4 sessions.')).toBeOnTheScreen();
    expect(getAllByTestId('cue-marker')).toHaveLength(1);
    for (const label of ['Hips rose early', 'Bar forward off hips', 'Jumped forward', 'Catch depth', 'Turnover time', 'Bar peak height']) {
      expect(getByText(label)).toBeOnTheScreen();
    }
    expect(queryByTestId('metric-bar_drift_hip')).toBeNull();
    expect(queryByTestId('metric-pull_time')).toBeNull();
    await press(getByTestId('metric-bar_peak_height'));
    expect(getByTestId('trend-hero')).toHaveTextContent('88 cm');
    expect(getByText('Bar peak height above lift-off, cm. Higher is better. 4 sessions.')).toBeOnTheScreen();
  });

  it('plots peak bar speed in m/s with two decimals', async () => {
    const speed = [1.74, 1.9, 1.8];
    load({ sessions: SESSIONS.slice(0, 3).map((s, i) => ({ ...s, values: { ...s.values, bar_speed: speed[i] } })) });
    const { getByTestId, getByText } = await render(<TrendsScreen />);
    await press(getByTestId('metric-bar_speed'));
    expect(getByTestId('trend-hero')).toHaveTextContent('1.80 m/s');
    expect(getByText('Peak bar speed in the second pull, m/s. Higher is better. 3 sessions.')).toBeOnTheScreen();
    expect(getByTestId('trend-recap')).toHaveTextContent('Peak bar speed: 1.80 m/s on 13 Oct. Best 1.90 m/s on 12 Oct.');
  });

  it('lists only the movements with lifts and explains one clean is not a trend', async () => {
    load({ sessions: SESSIONS, cues: [cue] });
    const { getByTestId, getByText, queryByTestId } = await render(<TrendsScreen />);
    await press(getByTestId('movement-switcher'));
    expect(getByTestId('pick-snatch')).toBeOnTheScreen();
    expect(getByTestId('pick-clean')).toBeOnTheScreen();
    expect(queryByTestId('pick-jerk')).toBeNull();
    expect(queryByTestId('pick-bar_muscle_up')).toBeNull();
    await press(getByTestId('pick-clean'));
    expect(getByTestId('trends-sparse')).toBeOnTheScreen();
    expect(getByText('One clean so far.')).toBeOnTheScreen();
    expect(getByText('Trends need two lifts of the same movement. Film the next one and this fills in.')).toBeOnTheScreen();
    expect(queryByTestId('trends-empty-art')).toBeNull();
  });

  it('spins until the first sync, then shows the no-lifts state with no switcher', async () => {
    load({ synced: false });
    const view = await render(<TrendsScreen />);
    expect(view.getByTestId('trends-loading')).toBeOnTheScreen();
    await act(async () => {
      load({ synced: true });
    });
    expect(view.getByTestId('trends-empty')).toBeOnTheScreen();
    expect(view.getByText('Film a lift and the trend starts here.')).toBeOnTheScreen();
    expect(view.getByText('Trends need two lifts of the same movement.')).toBeOnTheScreen();
    expect(view.getByTestId('trends-empty-art')).toHaveProp('source', require('../../../assets/art/empty-trends.png'));
    expect(view.getByTestId('trends-empty-art')).toHaveStyle({ width: 160, height: 160, tintColor: '#A39F97' });
    expect(view.queryByTestId('movement-switcher')).toBeNull();
  });

  it('one lift of one movement: no chart, the two-lift explanation', async () => {
    load({ sessions: [SESSIONS[0]] });
    const view = await render(<TrendsScreen />);
    expect(view.getByText('One snatch so far.')).toBeOnTheScreen();
    expect(view.queryByTestId('trend-chart')).toBeNull();
  });

  it('a cue on a fault no session measured yet does not break the chips', async () => {
    load({ sessions: SESSIONS, cues: [{ ...cue, metricId: 'brand_new_fault' }] });
    const view = await render(<TrendsScreen />);
    expect(view.getByTestId('trend-hero')).toHaveTextContent('2 cm');
    expect(view.getByText('Hips vs shoulders, floor to knee, cm. Lower is better. 4 sessions.')).toBeOnTheScreen();
  });

  it('marks the lifts an older analysis version measured: a muted note and hollow points', async () => {
    const versioned = SESSIONS.map((s, i) => ({ ...s, analysisVersion: i < 2 ? undefined : 'cv-2026.10.16' }));
    load({ sessions: versioned, cues: [cue] });
    const view = await render(<TrendsScreen />);
    expect(view.getByTestId('version-note')).toHaveTextContent(
      'Analysis improved on 13 Oct; earlier lifts were measured by the older version.'
    );
    expect(view.getByTestId('version-note')).toHaveStyle({ color: '#A39F97', fontSize: 13 });
    expect(view.getAllByTestId('older-point')).toHaveLength(2);
  });

  it('shows no version note when one version measured every lift', async () => {
    load({ sessions: SESSIONS.map((s) => ({ ...s, analysisVersion: 'cv-2026.10.16' })), cues: [cue] });
    const view = await render(<TrendsScreen />);
    expect(view.queryByTestId('version-note')).toBeNull();
    expect(view.queryByTestId('older-point')).toBeNull();
  });

  it('Snatch label from a tab route param keeps a failed-only movement honest', async () => {
    load({ sessions: SESSIONS.filter((s) => s.movement === 'snatch') });
    const view = await render(<TrendsScreen initialMovement="clean" />);
    expect(view.getByText('No cleans yet.')).toBeOnTheScreen();
    expect(view.getByText('Film one and it starts here. Trends need two lifts of the same movement.')).toBeOnTheScreen();
  });
});
