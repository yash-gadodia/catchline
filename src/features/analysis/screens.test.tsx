import { loadLibrary } from '../library/repository';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer } from 'expo-video';
import { COMPARE_TARGETS, demoBest, snatchMock, snatchMockLow, snatchMockMiss, snatchReal, snatchSample } from '../../analysis/fixtures';
import { StyleSheet } from 'react-native';
import EvidenceStage from './EvidenceStage';
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


beforeEach(() => {
  jest.clearAllMocks();
  loadLibrary('seeded');
});

describe('ProcessingSheet', () => {
  const handlers = { onHide: jest.fn(), onNotify: jest.fn(), onKeepWaiting: jest.fn(), onSee: jest.fn() };

  it('lists the pipeline steps with the current one active', async () => {
    const { getByText, getByTestId, queryByText, getAllByTestId } = await render(
      <ProcessingSheet analysis={snatchMock} state="progress" step={2} elapsed={6} {...handlers} />
    );
    expect(getByText('Watching your reps')).toBeOnTheScreen();
    expect(getByTestId('processing-art')).toHaveProp('source', require('../../../assets/art/processing-backdrop.png'));
    expect(getByTestId('processing-art-layer')).toHaveProp('pointerEvents', 'none');
    expect(getByTestId('processing-art')).toHaveProp('resizeMode', 'cover');
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
    const { getByText, getByTestId, queryByText, rerender } = await render(
      <ProcessingSheet analysis={null} state="progress" step={1} elapsed={30} meta="30 s" onServer ahead={0} {...handlers} />
    );
    expect(getByText('usually about 2 min')).toBeOnTheScreen();
    expect(getByTestId('processing-art')).toBeOnTheScreen();
    expect(queryByText(/ahead of you/)).toBeNull();
    await rerender(<ProcessingSheet analysis={null} state="progress" step={1} elapsed={31} meta="31 s" onServer ahead={2} {...handlers} />);
    expect(getByText('2 ahead of you')).toBeOnTheScreen();
  });

  it('plays the lifter’s own clip, muted and looping, behind the steps', async () => {
    const { getByTestId, queryByTestId } = await render(
      <ProcessingSheet analysis={null} clipUri="file:///clips/power-snatch.mov" state="progress" step={0} elapsed={3} {...handlers} />
    );
    expect(useVideoPlayer).toHaveBeenCalledWith('file:///clips/power-snatch.mov', expect.any(Function));
    const player = (useVideoPlayer as jest.Mock).mock.results[0].value;
    expect(player).toMatchObject({ loop: true, muted: true });
    expect(player.play).toHaveBeenCalled();
    expect(getByTestId('processing-clip')).toHaveStyle({ opacity: 0.55 });
    expect(getByTestId('processing-scrim')).toHaveStyle({ backgroundColor: 'rgba(0,0,0,0.35)' });
    expect(queryByTestId('processing-art')).toBeNull();
    expect(queryByTestId('processing-path')).toBeNull();
  });

  it('falls back to the silhouette without a local clip', async () => {
    const { getByTestId, queryByTestId } = await render(
      <ProcessingSheet analysis={null} clipUri={null} state="progress" step={0} elapsed={3} {...handlers} />
    );
    expect(useVideoPlayer).not.toHaveBeenCalled();
    expect(queryByTestId('processing-clip')).toBeNull();
    expect(getByTestId('processing-art')).toBeOnTheScreen();
    expect(getByTestId('processing-path')).toBeOnTheScreen();
  });

  it('draws the silhouette bar path up to the current phase with a pulsing leading dot', async () => {
    const { getByTestId, getAllByTestId, queryAllByTestId, rerender } = await render(
      <ProcessingSheet analysis={null} state="progress" step={0} elapsed={3} reduceMotion={false} {...handlers} />
    );
    expect(queryAllByTestId('processing-path-dot')).toHaveLength(0);
    expect(getByTestId('processing-path-lead')).toBeOnTheScreen();
    await rerender(<ProcessingSheet analysis={null} state="progress" step={2} elapsed={5} reduceMotion={false} {...handlers} />);
    expect(getAllByTestId('processing-path-dot')).toHaveLength(2);
    expect(getByTestId('processing-path-lead')).toBeOnTheScreen();
  });

  it('Reduce Motion over the clip: a still frame and no path', async () => {
    const { getByTestId, queryByTestId } = await render(
      <ProcessingSheet analysis={null} clipUri="file:///clips/power-snatch.mov" state="progress" step={1} elapsed={3} reduceMotion {...handlers} />
    );
    const player = (useVideoPlayer as jest.Mock).mock.results[0].value;
    expect(player.play).not.toHaveBeenCalled();
    expect(player.loop).toBe(false);
    expect(getByTestId('processing-clip')).toBeOnTheScreen();
    expect(queryByTestId('processing-path')).toBeNull();
    expect(queryByTestId('step-active')).toBeOnTheScreen();
  });

  it('Reduce Motion over the silhouette: the whole path, all four phase dots, no pulse', async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = await render(
      <ProcessingSheet analysis={null} state="progress" step={0} elapsed={3} reduceMotion {...handlers} />
    );
    expect(getByTestId('processing-path')).toBeOnTheScreen();
    expect(getAllByTestId('processing-path-dot')).toHaveLength(4);
    expect(queryByTestId('processing-path-lead')).toBeNull();
  });

  it('offers a ping on a long wait', async () => {
    const { getByText, queryByTestId } = await render(
      <ProcessingSheet analysis={snatchMock} state="long" step={3} elapsed={190} ahead={1} {...handlers} />
    );
    expect(getByText('Taking longer than usual')).toBeOnTheScreen();
    expect(queryByTestId('processing-art')).toBeNull();
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

describe('EvidenceStage', () => {
  // The demo's evidence point is the bar at its peak (y 0.10): on a full-bleed
  // stage the number landed ~16 pt from the top, under the status bar.
  it('keeps the hero number below the safe area when the evidence is near the top', async () => {
    const box = { width: 390, height: 390 };
    const { getByTestId, rerender } = await render(<EvidenceStage analysis={demoBest} cue={demoBest.cue!} box={box} />);
    expect(getByTestId('hero-number')).toHaveTextContent('13 cm');
    expect(StyleSheet.flatten(getByTestId('hero-number').props.style).top).toBeCloseTo(15.55, 2);
    await rerender(<EvidenceStage analysis={demoBest} cue={demoBest.cue!} box={box} safeTop={62} />);
    expect(getByTestId('hero-number')).toHaveStyle({ top: 70 });
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
    await press(getByTestId('see-breakdown'));
    expect(nav.onTry).toHaveBeenCalledTimes(1);
  });

  it('low confidence: one primary action that tracks the cue and opens the breakdown', async () => {
    const onKeep = jest.fn(() => expect(nav.onTry).not.toHaveBeenCalled());
    const { getByTestId, queryByTestId, queryByText } = await render(<CueScreen analysis={snatchMockLow} nav={{ ...nav, onKeep }} />);
    expect(getByTestId('see-breakdown')).toHaveTextContent('See the breakdown');
    expect(queryByText('Analyse')).toBeNull();
    expect(queryByText('Film another set')).toBeNull();
    expect(queryByTestId('film-again')).toBeNull();
    await press(getByTestId('see-breakdown'));
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(nav.onTry).toHaveBeenCalledTimes(1);
  });

  it('low confidence from the camera angle offers filming again from the side', async () => {
    const angled = { ...snatchMockLow, cue: { ...snatchMockLow.cue!, confidence: 'low' as const, confidenceText: 'Seen on 1 of 2 reps, filmed ~36° off side-on: film from the side to confirm' } };
    const { getByTestId } = await render(<CueScreen analysis={angled} nav={nav} />);
    expect(getByTestId('film-again')).toHaveTextContent('Film again from the side');
    await press(getByTestId('film-again'));
    expect(nav.onFilmAgain).toHaveBeenCalledTimes(1);
    expect(nav.onTry).not.toHaveBeenCalled();
  });
});

describe('PlayerScreen', () => {
  const props = { onBack: noop, onCompare: jest.fn(), onShare: noop };

  it('opens on Setup even when there is a cue, so the lift plays from the start', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    expect(getByTestId('frame-setup')).toBeSelected();
    expect(getByTestId('player-readout')).toHaveTextContent('388 · setup · 0.47 s');
  });

  it("a deep link to the cue's frame opens on the cue's phase with the cue, its keyframe and its readout", async () => {
    const { getByTestId, getByText } = await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} {...props} />);
    expect(getByText('Snatch · 62.5 kg · rep 2')).toBeOnTheScreen();
    expect(getByTestId('player-readout')).toHaveTextContent('422 · transition · 1.03 s');
    expect(getByTestId('frame-transition')).toBeSelected();
    expect(getByTestId('phase-name')).toHaveTextContent('Transition');
    expect(getByTestId('stage-layer-asset:snatch/3-hip')).toBeOnTheScreen();
    expect(getByTestId('player-cue')).toHaveTextContent(`The cue · AI estimate${snatchMock.cue!.text}`, { exact: false });
  });

  it('opens on Setup when there is no cue', async () => {
    const { getByTestId, queryByTestId } = await render(<PlayerScreen analysis={{ ...snatchMock, cue: null }} {...props} />);
    expect(getByTestId('frame-setup')).toBeSelected();
    expect(getByTestId('player-readout')).toHaveTextContent('388 · setup · 0.47 s');
    expect(queryByTestId('player-cue')).toBeNull();
  });

  it('keeps the peak bar speed hidden until it is validated against a sensor', async () => {
    const { getByTestId, queryByTestId } = await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} {...props} />);
    await press(getByTestId('frame-second_pull'));
    expect(queryByTestId('measure-bar_speed')).toBeNull();
    expect(getByTestId('phase-empty')).toHaveTextContent('Nothing measured in this phase. Lasted 0.18 s.');
  });

  it('jumps to a phase from its filmstrip frame with a rigid tick', async () => {
    const { getByTestId, queryByTestId } = await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} {...props} />);
    await press(getByTestId('frame-turnover'));
    expect(getByTestId('player-readout')).toHaveTextContent('446 · turnover · 1.43 s');
    expect(getByTestId('frame-turnover')).toBeSelected();
    expect(getByTestId('stage-layer-asset:snatch/5-turnover')).toBeOnTheScreen();
    expect(getByTestId('measure-turnover_time')).toHaveTextContent('Turnover time0.21 sbest rep 0.19 s');
    expect(queryByTestId('player-cue')).toBeNull();
    expect(Haptics.impactAsync).toHaveBeenCalledWith('rigid');
  });

  it('steps phase to phase from the chevrons and stops at the ends', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} {...props} />);
    await press(getByTestId('phase-next'));
    expect(getByTestId('frame-second_pull')).toBeSelected();
    expect(getByTestId('player-readout')).toHaveTextContent('436 · 2nd pull · 1.27 s');
    for (let i = 0; i < 3; i++) await press(getByTestId('phase-prev'));
    expect(getByTestId('frame-setup')).toBeSelected();
    expect(getByTestId('phase-prev')).toBeDisabled();
    expect(getByTestId('phase-next')).toBeEnabled();
  });

  it('marks the cue phase with a dot and the phase it follows from with a ring', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchReal} initialFrame={snatchReal.cue!.evidence.frame} {...props} />);
    expect(getByTestId('frame-catch')).toBeSelected();
    expect(getByTestId('frame-catch')).toContainElement(getByTestId('frame-mark-cue'));
    expect(getByTestId('frame-turnover')).toContainElement(getByTestId('frame-mark-follows'));
  });

  it("lists the phase's measurements, the cue first, with the best rep", async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchReal} initialFrame={snatchReal.cue!.evidence.frame} {...props} />);
    expect(getByTestId('measure-jump_forward')).toHaveTextContent('Jumped forwardcue7.4 cm', { exact: false });
    expect(getByTestId('measure-jump_forward')).toHaveTextContent('best rep 4.4 cm', { exact: false });
    expect(getByTestId('measure-bar_peak_height')).toHaveTextContent('Bar peak height125.2 cm', { exact: false });
    await press(getByTestId('frame-turnover'));
    expect(getByTestId('measure-bar_forward_off_hips')).toHaveTextContent('Bar forward off hipsleads to cue13.3 cm', { exact: false });
  });

  it('says when a phase has nothing measured', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchReal} initialFrame={snatchReal.cue!.evidence.frame} {...props} />);
    await press(getByTestId('frame-setup'));
    expect(getByTestId('phase-empty')).toHaveTextContent('Nothing measured in this phase.');
    expect(getByTestId('phase-head')).toHaveTextContent('Setupf 822–851');
  });

  it('toggles overlays and cycles one speed pill', async () => {
    const { getByTestId, queryByTestId } = await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} {...props} />);
    expect(getByTestId('path-done')).toBeOnTheScreen();
    await press(getByTestId('toggle-path'));
    expect(queryByTestId('path-done')).toBeNull();
    await press(getByTestId('toggle-strobe'));
    expect(getByTestId('toggle-strobe')).toBeChecked();
    expect(getByTestId('stage-layer-asset:snatch/1-setup')).toBeOnTheScreen();
    expect(getByTestId('speed')).toHaveTextContent('0.25×');
    await press(getByTestId('speed'));
    expect(getByTestId('speed')).toHaveTextContent('0.5×');
    await press(getByTestId('speed'));
    expect(getByTestId('speed')).toHaveTextContent('1×');
    await press(getByTestId('speed'));
    expect(getByTestId('speed')).toHaveTextContent('0.25×');
  });

  it('says how confident the cue is, with the reason when not high', async () => {
    const clear = await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} {...props} />);
    expect(clear.getByTestId('player-confidence')).toHaveTextContent('Confidence: high');
    const low = await render(<PlayerScreen analysis={snatchMockLow} initialFrame={snatchMockLow.cue!.evidence.frame} {...props} />);
    expect(low.getByTestId('player-confidence')).toHaveTextContent('Confidence: medium · bar partly hidden, seen on 2 of 3 reps');
  });

  it('tapping the video plays and pauses, and stepping a phase pauses', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={snatchMock} initialFrame={snatchMock.cue!.evidence.frame} {...props} />);
    await press(getByTestId('stage-press'));
    expect(getByTestId('stage-press')).toHaveProp('accessibilityLabel', 'Pause');
    expect(getByTestId('player-play')).toHaveProp('accessibilityLabel', 'Pause');
    await press(getByTestId('phase-prev'));
    expect(getByTestId('stage-press')).toHaveProp('accessibilityLabel', 'Play');
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

describe('a missed lift', () => {
  const outcome = (label: string, value: number) => ({ id: 'outcome', label, value, unit: 'cm' as const, frame: snatchMockMiss.cue!.evidence.frame, status: 'normal' as const, note: 'bar vs mid-foot when it left you (+ = in front)' });
  const front = { ...snatchMockMiss, measurements: [...snatchMockMiss.measurements, outcome('Missed forward', 31)] };
  const behind = { ...snatchMockMiss, cue: { ...snatchMockMiss.cue!, confidence: 'low' as const }, measurements: [...snatchMockMiss.measurements, outcome('Missed behind', -12)] };

  it('says so plainly above the cue on the result, the reveal and the player', async () => {
    const result = await render(<CueScreen analysis={front} nav={nav} />);
    expect(result.getByTestId('miss-note')).toHaveTextContent('Missed lift: the bar came down in front.');
    const reveal = await render(<RevealScreen analysis={front} onDone={jest.fn()} reduceMotion />);
    expect(reveal.getByTestId('miss-note')).toHaveTextContent('Missed lift: the bar came down in front.');
    const player = await render(<PlayerScreen analysis={front} onBack={noop} onCompare={jest.fn()} onShare={noop} />);
    expect(player.getByTestId('miss-note')).toHaveTextContent('Missed lift: the bar came down in front.');
  });

  it('names the side on a possible cue and on a held-back one too', async () => {
    const { getByTestId } = await render(<CueScreen analysis={behind} nav={nav} />);
    expect(getByTestId('low-confidence')).toBeOnTheScreen();
    expect(getByTestId('miss-note')).toHaveTextContent('Missed lift: the bar came down behind.');
    const partial = await render(<CueScreen analysis={{ ...behind, cue: null, noCueReason: { code: 'unclear_miss' } }} nav={nav} />);
    expect(partial.getByTestId('partial-result')).toBeOnTheScreen();
    expect(partial.getByTestId('miss-note')).toHaveTextContent('Missed lift: the bar came down behind.');
  });

  it('lets the lifter call it made or missed in one tap, kept over the detection', async () => {
    const { useMadeLog } = require('../library/madeLog');
    useMadeLog.setState({ made: {} });
    const { getByTestId, queryByTestId } = await render(<CueScreen analysis={front} nav={nav} />);
    expect(getByTestId('made-call-missed')).toHaveProp('accessibilityState', { selected: true });
    await press(getByTestId('made-call-made'));
    expect(useMadeLog.getState().made).toEqual({ [front.id]: true });
    expect(getByTestId('made-call-made')).toHaveProp('accessibilityState', { selected: true });
    expect(queryByTestId('miss-note')).toBeNull();
    const clean = await render(<CueScreen analysis={{ ...snatchMock, cue: null }} nav={nav} />);
    expect(clean.getByTestId('made-call-made')).toHaveProp('accessibilityState', { selected: true });
    const sample = await render(<CueScreen analysis={snatchSample} nav={nav} />);
    expect(sample.queryByTestId('made-call')).toBeNull();
  });

  it('says nothing on a made lift', async () => {
    const { queryByTestId } = await render(<CueScreen analysis={snatchMock} nav={nav} />);
    expect(queryByTestId('miss-note')).toBeNull();
  });
});
