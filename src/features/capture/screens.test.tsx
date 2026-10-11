import { act, fireEvent, render } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { CHECK_HINT, fixedChecker, stubChecker } from './checks';
import { demoClip } from './demo';
import ImportScreen from './ImportScreen';
import ReviewScreen from './ReviewScreen';
import TrimScreen from './TrimScreen';
import ViewfinderScreen from './ViewfinderScreen';

jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    CameraView: View,
    useCameraPermissions: () => [{ granted: true, status: 'granted', canAskAgain: true }, jest.fn()],
  };
});
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    VideoView: View,
    useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) }),
  };
});
jest.mock('expo-speech', () => ({ __esModule: true, speak: jest.fn(), stop: jest.fn(() => Promise.resolve()) }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { availableDiskSpace: 0 } }));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => jest.clearAllMocks());

function viewfinder(overrides: Partial<Parameters<typeof ViewfinderScreen>[0]> = {}) {
  const props = {
    movement: 'snatch' as const,
    onMovement: jest.fn(),
    checker: stubChecker,
    fps: 30,
    freeUsed: 0,
    freeTotal: 3,
    secondsLeft: () => 600,
    originals: 0,
    onDeleteOriginals: jest.fn(),
    onImport: jest.fn(),
    onGuide: jest.fn(),
    onRecorded: jest.fn(),
    camera: false,
    ...overrides,
  };
  return { props, ui: <ViewfinderScreen {...props} /> };
}

describe('Viewfinder', () => {
  it('shows a failing check with its hint and keeps Record enabled', async () => {
    const { ui } = viewfinder({ checker: fixedChecker(['whole_body']) });
    const screen = await render(ui);
    expect(screen.getByTestId('check-whole_body-fail')).toHaveTextContent('✕Whole body in frame');
    expect(screen.getByTestId('check-side_on-pass')).toHaveTextContent('✓Side-on');
    expect(screen.getByTestId('check-light-pass')).toHaveTextContent('✓Light OK');
    expect(screen.getByTestId('check-hint')).toHaveTextContent(CHECK_HINT.whole_body);
    expect(screen.getByTestId('record-button')).toBeEnabled();
    expect(screen.getByTestId('fps-badge')).toHaveTextContent('30 fps');
    expect(screen.getByTestId('free-count')).toHaveTextContent('0 / 3');
  });

  it('has no hint when every check passes', async () => {
    const screen = await render(viewfinder().ui);
    expect(screen.queryByTestId('check-hint')).toBeNull();
  });

  it.each([
    ['snatch', 'silhouette-standing'],
    ['bar_muscle_up', 'silhouette-hanging'],
    ['kipping_hspu', 'silhouette-inverted'],
  ] as const)('matches the silhouette to %s', async (movement, id) => {
    const screen = await render(viewfinder({ movement }).ui);
    expect(screen.getByTestId(id)).toBeOnTheScreen();
  });

  it('changes lift from the selector', async () => {
    const { props, ui } = viewfinder();
    const screen = await render(ui);
    await press(screen.getByTestId('lift-chip'));
    await press(screen.getByTestId('pick-bar_muscle_up'));
    expect(props.onMovement).toHaveBeenCalledWith('bar_muscle_up');
    expect(screen.queryByTestId('lift-sheet')).toBeNull();
  });

  it('counts down out loud, records, and hands back the clip with the checks that were failing', async () => {
    jest.useFakeTimers();
    const { props, ui } = viewfinder({ checker: fixedChecker(['whole_body']) });
    const screen = await render(ui);
    await press(screen.getByTestId('record-button'));
    expect(screen.getByTestId('countdown')).toHaveTextContent('5');
    expect(Speech.speak).toHaveBeenLastCalledWith('5');
    for (let i = 0; i < 5; i++) await tick(1000);
    expect(Speech.speak).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId('record-timer')).toHaveTextContent('00:00');
    expect(screen.getByText('Lift when ready')).toBeOnTheScreen();
    await tick(1000);
    await tick(1000);
    expect(screen.getByTestId('record-timer')).toHaveTextContent('00:02');
    await press(screen.getByTestId('record-button'));
    expect(props.onRecorded).toHaveBeenCalledWith({ uri: null, durationS: 2, overridden: ['whole_body'], mode: 'set' });
    jest.useRealTimers();
  });

  it('warns once a recording passes 30 seconds', async () => {
    const screen = await render(viewfinder({ initial: { kind: 'recording', elapsed: 31 } }).ui);
    expect(screen.getByTestId('too-long')).toHaveTextContent(
      "Over 30 secondsWe analyse one set per clip. Stop here and we'll trim to the reps, or keep going and pick the set on the next screen."
    );
    expect(screen.getByTestId('record-timer')).toHaveTextContent('00:31');
  });

  it('asks before recording when storage is low and offers to clear originals', async () => {
    const { props, ui } = viewfinder({ secondsLeft: () => 40, originals: 12 });
    const screen = await render(ui);
    await press(screen.getByTestId('record-button'));
    expect(screen.getByText('About 40 seconds of 30 fps video left. Catchline keeps your analyses; original clips can go.')).toBeOnTheScreen();
    expect(screen.getByTestId('delete-originals')).toHaveTextContent('Delete 12 original clips, keep analyses');
    await press(screen.getByTestId('delete-originals'));
    expect(props.onDeleteOriginals).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('storage-sheet')).toBeNull();
  });

  it('records anyway from the storage warning', async () => {
    const screen = await render(viewfinder({ secondsLeft: () => 40 }).ui);
    await press(screen.getByTestId('record-button'));
    expect(screen.queryByTestId('delete-originals')).toBeNull();
    await press(screen.getByText('Record anyway'));
    expect(screen.getByTestId('countdown')).toHaveTextContent('5');
  });
});

describe('Review', () => {
  const handlers = () => ({
    onWeight: jest.fn(),
    onMovement: jest.fn(),
    onRetake: jest.fn(),
    onTrim: jest.fn(),
    onAnalyse: jest.fn(),
  });

  it('loops the clip with lift, weight and trim, then analyses', async () => {
    const h = handlers();
    const screen = await render(<ReviewScreen clip={demoClip('ok')} units="kg" weight="62.5" {...h} />);
    expect(screen.getByTestId('review-meta')).toHaveTextContent('00:08 · 30 fps · 3 reps found');
    expect(screen.getByTestId('clip-sample')).toBeOnTheScreen();
    expect(screen.getByTestId('weight-input')).toHaveDisplayValue('62.5');
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('weight-input'), '70kg');
    });
    expect(h.onWeight).toHaveBeenCalledWith('70');
    await press(screen.getByTestId('review-trim'));
    await press(screen.getByText('Analyse'));
    await press(screen.getByTestId('review-retake'));
    expect([h.onTrim, h.onAnalyse, h.onRetake].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('warns when a framing check was overridden but still analyses', async () => {
    const h = handlers();
    const screen = await render(<ReviewScreen clip={demoClip('override')} units="kg" weight="" {...h} />);
    expect(screen.getByTestId('override-note')).toHaveTextContent(
      'Feet were out of frameWe can still measure the bar. Foot position and catch depth will be missing.'
    );
    await press(screen.getByText('Analyse anyway'));
    expect(h.onAnalyse).toHaveBeenCalledTimes(1);
  });

  it('blocks Analyse when the clip stops before the catch', async () => {
    const h = handlers();
    const screen = await render(<ReviewScreen clip={demoClip('cutoff')} units="kg" weight="" {...h} />);
    expect(screen.getByTestId('cut-off-marker')).toHaveTextContent('clip ends here · frame 186');
    expect(screen.getByTestId('review-analyse')).toBeDisabled();
    await press(screen.getByTestId('review-analyse'));
    expect(h.onAnalyse).not.toHaveBeenCalled();
    await press(screen.getByTestId('review-retake-primary'));
    expect(h.onRetake).toHaveBeenCalledTimes(1);
  });

  it('lands a shared clip on review with a movement guess and the frame-rate note', async () => {
    const screen = await render(<ReviewScreen clip={demoClip('share')} units="kg" weight="" {...handlers()} />);
    expect(screen.getByText('from WhatsApp')).toBeOnTheScreen();
    expect(screen.getByTestId('review-meta')).toHaveTextContent('00:11 · 30 fps');
    expect(screen.getByText('Looks like a handstand push-up. Right?')).toBeOnTheScreen();
    expect(screen.getByText('30 fps clip · timing will be rougher than 60')).toBeOnTheScreen();
  });
});

describe('Trim', () => {
  it('shows both handles with times and returns the trim', async () => {
    const onDone = jest.fn();
    const screen = await render(<TrimScreen clip={demoClip('ok')} onCancel={jest.fn()} onDone={onDone} />);
    expect(screen.getByTestId('trim-start-time')).toHaveTextContent('00:01.4');
    expect(screen.getByTestId('trim-length')).toHaveTextContent('6.2 s · 3 reps');
    expect(screen.getByTestId('trim-end-time')).toHaveTextContent('00:07.6');
    await press(screen.getByTestId('trim-done'));
    expect(onDone).toHaveBeenCalledWith({ start: 1.4, end: 7.6 });
  });
});

describe('Import', () => {
  it('suggests a set in a long clip and asks which rep', async () => {
    const h = { onCancel: jest.fn(), onMovement: jest.fn(), onTrim: jest.fn(), onSet: jest.fn(), onRep: jest.fn(), onAnalyse: jest.fn() };
    const screen = await render(<ImportScreen clip={demoClip('import')} {...h} />);
    expect(screen.getByTestId('import-meta')).toHaveTextContent('01:42 · 30 fps');
    expect(screen.getByText('Long clip. We found 4 sets; pick one.')).toBeOnTheScreen();
    expect(screen.getByTestId('set-2')).toHaveTextContent('set 2 · 5 reps');
    expect(screen.getByTestId('set-3')).toHaveTextContent('set 3');
    expect(screen.getAllByTestId(/^rep-/).map((n) => n.props.testID)).toEqual(['rep-1', 'rep-2', 'rep-3', 'rep-4', 'rep-5', 'rep-all']);
    await press(screen.getByTestId('set-3'));
    await press(screen.getByTestId('rep-3'));
    await press(screen.getByText('Analyse set 2'));
    expect(h.onSet).toHaveBeenCalledWith(2);
    expect(h.onRep).toHaveBeenCalledWith(3);
    expect(h.onAnalyse).toHaveBeenCalledTimes(1);
  });
});
