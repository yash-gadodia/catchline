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
