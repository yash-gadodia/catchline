import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { snatchMock } from '../../analysis/fixtures';
import CueScreen from '../analysis/CueScreen';
import PlayerScreen from '../analysis/PlayerScreen';
import CueDetailScreen from '../library/CueDetailScreen';
import { loadLibrary } from '../library/repository';
import { useLibraryStore } from '../library/store';
import { supabase } from '../../lib/supabase';
import { drillsFlag, resetDrillsFlag } from './flag';

const noop = () => undefined;

function setDev(v: boolean) {
  (global as unknown as { __DEV__: boolean }).__DEV__ = v;
}

beforeEach(() => {
  resetDrillsFlag();
  setDev(true);
  loadLibrary('seeded');
  const maybeSingle = jest.fn(async () => ({ data: { enabled: false }, error: null }));
  jest.spyOn(supabase, 'from').mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) } as unknown as ReturnType<typeof supabase.from>);
});
afterEach(() => {
  setDev(true);
  jest.restoreAllMocks();
});

describe('drill card on the cue screens', () => {
  it('cue screen shows the drill for the headline fault and expands it', async () => {
    await render(<CueScreen analysis={snatchMock} nav={{ onTry: noop, onNotForMe: noop, onBack: noop, onFilmAgain: noop }} />);
    expect(screen.getByTestId('drill-name')).toHaveTextContent('Pause deadlift at lift-off and the knee');
    await act(async () => {
      fireEvent.press(screen.getByTestId('drill-card'));
    });
    expect(screen.getByText('Stand up, then lower under control.')).toBeOnTheScreen();
  });

  it('player shows the same drill under its cue', async () => {
    await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} onBack={noop} onShare={noop} />);
    expect(screen.getByTestId('drill-name')).toHaveTextContent('Pause deadlift at lift-off and the knee');
  });

  it('cue detail shows the drill for its fault', async () => {
    const seeded = useLibraryStore.getState().cues.find((c) => c.id === 'c-stay-over')!;
    await render(
      <CueDetailScreen cue={{ ...seeded, metricId: 'leg_kip' }} nav={{ onBack: noop, onStuck: noop, onDidntStick: noop, onDrop: noop }} />
    );
    expect(screen.getByTestId('drill-name')).toHaveTextContent('Kip swing with a towel between the feet');
  });

  it('a cue whose fault has no drill shows no card', async () => {
    const seeded = useLibraryStore.getState().cues.find((c) => c.id === 'c-stay-over')!;
    await render(<CueDetailScreen cue={{ ...seeded, metricId: 'bar_drift_hip' }} nav={{ onBack: noop, onStuck: noop, onDidntStick: noop, onDrop: noop }} />);
    expect(screen.queryByTestId('drill-card')).toBeNull();
  });

  it('release build with the flag off: the cue screen ships without the card', async () => {
    setDev(false);
    await render(<CueScreen analysis={snatchMock} nav={{ onTry: noop, onNotForMe: noop, onBack: noop, onFilmAgain: noop }} />);
    await act(async () => {
      await drillsFlag();
    });
    expect(screen.getByTestId('cue-text')).toBeOnTheScreen();
    expect(screen.queryByTestId('drill-card')).toBeNull();
  });
});

describe('one drill line under each cue', () => {
  const FAULTS = require('../../../cv/catchline_cv/rules.json').FAULTS as Record<string, string[]>;
  const nav = { onTry: noop, onNotForMe: noop, onBack: noop, onFilmAgain: noop };

  it('has a line for every fault of the snatch, clean, jerk, pull-up and bar muscle-up', () => {
    const { isKey } = require('../../i18n');
    const ids = ['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up'].flatMap((m) => FAULTS[m]);
    expect(ids.filter((id) => !isKey(`drills.line.${id}`))).toEqual([]);
  });

  it('release build: the result, the player and the cue detail show "Drill: ..." under the cue', async () => {
    setDev(false);
    await render(<CueScreen analysis={snatchMock} nav={nav} />);
    expect(screen.getByTestId('drill-line')).toHaveTextContent('Drill: halting deadlift, pause at the knee');
    expect(screen.queryByTestId('drill-card')).toBeNull();
    await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} onBack={noop} onShare={noop} />);
    expect(screen.getByTestId('drill-line')).toHaveTextContent('Drill: halting deadlift, pause at the knee');
    const seeded = useLibraryStore.getState().cues.find((c) => c.id === 'c-stay-over')!;
    await render(<CueDetailScreen cue={{ ...seeded, metricId: 'slow_turnover' }} nav={{ onBack: noop, onStuck: noop, onDidntStick: noop, onDrop: noop }} />);
    expect(screen.getByTestId('drill-line')).toHaveTextContent('Drill: tall snatch');
  });

  it('gives way to the full drill card where that shows, and says nothing for a fault without one', async () => {
    await render(<CueScreen analysis={snatchMock} nav={nav} />);
    expect(screen.getByTestId('drill-card')).toBeOnTheScreen();
    expect(screen.queryByTestId('drill-line')).toBeNull();
    setDev(false);
    const seeded = useLibraryStore.getState().cues.find((c) => c.id === 'c-stay-over')!;
    await render(<CueDetailScreen cue={{ ...seeded, metricId: 'bar_drift_hip' }} nav={{ onBack: noop, onStuck: noop, onDidntStick: noop, onDrop: noop }} />);
    expect(screen.queryByTestId('drill-line')).toBeNull();
  });

  it('a low-confidence cue keeps its label and gets its drill line too', async () => {
    setDev(false);
    const { snatchMockLow } = require('../../analysis/fixtures');
    const low = { ...snatchMockLow, cue: { ...snatchMockLow.cue, faultId: 'bar_forward_off_hips', confidence: 'low' } };
    await render(<CueScreen analysis={low} nav={nav} />);
    expect(screen.getByTestId('confidence-banner')).toHaveTextContent(/^Low confidence/);
    expect(screen.getByTestId('drill-line')).toHaveTextContent('Drill: hang snatch or clean from the hip');
  });
});
