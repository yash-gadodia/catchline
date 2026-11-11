import { act, fireEvent, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVideoPlayer } from 'expo-video';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { snatchMock } from '../../analysis/fixtures';
import { DEFAULT_OVERLAYS, useOverlays } from './overlayPrefs';
import TrackerScreen from './TrackerScreen';

const CLIP = 'file:///documents/lifts/a/clip.mp4';
const whole: Analysis = { ...snatchMock, video: { ...snatchMock.video, width: 1080, height: 1920, fps: 60, frameCount: 300 } };
const marked: Analysis = { ...whole, lift: { startFrame: 90, endFrame: 240 } };
const row = new Array<number | null>(32).fill(null).map((_, i) => (i < 4 ? 0.5 : null));
const body: Body = { version: 1, frames: Array.from({ length: 300 }, () => row) };

type Fake = { play: jest.Mock; pause: jest.Mock; playing: boolean; duration: number; currentTime?: number; emit: (event: string, payload: object) => void };
let player: Fake | null = null;

beforeEach(() => {
  player = null;
  useOverlays.setState(DEFAULT_OVERLAYS);
  jest.mocked(useVideoPlayer).mockImplementation(((_source: unknown, setup?: (p: Fake) => void) => {
    if (player) return player;
    const listeners: Record<string, ((payload: object) => void)[]> = {};
    const made: Fake & { addListener: (event: string, fn: (payload: object) => void) => { remove: () => void } } = {
      playing: false,
      duration: 0,
      play: jest.fn(() => {
        made.playing = true;
      }),
      pause: jest.fn(() => {
        made.playing = false;
      }),
      addListener: (event, fn) => {
        (listeners[event] ??= []).push(fn);
        return { remove: () => void listeners[event].splice(listeners[event].indexOf(fn), 1) };
      },
      emit: (event, payload) => [...(listeners[event] ?? [])].forEach((fn) => fn(payload)),
    };
    setup?.(made);
    player = made;
    return made;
  }) as unknown as typeof useVideoPlayer);
});

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};
const at = async (frame: number) => {
  await act(async () => {
    player?.emit('timeUpdate', { currentTime: (frame + 0.5) / 60 });
  });
};
const show = (analysis: Analysis, b: Body | null = body) => render(<TrackerScreen analysis={analysis} clipUri={CLIP} body={b} title="11 Nov, 14:32" onBack={() => {}} />);

describe('TrackerScreen on a clip with the lift marked', () => {
  it('opens on the first frame of the lift, timed from the start of the lift', async () => {
    const { getByTestId } = await show(marked);
    expect(getByTestId('tracker-readout')).toHaveTextContent('0.00 s · 91 / 300');
    expect(player?.currentTime).toBeCloseTo(90.5 / 60, 6);
    // the clip's first frame arriving before the seek lands does not move it off the lift
    await at(0);
    expect(getByTestId('tracker-readout')).toHaveTextContent('0.00 s · 91 / 300');
    await at(162);
    expect(getByTestId('tracker-readout')).toHaveTextContent('1.20 s · 163 / 300');
  });

  it('stops on the last frame of the lift, not one past it', async () => {
    const { getByTestId } = await show(marked);
    await press(getByTestId('tracker-play'));
    expect(player?.play).toHaveBeenCalledTimes(1);
    await at(239);
    expect(player?.pause).not.toHaveBeenCalled();
    await at(240);
    expect(player?.pause).toHaveBeenCalledTimes(1);
    expect(getByTestId('tracker-readout')).toHaveTextContent('2.50 s · 241 / 300');
  });

  it('comes back to the last frame when the clip ran a frame past it', async () => {
    const { getByTestId } = await show(marked);
    await press(getByTestId('tracker-play'));
    await at(239);
    await at(241);
    expect(player?.pause).toHaveBeenCalledTimes(1);
    expect(player?.currentTime).toBeCloseTo(240.5 / 60, 6);
    expect(getByTestId('tracker-readout')).toHaveTextContent('2.50 s · 241 / 300');
  });

  it('plays again from the first frame, ignoring the times still arriving from the end', async () => {
    const { getByTestId } = await show(marked);
    await press(getByTestId('tracker-play'));
    await at(240);
    await press(getByTestId('tracker-play'));
    expect(player?.currentTime).toBeCloseTo(90.5 / 60, 6);
    expect(getByTestId('tracker-readout')).toHaveTextContent('0.00 s · 91 / 300');
    await at(240);
    expect(player?.pause).toHaveBeenCalledTimes(1);
    await at(91);
    expect(getByTestId('tracker-readout')).toHaveTextContent('0.02 s · 92 / 300');
    await at(240);
    expect(player?.pause).toHaveBeenCalledTimes(2);
  });

  it('shows the whole clip on request, timed from its start, and returns to the lift from outside it', async () => {
    const { getByTestId } = await show(marked);
    await press(getByTestId('toggle-whole'));
    expect(getByTestId('tracker-readout')).toHaveTextContent('91 / 300 · 1.50 s');
    await at(10);
    expect(getByTestId('tracker-readout')).toHaveTextContent('11 / 300 · 0.17 s');
    await press(getByTestId('toggle-whole'));
    expect(getByTestId('tracker-readout')).toHaveTextContent('0.00 s · 91 / 300');
    expect(player?.currentTime).toBeCloseTo(90.5 / 60, 6);
  });
});

describe('TrackerScreen on a clip with no lift marked', () => {
  it('starts at the first frame with no whole-clip chip', async () => {
    const { getByTestId, queryByTestId } = await show(whole);
    expect(getByTestId('tracker-readout')).toHaveTextContent('1 / 300 · 0.00 s');
    expect(queryByTestId('toggle-whole')).toBeNull();
    expect(player?.currentTime).toBeUndefined();
  });
});

describe('TrackerScreen overlays', () => {
  it('draws the bar path and the body together by default', async () => {
    const { getByTestId, queryByTestId } = await show(whole);
    await at(snatchMock.reps[0].path[snatchMock.reps[0].path.length - 1].frame);
    expect(getByTestId('path-done')).toBeOnTheScreen();
    expect(getByTestId('tracker-body')).toBeOnTheScreen();
    expect(getByTestId('tracker-lines')).toBeOnTheScreen();
    expect(queryByTestId('angle-knee')).toBeNull();
  });

  it("remembers the lifter's toggles for the next lift, and on the phone", async () => {
    const first = await show(whole);
    await press(first.getByTestId('toggle-body'));
    expect(first.queryByTestId('tracker-body')).toBeNull();
    await first.unmount();
    player = null;
    const next = await show({ ...marked, id: 'another' });
    expect(next.queryByTestId('tracker-body')).toBeNull();
    expect(next.getByTestId('tracker-lines')).toBeOnTheScreen();
    expect(JSON.parse((await AsyncStorage.getItem('catchline.tracker.overlays')) ?? '{}').state).toEqual({ path: true, lines: true, body: false, angles: false });
  });
});
