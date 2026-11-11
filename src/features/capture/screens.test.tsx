import { act, fireEvent, render } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { checkHint, fixedChecker, stubChecker } from './checks';
import { demoClip } from './demo';
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
    expect(screen.getByTestId('check-side_on-pass')).toHaveTextContent('✓Film from the side');
    expect(screen.getByTestId('check-light-pass')).toHaveTextContent('✓Good light');
    expect(screen.getByTestId('check-hint')).toHaveTextContent(checkHint('whole_body'));
    expect(screen.getByTestId('record-button')).toBeEnabled();
    expect(screen.getByTestId('fps-badge')).toHaveTextContent('30 fps');
    expect(screen.getByTestId('free-count')).toHaveTextContent('0 / 3');
  });

  it('shows the three items as plain guidance, no tick and no hint, while there is no real detection', async () => {
    const screen = await render(viewfinder().ui);
    expect(screen.getByTestId('check-whole_body-guide')).toHaveTextContent(/^Whole body in frame$/);
    expect(screen.getByTestId('check-side_on-guide')).toHaveTextContent(/^Film from the side$/);
    expect(screen.getByTestId('check-light-guide')).toHaveTextContent(/^Good light$/);
    expect(screen.queryByText('✓')).toBeNull();
    expect(screen.queryByTestId('check-whole_body-pass')).toBeNull();
    expect(screen.queryByTestId('check-hint')).toBeNull();
    expect(screen.getByTestId('record-button')).toBeEnabled();
  });

  it('has no movement to pick: no lift selector, no reps mode, no silhouette, just the framing line', async () => {
    const screen = await render(viewfinder().ui);
    expect(screen.queryByTestId('lift-chip')).toBeNull();
    expect(screen.queryByTestId('reps-mode')).toBeNull();
    expect(screen.queryByTestId('silhouette-standing')).toBeNull();
    expect(screen.getByTestId('framing-guide')).toHaveTextContent('Whole body and bar in frame, phone still');
  });

  it('counts down out loud, records, and hands back the clip with the checks that were failing', async () => {
    jest.useFakeTimers();
    const { props, ui } = viewfinder({ checker: fixedChecker(['whole_body']) });
    const screen = await render(ui);
    await press(screen.getByTestId('record-button'));
    expect(screen.getByTestId('countdown')).toHaveTextContent('5');
    expect(Speech.speak).toHaveBeenLastCalledWith('5', { language: 'en' });
    for (let i = 0; i < 5; i++) await tick(1000);
    expect(Speech.speak).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId('record-timer')).toHaveTextContent('00:00');
    expect(screen.getByText('Go when ready')).toBeOnTheScreen();
    expect(screen.getByText('tap stop when you are done')).toBeOnTheScreen();
    await tick(1000);
    await tick(1000);
    expect(screen.getByTestId('record-timer')).toHaveTextContent('00:02');
    await press(screen.getByTestId('record-button'));
    expect(props.onRecorded).toHaveBeenCalledWith({ uri: null, durationS: 2, overridden: ['whole_body'] });
    jest.useRealTimers();
  });

  it('warns once a recording passes 30 seconds', async () => {
    const screen = await render(viewfinder({ initial: { kind: 'recording', elapsed: 31 } }).ui);
    expect(screen.getByTestId('too-long')).toHaveTextContent(
      'Over 30 secondsLong clips take longer to track. Stop here; you can trim it on the next screen.'
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

const trimProps = () => ({ units: 'kg' as const, weight: '', onWeight: jest.fn(), onCancel: jest.fn(), onTrack: jest.fn() });

describe('Trim', () => {
  it('shows both handles with times, takes the load, and Track hands back the trim', async () => {
    const props = trimProps();
    const screen = await render(<TrimScreen clip={demoClip('ok')} {...props} />);
    expect(screen.getByTestId('trim-start-time')).toHaveTextContent('00:01.4');
    expect(screen.getByTestId('trim-length')).toHaveTextContent(/^6\.2 s$/);
    expect(screen.getByTestId('trim-end-time')).toHaveTextContent('00:07.6');
    expect(screen.queryByTestId('lift-chip')).toBeNull();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('weight-input'), '62,5kg');
    });
    expect(props.onWeight).toHaveBeenCalledWith('62,5');
    expect(screen.getByTestId('trim-track')).toHaveTextContent('Track');
    await press(screen.getByTestId('trim-track'));
    expect(props.onTrack).toHaveBeenCalledWith({ start: 1.4, end: 7.6 });
  });

  it('steps each handle a tenth of a second with ‹ and ›, and by VoiceOver', async () => {
    const props = trimProps();
    const screen = await render(<TrimScreen clip={demoClip('ok')} {...props} />);
    await press(screen.getByTestId('trim-start-later'));
    await press(screen.getByTestId('trim-end-earlier'));
    expect(screen.getByTestId('trim-start-time')).toHaveTextContent('00:01.5');
    expect(screen.getByTestId('trim-end-time')).toHaveTextContent('00:07.5');
    await act(async () => fireEvent(screen.getByTestId('trim-strip'), 'layout', { nativeEvent: { layout: { width: 300 } } }));
    expect(screen.getByTestId('trim-start')).toHaveProp('accessibilityValue', { text: '00:01.5' });
    await act(async () => fireEvent(screen.getByTestId('trim-start'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }));
    await press(screen.getByTestId('trim-track'));
    expect(props.onTrack).toHaveBeenCalledWith({ start: 1.6, end: 7.5 });
  });

  it('warns on a long trim and blocks one too long to track', async () => {
    const long = { ...demoClip('ok'), durationS: 120, trim: { start: 0, end: 30 } };
    const view = await render(<TrimScreen clip={long} {...trimProps()} />);
    expect(view.getByTestId('trim-problem')).toHaveTextContent('Long clip. Trim to just the lift and it tracks faster.');
    expect(view.getByTestId('trim-track')).toBeEnabled();
    const blockedProps = trimProps();
    const blocked = await render(<TrimScreen clip={{ ...long, trim: { start: 0, end: 100 } }} {...blockedProps} />);
    expect(blocked.getByTestId('trim-problem')).toHaveTextContent('Too long to track. Trim to 86 s or less.');
    expect(blocked.getByTestId('trim-track')).toBeDisabled();
    await press(blocked.getByTestId('trim-track'));
    expect(blockedProps.onTrack).not.toHaveBeenCalled();
  });
});
