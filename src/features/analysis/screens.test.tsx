import { act, fireEvent, render, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { COMPARE_TARGETS, snatchMock, snatchMockLow, snatchMockMiss, snatchSample } from '../../analysis/fixtures';
import CueScreen from './CueScreen';
import PlayerScreen from './PlayerScreen';
import CompareScreen, { syncByPhase } from './CompareScreen';
import MissScreen from './MissScreen';
import ProcessingSheet, { EXPECTED_ANALYSIS_S } from './ProcessingSheet';
import RevealScreen from './RevealScreen';

const nav = { onTry: jest.fn(), onNotForMe: jest.fn(), onBack: jest.fn(), onFilmAgain: jest.fn() };
const noop = () => {};
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => jest.clearAllMocks());

describe('ProcessingSheet', () => {
  const handlers = { onHide: jest.fn(), onNotify: jest.fn(), onKeepWaiting: jest.fn(), onSee: jest.fn() };

  it('lists the pipeline steps with the current one active', async () => {
    const { getByText, queryByText, getAllByTestId } = await render(
      <ProcessingSheet analysis={snatchMock} state="progress" step={2} elapsed={6} {...handlers} />
    );
    expect(getByText('Watching your reps')).toBeOnTheScreen();
    expect(getByText('about 2 min')).toBeOnTheScreen();
    expect(queryByText('usually about 2 min')).toBeNull();
    expect(getAllByTestId('step-done')).toHaveLength(2);
    expect(getAllByTestId('step-active')).toHaveLength(1);
    expect(getAllByTestId('step-todo')).toHaveLength(2);
    await press(getByText('Hide'));
    expect(handlers.onHide).toHaveBeenCalledTimes(1);
  });

  it('expects about 2 minutes and names the queue once the clip is on the server', async () => {
    expect(EXPECTED_ANALYSIS_S).toBe(150);
    const { getByText, queryByText, rerender } = await render(
      <ProcessingSheet analysis={null} state="progress" step={1} elapsed={30} meta="30 s" onServer ahead={0} {...handlers} />
    );
    expect(getByText('usually about 2 min')).toBeOnTheScreen();
    expect(queryByText(/ahead of you/)).toBeNull();
    await rerender(<ProcessingSheet analysis={null} state="progress" step={1} elapsed={31} meta="31 s" onServer ahead={2} {...handlers} />);
    expect(getByText('2 ahead of you')).toBeOnTheScreen();
  });

  it('offers a ping on a long wait', async () => {
    const { getByText } = await render(
      <ProcessingSheet analysis={snatchMock} state="long" step={3} elapsed={190} ahead={1} {...handlers} />
    );
    expect(getByText('Taking longer than usual')).toBeOnTheScreen();
    expect(getByText('190 s')).toBeOnTheScreen();
    expect(getByText('usually about 2 min')).toBeOnTheScreen();
    expect(getByText('1 ahead of you')).toBeOnTheScreen();
    await press(getByText('Notify me'));
    await press(getByText('Keep waiting'));
    expect(handlers.onNotify).toHaveBeenCalledTimes(1);
    expect(handlers.onKeepWaiting).toHaveBeenCalledTimes(1);
  });

  it('summarises when done', async () => {
    const { getByText } = await render(
      <ProcessingSheet analysis={snatchMock} state="done" step={5} elapsed={9} {...handlers} />
    );
    expect(getByText('Done. 3 reps, one cue.')).toBeOnTheScreen();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    await press(getByText('See it'));
    expect(handlers.onSee).toHaveBeenCalledTimes(1);
  });
});

describe('CueScreen', () => {
  it('shows the cue, its why and its evidence', async () => {
    const { getByTestId, getByText } = await render(<CueScreen analysis={snatchMock} nav={nav} />);
    expect(getByTestId('cue-text')).toHaveTextContent('Stay over the bar longer');
    expect(getByText('Clear on all 3 reps')).toBeOnTheScreen();
    expect(getByTestId('cue-baseline')).toHaveTextContent('6 cm today. Your best is 2 cm (18 Sep) and your last five average 7.6 cm.');
    expect(getByTestId('hero-number')).toHaveTextContent('6 cm');
    expect(getByTestId('evidence-readout')).toHaveTextContent('frame 422 · hip · 6 cm fwd · best 2 cm');
    await press(getByText('Try this next session'));
    expect(nav.onTry).toHaveBeenCalledTimes(1);
  });

  it('labels the bundled sample and never quotes the lifter baseline on it', async () => {
    const { getByText, queryByTestId } = await render(<CueScreen analysis={snatchSample} nav={nav} />);
    expect(getByText('SAMPLE LIFT · AI ESTIMATE')).toBeOnTheScreen();
    expect(queryByTestId('cue-baseline')).toBeNull();
  });

  it('opens the why drawer with every measurement and marks the cue', async () => {
    const screen = await render(<CueScreen analysis={snatchMock} nav={nav} />);
    expect(screen.queryByTestId('why-drawer')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Why this?'));
    });
    const drawer = screen.getByTestId('why-drawer');
    expect(within(drawer).getByText('Why this and not something else?')).toBeOnTheScreen();
    expect(within(drawer).getByText('0.12 s · before bar · the cue')).toBeOnTheScreen();
    expect(within(drawer).getByText('not seen')).toBeOnTheScreen();
    expect(within(drawer).getByText('0.21 s · best 0.19')).toBeOnTheScreen();
  });

  // Bot tester (14-10-2026): the "Why this?" sheet could not be dismissed. The scrim is the
  // only way out and a tall sheet can cover it, so the sheet carries its own Close button.
  it('the why drawer closes from its Close button and from the scrim', async () => {
    const screen = await render(<CueScreen analysis={snatchMock} nav={nav} />);
    await press(screen.getByText('Why this?'));
    expect(screen.getByTestId('why-drawer')).toBeOnTheScreen();
    await press(within(screen.getByTestId('why-drawer')).getByTestId('why-close'));
    expect(screen.queryByTestId('why-drawer')).toBeNull();

    await press(screen.getByText('Why this?'));
    await press(screen.getByLabelText('Close'));
    expect(screen.queryByTestId('why-drawer')).toBeNull();
  });

  it('switches to the low-confidence layout with a dashed path', async () => {
    const { getByText, getByTestId } = await render(<CueScreen analysis={snatchMockLow} nav={nav} />);
    expect(getByText('Worth checking, not certain')).toBeOnTheScreen();
    expect(getByText('Seen on 2 of 3 reps and the hip was behind a plate on rep 1.')).toBeOnTheScreen();
    expect(getByText('Bar drifting at the knee')).toBeOnTheScreen();
    expect(getByTestId('dashed-path')).toBeOnTheScreen();
    expect(getByText('dashed path = lower confidence')).toBeOnTheScreen();
    await press(getByText('Film another set'));
    expect(nav.onFilmAgain).toHaveBeenCalledTimes(1);
    await press(getByText('Analyse'));
    expect(nav.onTry).toHaveBeenCalledTimes(1);
  });
});

describe('PlayerScreen', () => {
  const props = { onBack: noop, onCompare: jest.fn(), onShare: noop };

  it('opens on the evidence frame in its phase', async () => {
    const { getByTestId, getByText } = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    expect(getByText('Snatch · 62.5 kg · rep 2')).toBeOnTheScreen();
    expect(getByTestId('frame-number')).toHaveTextContent('422');
    expect(getByTestId('chip-transition')).toBeSelected();
    expect(getByTestId('stage-layer-asset:snatch/3-hip')).toBeOnTheScreen();
  });

  it('jumps to a phase keyframe from its chip with a rigid tick', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    await act(async () => {
      fireEvent.press(getByTestId('chip-turnover'));
    });
    expect(getByTestId('frame-number')).toHaveTextContent('446');
    expect(getByTestId('stage-layer-asset:snatch/5-turnover')).toBeOnTheScreen();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('rigid');
  });

  it('toggles overlays and speed', async () => {
    const { getByTestId, queryByTestId } = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    expect(getByTestId('path-done')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(getByTestId('toggle-path'));
    });
    expect(queryByTestId('path-done')).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId('toggle-strobe'));
    });
    expect(getByTestId('toggle-strobe')).toBeChecked();
    expect(getByTestId('stage-layer-asset:snatch/1-setup')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(getByTestId('speed-0.5'));
    });
    expect(getByTestId('speed-readout')).toHaveTextContent('0.5×');
  });

  it('shows a timing on timed phase chips', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    expect(getByTestId('chip-first_pull')).toHaveTextContent('1ST PULL0.42');
    expect(getByTestId('chip-setup')).toHaveTextContent('SETUP');
  });
});

describe('CompareScreen', () => {
  it('syncs today and the other lift at the same phase', () => {
    const sync = syncByPhase(snatchMock, COMPARE_TARGETS.best.analysis);
    expect(sync.phase).toBe('transition');
    expect(sync.today.frame).toBe(422);
    expect(sync.other.frame).toBe(422);
  });

  it('renders the ghost with deltas against your best', async () => {
    const { getByTestId, getByText } = await render(
      <CompareScreen analysis={snatchMock} target={COMPARE_TARGETS.best} mode="ghost" onMode={noop} onTarget={noop} onBack={noop} />
    );
    expect(getByText('vs Your best · 65 kg · 18 Sep')).toBeOnTheScreen();
    expect(getByTestId('compare-row-bar_drift_hip')).toHaveTextContent('Bar drift at hip6 cm+4 vs best');
    expect(getByTestId('compare-row-pull_time')).toHaveTextContent('Pull time0.59 ssame as best');
    expect(getByTestId('hero-number')).toHaveTextContent('+4 cm');
    expect(getByTestId('sync-caption')).toHaveTextContent('synced at the hip · frame 422 vs 422');
  });

  it('renders side by side against last session with a phase rail', async () => {
    const onMode = jest.fn();
    const { getByTestId, getByText } = await render(
      <CompareScreen analysis={snatchMock} target={COMPARE_TARGETS.last} mode="side" onMode={onMode} onTarget={noop} onBack={noop} />
    );
    expect(getByText('vs Last session · 60 kg · 2 Oct')).toBeOnTheScreen();
    expect(getByTestId('compare-row-bar_drift_hip')).toHaveTextContent('Bar drift at hip6 cm−2 vs last');
    expect(getByTestId('phase-rail')).toHaveTextContent('SETUP1ST PULLHIP2NDTURNCATCHREC');
    await press(getByTestId('compare-mode-ghost'));
    expect(onMode).toHaveBeenCalledWith('ghost');
  });
});

describe('MissScreen', () => {
  it('answers why the lift was missed', async () => {
    const onCompare = jest.fn();
    const { getByText, getByTestId } = await render(
      <MissScreen analysis={snatchMockMiss} onBack={noop} onCompare={onCompare} />
    );
    expect(getByText('Snatch · 67.5 kg · miss')).toBeOnTheScreen();
    expect(getByText('The bar was out front at the turnover')).toBeOnTheScreen();
    const value = snatchMockMiss.cue!.evidence.value;
    expect(getByTestId('evidence-readout')).toHaveTextContent(`frame 446 · turnover · bar ${value} cm in front`);
    await press(getByText('Compare with your make'));
    expect(onCompare).toHaveBeenCalledTimes(1);
  });
});

describe('RevealScreen', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs the storyboard: pops, path, number, cue typed, then hands off', async () => {
    const onDone = jest.fn();
    const { getByTestId, queryByTestId } = await render(<RevealScreen analysis={snatchMock} onDone={onDone} reduceMotion={false} />);
    expect(queryByTestId('reveal-cue')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1700);
    });
    expect(getByTestId('hero-number')).toHaveTextContent('6 cm');
    await act(async () => {
      jest.advanceTimersByTime(1900 - 1700 + 30 * 24 + 10);
    });
    expect(getByTestId('reveal-cue')).toHaveTextContent('Stay over the bar longer');
    const styles = (Haptics.impactAsync as jest.Mock).mock.calls.map((c) => c[0]);
    expect(styles).toEqual(['heavy', 'heavy', 'soft', 'soft', 'rigid', 'rigid']);
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a tap mid-typewriter finishes the cue, the next tap continues', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await render(<RevealScreen analysis={snatchMock} onDone={onDone} reduceMotion={false} />);
    await act(async () => {
      jest.advanceTimersByTime(1900 + 30 * 5);
    });
    expect(getByTestId('reveal-cue')).toHaveTextContent('Stay |');
    await act(async () => {
      fireEvent.press(getByTestId('reveal-screen'));
    });
    expect(getByTestId('reveal-cue')).toHaveTextContent('Stay over the bar longer');
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(getByTestId('reveal-screen'));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('with Reduce Motion shows the whole cue at once without pops', async () => {
    const onDone = jest.fn();
    const { getByTestId, queryByTestId } = await render(<RevealScreen analysis={snatchMock} onDone={onDone} reduceMotion />);
    await act(async () => {
      jest.advanceTimersByTime(1300);
    });
    expect(getByTestId('reveal-cue')).toHaveTextContent('Stay over the bar longer');
    expect((Haptics.impactAsync as jest.Mock).mock.calls.map((c) => c[0])).toEqual(['rigid']);
    expect(queryByTestId('movement-note')).toBeNull();
  });

  // prod 14-10-2026: a clean uploaded with the selector left on snatch came back as a snatch analysis
  it('says so when the clip looked like a different lift than the one chosen', async () => {
    const switched = { ...snatchMock, detectedMovement: { movement: 'clean' as const, confidence: 0.9 }, movementUsed: 'clean' as const };
    const { getByTestId } = await render(<RevealScreen analysis={switched} onDone={jest.fn()} reduceMotion />);
    expect(getByTestId('movement-note')).toHaveTextContent('Looks like a clean, not a snatch. Analysed as a clean.');
    expect(getByTestId('movement-note').props.style.color).toBe('#A39F97');
  });

  it('asks instead when the detection was too weak to switch', async () => {
    const doubt = { ...snatchMock, detectedMovement: { movement: 'clean' as const, confidence: 0.7 }, movementUsed: 'snatch' as const };
    const { getByTestId } = await render(<RevealScreen analysis={doubt} onDone={jest.fn()} reduceMotion />);
    expect(getByTestId('movement-note')).toHaveTextContent('Looks like a clean, not a snatch. Keep as snatch?');
  });
});
