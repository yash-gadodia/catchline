import { act, fireEvent, render } from '@testing-library/react-native';
import { snatchMock, snatchMockPathOnly, snatchMockTracked } from '../../analysis/fixtures';
import type { Analysis } from '../../analysis/types';
import { loadLibrary } from '../library/repository';
import CueScreen from './CueScreen';
import PathReplay from './PathReplay';
import PlayerScreen from './PlayerScreen';
import RevealScreen from './RevealScreen';
import ResultNumbers, { resultNumbers } from './ResultNumbers';

const nav = { onTry: jest.fn(), onNotForMe: jest.fn(), onBack: jest.fn(), onFilmAgain: jest.fn() };
const noop = () => {};
const box = { width: 390, height: 390 };
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => loadLibrary('seeded'));

describe('the joint tracks on the result hero', () => {
  it('draws the hip and shoulder lines, the feet marks with their shift and the hip-height curve beside the bar path', async () => {
    const view = await render(<PathReplay analysis={snatchMockTracked} rep={snatchMockTracked.reps[1]} box={box} pathTestID="hero-path" reduceMotion />);
    for (const id of ['hero-path', 'track-hips', 'track-shoulders', 'feet-marks', 'hip-curve', 'hip-curve-now', 'track-legend']) expect(view.getByTestId(id)).toBeOnTheScreen();
    expect(view.getByTestId('feet-shift').props.children.props.children).toBe('3.2 cm forward');
    expect(['bar', 'hips', 'shoulders', 'feet'].map((k) => view.getByTestId(`legend-${k}`).props.accessibilityState.selected)).toEqual([true, true, true, true]);
  });

  it('hides a track with its legend chip and brings it back with the next tap', async () => {
    const view = await render(<PathReplay analysis={snatchMockTracked} rep={snatchMockTracked.reps[1]} box={box} pathTestID="hero-path" reduceMotion />);
    await press(view.getByTestId('legend-hips'));
    expect(view.queryByTestId('track-hips')).toBeNull();
    expect(view.queryByTestId('hip-curve')).toBeNull();
    expect(view.getByTestId('legend-hips').props.accessibilityState.selected).toBe(false);
    expect(view.getByTestId('track-shoulders')).toBeOnTheScreen();
    await press(view.getByTestId('legend-bar'));
    expect(view.queryByTestId('hero-path')).toBeNull();
    await press(view.getByTestId('legend-hips'));
    expect(view.getByTestId('track-hips')).toBeOnTheScreen();
  });

  it('draws nothing new on an analysis made before tracks', async () => {
    const view = await render(<PathReplay analysis={snatchMock} rep={snatchMock.reps[1]} box={box} pathTestID="hero-path" reduceMotion />);
    expect(view.getByTestId('hero-path')).toBeOnTheScreen();
    for (const id of ['track-hips', 'track-shoulders', 'feet-marks', 'hip-curve', 'track-legend']) expect(view.queryByTestId(id)).toBeNull();
  });
});

describe('the track readings under the path', () => {
  it('list the feet shift, hip rise, bar over shoulder, knee at the catch and elbow bend', () => {
    expect(resultNumbers(snatchMockTracked).map((r) => `${r.label}: ${r.value}`)).toEqual([
      'Feet: 3.2 cm forward',
      'Hip rise: 30.9 cm',
      'Bar over shoulder: 1.4 cm behind',
      'Knee at catch: 39°',
      'Elbow bend in pull: 8°',
      'Peak bar speed: 1.82 m/s',
    ]);
  });

  it('say why the forward and back numbers are missing past 45 deg off side-on', async () => {
    const angled: Analysis = {
      ...snatchMockTracked,
      yawBucket: '45-60',
      noCueReason: { code: 'off_side_on', offSideDeg: 52 },
      keyNumbers: ['hip_rise', 'knee_catch', 'elbow_pull'],
    };
    const view = await render(<ResultNumbers analysis={angled} />);
    expect(view.getByTestId('off-side-note')).toHaveTextContent("Filmed about 52° off side-on, so forward and back distances aren't shown.");
    expect(view.queryByTestId('result-number-jump_forward')).toBeNull();
    expect(view.getByTestId('result-number-knee_catch')).toHaveTextContent(/39°$/);
    const side = await render(<ResultNumbers analysis={snatchMockTracked} />);
    expect(side.queryByTestId('off-side-note')).toBeNull();
    expect(side.getByTestId('result-number-jump_forward')).toHaveTextContent(/3.2 cm forward$/);
  });
});

describe('a path-only result', () => {
  it('shows the tracked lines under a "Path only" label, why, and the next step, with no cue text and no made call', async () => {
    const view = await render(<CueScreen analysis={snatchMockPathOnly} nav={nav} />);
    expect(view.getByTestId('path-only-result')).toHaveTextContent(/PATH ONLY · COULDN'T FIND THE PHASES/);
    expect(view.getByTestId('no-cue-reason')).toHaveTextContent('No whole lift was found in this clip, so there are no phases and no cue. The bar, feet and hips are tracked above.');
    expect(view.getByTestId('no-cue-tip')).toHaveTextContent('Film the whole lift from the side, from the setup until you stand.');
    for (const id of ['partial-path', 'track-hips', 'feet-marks', 'hip-curve']) expect(view.getByTestId(id)).toBeOnTheScreen();
    for (const id of ['no-cue-title', 'cue-text', 'made-call-row', 'result-numbers', 'guide-knee', 'guide-hip', 'guide-peak']) expect(view.queryByTestId(id)).toBeNull();
    expect(view.queryByText('No cue this time')).toBeNull();
    expect(view.queryByTestId('feet-shift')).toBeNull();
    const held = await render(<PathReplay analysis={snatchMockPathOnly} rep={snatchMockPathOnly.reps[0]} box={box} pathTestID="hero-path" reduceMotion />);
    expect(held.getByTestId('guide-ring')).toBeOnTheScreen();
    expect(held.getByTestId('stage-layer-asset:snatch/5-turnover')).toBeOnTheScreen();
  });

  it('names the camera angle when that was the gate', async () => {
    const angled: Analysis = { ...snatchMockPathOnly, noCueReason: { code: 'path_only', gate: 'not_side_on', offSideDeg: 70 }, yawBucket: 'past_60' };
    const view = await render(<CueScreen analysis={angled} nav={nav} />);
    expect(view.getByTestId('no-cue-reason')).toHaveTextContent(
      "Filmed about 70° off side-on, so the phases couldn't be read and forward and back distances aren't shown. The bar, feet and hips are tracked above."
    );
    expect(view.getByTestId('no-cue-tip')).toHaveTextContent('Film from the side, phone level with the bar.');
    expect(view.getByTestId('track-hips')).toBeOnTheScreen();
  });

  it('plays in the player with no phases to step through', async () => {
    const view = await render(<PlayerScreen analysis={snatchMockPathOnly} onBack={noop} onShare={noop} />);
    expect(view.getByTestId('player-screen')).toBeOnTheScreen();
  });
});

describe('RevealScreen on a path-only result', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('pops the setup and the peak, draws the path and types "Path only"', async () => {
    const onDone = jest.fn();
    const screen = await render(<RevealScreen analysis={snatchMockPathOnly} onDone={onDone} reduceMotion={false} />);
    expect(screen.getByTestId('strobe-setup')).toBeOnTheScreen();
    expect(screen.getByTestId('strobe-peak')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('hero-number')).toBeNull();
    expect(screen.getByTestId('reveal-cue')).toHaveTextContent('Path only');
    expect(screen.queryByText('No cue this time')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
