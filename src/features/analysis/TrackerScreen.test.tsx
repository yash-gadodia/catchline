import { act, fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
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
const show = (analysis: Analysis, b: Body | null = body, more: Partial<Parameters<typeof TrackerScreen>[0]> = {}) =>
  render(<TrackerScreen analysis={analysis} clipUri={CLIP} body={b} title="11 Nov, 14:32" onBack={() => {}} {...more} />);

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

  it('opens every lift with the path, lines and body on; only angles carry over', async () => {
    const first = await show(whole);
    await press(first.getByTestId('toggle-body'));
    await press(first.getByTestId('toggle-angles'));
    expect(first.queryByTestId('tracker-body')).toBeNull();
    await first.unmount();
    player = null;
    const next = await show({ ...marked, id: 'another' });
    expect(next.getByTestId('tracker-body')).toBeOnTheScreen();
    expect(next.getByTestId('tracker-lines')).toBeOnTheScreen();
    expect(JSON.parse((await AsyncStorage.getItem('catchline.tracker.overlays')) ?? '{}').state).toEqual({ path: true, lines: true, body: true, angles: true });
  });
});

describe('TrackerScreen bar speed', () => {
  // the plate 0.05 of the picture tall in radius (4.5 m to the picture's height) at 60 fps: rising 0.002 of the
  // height a frame to frame 170 (0.54 m/s), then 0.004 a frame (1.08 m/s)
  const path = Array.from({ length: 151 }, (_, i) => {
    const frame = 90 + i;
    const y = frame <= 170 ? 0.8 - 0.002 * (frame - 90) : 0.64 - 0.004 * (frame - 170);
    return { frame, x: 0.5, y, src: 'plate' as const, r: 0.05 };
  });
  const measured: Analysis = { ...marked, reps: [{ ...marked.reps[0], path }] };

  it('shows the speed at the playhead and the lift’s peak, in m/s', async () => {
    const { getByTestId } = await show(measured);
    await at(120);
    expect(getByTestId('tracker-speed')).toHaveTextContent('0.54 m/s · peak 1.08');
    await at(200);
    expect(getByTestId('tracker-speed')).toHaveTextContent('1.08 m/s · peak 1.08');
  });

  it('charts the speed under the controls, with the rep in numbers', async () => {
    const { getByTestId } = await show(measured);
    await at(120);
    expect(getByTestId('speed-chart')).toBeOnTheScreen();
    // the path is coloured by speed: at frame 120 the bar is at half the lift's fastest, the second step of four
    expect(getByTestId('path-heat-2')).toBeOnTheScreen();
    expect(getByTestId('speed-stats')).toHaveTextContent(/^now 0\.54 · avg up 0\.\d\d · min 0\.54 · max 1\.08 m\/s$/);
  });

  it('shows no speed on a lift whose plate was not measured', async () => {
    const { queryByTestId } = await show(marked);
    expect(queryByTestId('tracker-speed')).toBeNull();
    expect(queryByTestId('speed-chart')).toBeNull();
  });
});

describe('TrackerScreen first look (reveal)', () => {
  // the bar is highest at frame 200 of a lift that runs 90..240
  const path = [90, 150, 200, 240].map((frame, i) => ({ frame, x: 0.5, y: [0.8, 0.5, 0.2, 0.3][i], src: 'plate' as const }));
  const lifted: Analysis = { ...marked, reps: [{ ...marked.reps[0], path }] };

  it('plays the lift by itself at half speed with the path and body on', async () => {
    useOverlays.setState({ path: false, body: false });
    const { getByTestId, queryByTestId } = await show(lifted, body, { reveal: true, onShare: () => {} });
    expect(player?.play).toHaveBeenCalledTimes(1);
    expect(player).toMatchObject({ playbackRate: 0.5 });
    expect(getByTestId('speed')).toHaveTextContent('0.5×');
    for (const [label, rate] of [['1×', 1], ['2×', 2], ['4×', 4], ['0.25×', 0.25], ['0.5×', 0.5]] as const) {
      await act(async () => fireEvent.press(getByTestId('speed')));
      expect(getByTestId('speed')).toHaveTextContent(label);
      expect(player).toMatchObject({ playbackRate: rate });
    }
    await at(150);
    expect(getByTestId('path-done')).toBeOnTheScreen();
    expect(getByTestId('tracker-body')).toBeOnTheScreen();
    expect(queryByTestId('tracker-share')).toBeNull();
    expect(useOverlays.getState()).toMatchObject({ path: true, body: true });
  });

  it('ticks once at the top of the lift, stops on the last frame and offers Share', async () => {
    const onShare = jest.fn();
    const { getByTestId } = await show(lifted, body, { reveal: true, onShare });
    const taps = () => jest.mocked(Haptics.impactAsync).mock.calls.length;
    const before = taps();
    await at(199);
    expect(taps()).toBe(before);
    await at(200);
    await at(201);
    expect(taps()).toBe(before + 1);
    await at(240);
    expect(player?.pause).toHaveBeenCalledTimes(1);
    expect(getByTestId('tracker-readout')).toHaveTextContent('2.50 s · 241 / 300');
    await press(getByTestId('tracker-share'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('with Reduce Motion opens on the last frame with the whole path and Share, and does not play', async () => {
    const { getByTestId } = await show(lifted, body, { reveal: true, reduceMotion: true, onShare: () => {} });
    expect(player?.play).not.toHaveBeenCalled();
    expect(player?.currentTime).toBeCloseTo(240.5 / 60, 6);
    expect(getByTestId('tracker-readout')).toHaveTextContent('2.50 s · 241 / 300');
    expect(getByTestId('path-done')).toBeOnTheScreen();
    expect(getByTestId('tracker-share')).toBeOnTheScreen();
  });

  it('a tap while it plays hands the player back to the lifter', async () => {
    const { getByTestId } = await show(lifted, body, { reveal: true, onShare: () => {} });
    await act(async () => {
      player?.emit('playingChange', { isPlaying: true });
    });
    await at(120);
    await press(getByTestId('tracker-video'));
    expect(player?.pause).toHaveBeenCalledTimes(1);
    expect(getByTestId('tracker-share')).toBeOnTheScreen();
  });
});

describe('TrackerScreen compare with the last lift', () => {
  const lastLift = { id: 'earlier', title: '9 Nov, 18:05', points: [{ x: 0.5, y: 0.8 }, { x: 0.52, y: 0.4 }, { x: 0.5, y: 0.2 }] };

  it('draws the last lift’s path on one tap and takes it off on the next', async () => {
    const { getByTestId, queryByTestId } = await show(marked, body, { lastLift });
    expect(queryByTestId('path-ghost')).toBeNull();
    expect(getByTestId('tracker-compare')).toHaveTextContent('Overlay last lift');
    await press(getByTestId('tracker-compare'));
    expect(getByTestId('path-ghost')).toBeOnTheScreen();
    expect(getByTestId('tracker-compare')).toHaveTextContent('Dotted line: 9 Nov, 18:05');
    expect(getByTestId('tracker-compare')).toHaveProp('accessibilityState', { checked: true });
    await press(getByTestId('tracker-compare'));
    expect(queryByTestId('path-ghost')).toBeNull();
  });

  it('opens the two lifts side by side from the controls', async () => {
    const onSideBySide = jest.fn();
    const { getByTestId } = await show(marked, body, { lastLift, onSideBySide });
    await press(getByTestId('side-by-side'));
    expect(onSideBySide).toHaveBeenCalledTimes(1);
    const none = await show(marked, body, { onSideBySide });
    expect(none.queryByTestId('side-by-side')).toBeNull();
  });

  it('offers the plate correction and the notes when the screen is given them', async () => {
    const onAdjustPlate = jest.fn();
    const onDetails = jest.fn();
    const { getByTestId } = await show(marked, body, { onAdjustPlate, onDetails });
    expect(getByTestId('adjust-plate')).toHaveTextContent('adjust plate');
    expect(getByTestId('lift-details')).toHaveTextContent('notes');
    await press(getByTestId('adjust-plate'));
    await press(getByTestId('lift-details'));
    expect(onAdjustPlate).toHaveBeenCalledTimes(1);
    expect(onDetails).toHaveBeenCalledTimes(1);
    const bare = await show(marked);
    expect(bare.queryByTestId('adjust-plate')).toBeNull();
    expect(bare.queryByTestId('lift-details')).toBeNull();
  });

  it('has no plate correction on a hip trail, but keeps the notes', async () => {
    const { getByTestId, queryByTestId } = await show({ ...marked, traceKind: 'hip' }, body, { onAdjustPlate: () => {}, onDetails: () => {} });
    expect(queryByTestId('adjust-plate')).toBeNull();
    expect(getByTestId('lift-details')).toBeOnTheScreen();
  });

  it('is not offered on a first lift, or while the first look plays', async () => {
    const first = await show(marked);
    expect(first.queryByTestId('tracker-compare')).toBeNull();
    await first.unmount();
    player = null;
    const revealing = await show(marked, body, { reveal: true, lastLift });
    expect(revealing.queryByTestId('tracker-compare')).toBeNull();
    await at(240);
    expect(revealing.getByTestId('tracker-compare')).toBeOnTheScreen();
  });
});

describe('TrackerScreen player tools', () => {
  // the same lift as the bar speed tests: the plate read on frames 90 to 240, the bar at half the picture's width
  const path = Array.from({ length: 151 }, (_, i) => {
    const frame = 90 + i;
    const y = frame <= 170 ? 0.8 - 0.002 * (frame - 90) : 0.64 - 0.004 * (frame - 170);
    return { frame, x: 0.5, y, src: 'plate' as const, r: 0.05 };
  });
  const measured: Analysis = { ...marked, reps: [{ ...marked.reps[0], path }] };
  const fire = async (el: Parameters<typeof fireEvent>[0], event: string, nativeEvent: object) => {
    await act(async () => {
      fireEvent(el, event, { nativeEvent });
    });
  };

  it('draws the whole bar path faint from the first frame and the rep bright over it as it plays', async () => {
    const { getByTestId, queryByTestId } = await show(measured);
    expect(getByTestId('path-whole')).toBeOnTheScreen();
    expect(queryByTestId('path-done')).toBeNull();
    await at(150);
    expect(getByTestId('path-whole')).toBeOnTheScreen();
    expect(getByTestId('path-done')).toBeOnTheScreen();
    await press(getByTestId('toggle-path'));
    expect(queryByTestId('path-whole')).toBeNull();
  });

  it('leaves a hip trail as it was: no whole path', async () => {
    const { queryByTestId } = await show({ ...measured, traceKind: 'hip' });
    await at(150);
    expect(queryByTestId('path-whole')).toBeNull();
  });

  it('lays a grid over the picture from the toolbar', async () => {
    const { getByTestId, queryByTestId } = await show(measured);
    expect(queryByTestId('ref-grid')).toBeNull();
    expect(getByTestId('toggle-grid')).toHaveTextContent('grid');
    await press(getByTestId('toggle-grid'));
    // the picture is 375 x 667: cells of 62.5, five lines down and ten across
    expect(getByTestId('ref-grid').children).toHaveLength(15);
    expect(getByTestId('toggle-grid')).toHaveProp('accessibilityState', { checked: true });
    await press(getByTestId('toggle-grid'));
    expect(queryByTestId('ref-grid')).toBeNull();
  });

  it('puts a vertical line where the bar started and lets the lifter drag it', async () => {
    const { getByTestId, queryByTestId } = await show(measured);
    expect(getByTestId('toggle-plumb')).toHaveTextContent('vertical line');
    await press(getByTestId('toggle-plumb'));
    // the bar starts at half of the 375 pt picture; the handle is 44 wide
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: 165.5 });
    await fire(getByTestId('ref-plumb'), 'responderGrant', { pageX: 200 });
    await fire(getByTestId('ref-plumb'), 'responderMove', { pageX: 275 });
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: 240.5 });
    // it comes back where it was left
    await press(getByTestId('toggle-plumb'));
    expect(queryByTestId('ref-plumb')).toBeNull();
    await press(getByTestId('toggle-plumb'));
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: 240.5 });
  });

  it('starts the vertical line in the centre when the bar’s start is not known', async () => {
    const { getByTestId } = await show({ ...marked, reps: [{ ...marked.reps[0], path: [] }] });
    await press(getByTestId('toggle-plumb'));
    // no chart on this lift, so the picture is 450 pt wide
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: 203 });
  });

  it('in draw mode a touch on the video draws instead of playing, and clear takes the strokes off', async () => {
    const { getByTestId, queryByTestId } = await show(measured);
    expect(queryByTestId('freehand-surface')).toBeNull();
    expect(getByTestId('toggle-freehand')).toHaveTextContent('draw');
    await press(getByTestId('toggle-freehand'));
    await press(getByTestId('tracker-video'));
    expect(player?.play).not.toHaveBeenCalled();
    const surface = getByTestId('freehand-surface');
    await fire(surface, 'responderGrant', { locationX: 75, locationY: 100 });
    await fire(surface, 'responderMove', { locationX: 150, locationY: 200 });
    await fire(surface, 'responderRelease', { locationX: 150, locationY: 200 });
    expect(getByTestId('freehand-stroke-0')).toHaveProp('d', 'M75.0 100.0 L150.0 200.0');
    // out of draw mode the stroke stays and the video plays on a tap again
    await press(getByTestId('toggle-freehand'));
    expect(getByTestId('freehand-stroke-0')).toBeOnTheScreen();
    await press(getByTestId('tracker-video'));
    expect(player?.play).toHaveBeenCalledTimes(1);
    await press(getByTestId('toggle-clear'));
    expect(queryByTestId('freehand-stroke-0')).toBeNull();
    expect(queryByTestId('toggle-clear')).toBeNull();
  });

  it('draw and measure are one at a time', async () => {
    const { getByTestId, queryByTestId } = await show(measured);
    expect(getByTestId('toggle-draw')).toHaveTextContent('measure');
    await press(getByTestId('toggle-draw'));
    expect(getByTestId('draw-surface')).toBeOnTheScreen();
    await press(getByTestId('toggle-freehand'));
    expect(queryByTestId('draw-surface')).toBeNull();
    expect(getByTestId('freehand-surface')).toBeOnTheScreen();
    await press(getByTestId('toggle-draw'));
    expect(queryByTestId('freehand-surface')).toBeNull();
    expect(getByTestId('draw-surface')).toBeOnTheScreen();
  });
});

describe('TrackerScreen chart zoom and divider', () => {
  const path = Array.from({ length: 151 }, (_, i) => {
    const frame = 90 + i;
    const y = frame <= 170 ? 0.8 - 0.002 * (frame - 90) : 0.64 - 0.004 * (frame - 170);
    return { frame, x: 0.5, y, src: 'plate' as const, r: 0.05 };
  });
  const measured: Analysis = { ...marked, reps: [{ ...marked.reps[0], path }] };
  const fire = async (el: Parameters<typeof fireEvent>[0], event: string, nativeEvent: object) => {
    await act(async () => {
      fireEvent(el, event, { nativeEvent });
    });
  };
  const fingers = (...xs: number[]) => ({ pageX: xs[0], locationX: xs[0], touches: xs.map((pageX) => ({ pageX })) });
  // 336 wide: 300 of plot. Two fingers either side of the middle spread to twice as wide: frames 128 to 203.
  const zoomIn = async (view: Awaited<ReturnType<typeof show>>) => {
    const plot = view.getByTestId('speed-plot');
    await fire(plot, 'layout', { layout: { width: 336, height: 140 } });
    await fire(plot, 'responderGrant', fingers(136, 236));
    await fire(plot, 'responderMove', fingers(136, 236));
    await fire(plot, 'responderMove', fingers(86, 286));
    await fire(plot, 'responderRelease', fingers(86));
  };

  it('labels the chart in seconds from the start of the lift, with the playhead’s time', async () => {
    const view = await show(measured);
    await fire(view.getByTestId('speed-plot'), 'layout', { layout: { width: 336, height: 140 } });
    await at(162);
    expect(view.getByTestId('speed-cursor-time')).toHaveTextContent('1.20 s');
    expect(view.getByTestId('speed-tick-x-2')).toHaveTextContent('2.0 s');
  });

  it('zoomed in, playback starts at the window and loops inside it until the zoom is reset', async () => {
    const view = await show(measured);
    await zoomIn(view);
    expect(view.getByTestId('speed-zoom-reset')).toBeOnTheScreen();
    expect(view.getByTestId('speed-tick-x-0')).toHaveTextContent('1.0 s');
    // the playhead is on frame 90, before the window: play starts from the window's first frame
    await press(view.getByTestId('tracker-play'));
    expect(player?.currentTime).toBeCloseTo(128.5 / 60, 6);
    expect(view.getByTestId('tracker-readout')).toHaveTextContent('0.63 s · 129 / 300');
    await at(150);
    expect(view.getByTestId('tracker-readout')).toHaveTextContent('1.00 s · 151 / 300');
    if (player) player.currentTime = undefined;
    await at(203);
    expect(player?.currentTime).toBeCloseTo(128.5 / 60, 6);
    expect(player?.pause).not.toHaveBeenCalled();
    expect(view.getByTestId('tracker-readout')).toHaveTextContent('0.63 s · 129 / 300');
    // a time still arriving from before the jump is not the end of the window reached again
    if (player) player.currentTime = undefined;
    await at(204);
    expect(player?.currentTime).toBeUndefined();
    await at(130);
    expect(view.getByTestId('tracker-readout')).toHaveTextContent('0.67 s · 131 / 300');
    await press(view.getByTestId('speed-zoom-reset'));
    expect(view.queryByTestId('speed-zoom-reset')).toBeNull();
    await at(203);
    expect(player?.currentTime).toBeUndefined();
    expect(view.getByTestId('tracker-readout')).toHaveTextContent('1.88 s · 204 / 300');
    await at(240);
    expect(player?.pause).toHaveBeenCalledTimes(1);
  });

  it('dragging the chart still seeks, inside the window when zoomed', async () => {
    const view = await show(measured);
    await fire(view.getByTestId('speed-plot'), 'layout', { layout: { width: 336, height: 140 } });
    await fire(view.getByTestId('speed-plot'), 'responderGrant', fingers(100));
    await fire(view.getByTestId('speed-plot'), 'responderMove', fingers(186));
    expect(view.getByTestId('tracker-readout')).toHaveTextContent('1.25 s · 166 / 300');
    await fire(view.getByTestId('speed-plot'), 'responderRelease', fingers(186));
    await zoomIn(view);
    await fire(view.getByTestId('speed-plot'), 'responderGrant', fingers(100));
    await fire(view.getByTestId('speed-plot'), 'responderMove', fingers(336));
    expect(view.getByTestId('tracker-readout')).toHaveTextContent('1.88 s · 204 / 300');
  });

  it('showing the whole clip clears the zoom', async () => {
    const view = await show(measured);
    await zoomIn(view);
    await press(view.getByTestId('toggle-whole'));
    expect(view.queryByTestId('speed-zoom-reset')).toBeNull();
  });

  it('the divider makes the video smaller or bigger, within limits', async () => {
    const view = await show(measured);
    // a 750 x 1334 screen: the 9:16 video opens at half its height
    expect(view.getByTestId('tracker-video')).toHaveStyle({ width: 375, height: 667 });
    const divider = view.getByTestId('tracker-divider');
    await fire(divider, 'responderGrant', { pageY: 800 });
    await fire(divider, 'responderMove', { pageY: 700 });
    expect(view.getByTestId('tracker-video')).toHaveStyle({ width: 319, height: 567 });
    // no smaller than a quarter of the screen
    await fire(divider, 'responderMove', { pageY: 100 });
    expect(view.getByTestId('tracker-video')).toHaveStyle({ width: 188, height: 334 });
    await fire(divider, 'responderRelease', { pageY: 100 });
    // and no bigger than leaves the chart its room: 200 pt under a 334 pt video, of which the chart keeps 160
    await fire(view.getByTestId('tracker-bottom'), 'layout', { layout: { height: 200 } });
    await fire(divider, 'responderGrant', { pageY: 500 });
    await fire(divider, 'responderMove', { pageY: 1200 });
    expect(view.getByTestId('tracker-video')).toHaveStyle({ width: 210, height: 373 });
  });

  it('has no divider on a lift with no chart', async () => {
    const { queryByTestId } = await show(marked);
    expect(queryByTestId('tracker-divider')).toBeNull();
  });
});

describe('enlarging the picture', () => {
  const fire = async (el: Parameters<typeof fireEvent>[0], event: string, nativeEvent: object) => {
    await act(async () => {
      fireEvent(el, event, { nativeEvent });
    });
  };
  const two = (ax: number, bx: number) => ({ touches: [{ pageX: ax, pageY: 300 }, { pageX: bx, pageY: 300 }] });

  it('pinching enlarges the video and its overlays, and reset brings the whole picture back', async () => {
    const view = await show(marked);
    const stage = view.getByTestId('tracker-stage');
    expect(view.queryByTestId('picture-reset')).toBeNull();
    await fire(stage, 'responderGrant', two(150, 250));
    await fire(stage, 'responderMove', two(100, 300));
    expect(view.getByTestId('tracker-picture')).toHaveStyle({ transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 2 }] });
    expect(view.getByTestId('picture-reset')).toHaveTextContent('2.0× · reset zoom');
    await fire(stage, 'responderRelease', { touches: [] });
    await act(async () => {
      fireEvent.press(view.getByTestId('picture-reset'));
    });
    expect(view.getByTestId('tracker-picture')).toHaveStyle({ transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] });
    expect(view.queryByTestId('picture-reset')).toBeNull();
  });
});
