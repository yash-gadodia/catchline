import { act, fireEvent, render } from '@testing-library/react-native';
import { demoClip } from './demo';
import TrimScreen from './TrimScreen';

type Listener = (payload: { status?: string; currentTime?: number }) => void;
type Player = {
  status: string;
  currentTime: number;
  play: jest.Mock;
  pause: jest.Mock;
  generateThumbnailsAsync: jest.Mock;
  listeners: Record<string, Listener[]>;
  addListener: (event: string, fn: Listener) => { remove: () => void };
};
const mockPlayers: Player[] = [];

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  const React = require('react');
  return {
    __esModule: true,
    VideoView: View,
    useVideoPlayer: (_source: unknown, setup?: (p: Player) => void) =>
      React.useState(() => {
        const p: Player = {
          status: 'loading',
          currentTime: 0,
          play: jest.fn(),
          pause: jest.fn(),
          generateThumbnailsAsync: jest.fn(async (times: number[]) => times.map((t) => ({ requestedTime: t }))),
          listeners: {},
          addListener: (event, fn) => {
            (p.listeners[event] ??= []).push(fn);
            return { remove: () => (p.listeners[event] = p.listeners[event].filter((f) => f !== fn)) };
          },
        };
        setup?.(p);
        mockPlayers.push(p);
        return p;
      })[0],
  };
});

const clip = { ...demoClip('ok'), uri: 'file:///clip.mov', durationS: 12, trim: { start: 1.4, end: 7.6 } };
const emit = (p: Player, event: string, payload: { status?: string; currentTime?: number }) =>
  act(async () => (p.listeners[event] ?? []).forEach((fn) => fn(payload)));

// The preview's player is the one set up to play; the filmstrip's only makes thumbnails.
const videoPlayer = () => mockPlayers.find((p) => 'seekTolerance' in p) as Player & { seekTolerance: object };

beforeEach(() => {
  mockPlayers.length = 0;
});

describe('TrimScreen', () => {
  it('asks for filmstrip frames once the clip has loaded, and shows them', async () => {
    const screen = await render(<TrimScreen clip={clip} onCancel={jest.fn()} onDone={jest.fn()} />);
    const thumbs = mockPlayers.find((p) => p.listeners.statusChange)!;
    expect(thumbs.generateThumbnailsAsync).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId('trim-thumb')).toHaveLength(0);
    await emit(thumbs, 'statusChange', { status: 'readyToPlay' });
    expect(thumbs.generateThumbnailsAsync).toHaveBeenCalledTimes(1);
    expect(thumbs.generateThumbnailsAsync).toHaveBeenCalledWith([1, 3, 5, 7, 9, 11], { maxWidth: 240 });
    expect(screen.queryAllByTestId('trim-thumb')).toHaveLength(6);
  });

  it('seeks with zero tolerance, follows playback with the playhead and pauses on a tap', async () => {
    const screen = await render(<TrimScreen clip={clip} onCancel={jest.fn()} onDone={jest.fn()} />);
    const video = videoPlayer();
    expect(video.seekTolerance).toEqual({ toleranceBefore: 0, toleranceAfter: 0 });
    expect(screen.getByTestId('trim-head-time')).toHaveTextContent('00:01.4');
    await emit(video, 'timeUpdate', { currentTime: 3.2 });
    expect(screen.getByTestId('trim-head-time')).toHaveTextContent('00:03.2');
    await emit(video, 'timeUpdate', { currentTime: 7.6 });
    expect(video.currentTime).toBe(1.4);
    expect(screen.getByTestId('trim-preview')).toHaveProp('accessibilityLabel', 'Pause');
    await act(async () => fireEvent.press(screen.getByTestId('trim-preview')));
    expect(screen.getByTestId('trim-preview')).toHaveProp('accessibilityLabel', 'Play');
    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(1.4);
  });

  it('moves the playhead inside the trim and seeks the preview to it', async () => {
    const screen = await render(<TrimScreen clip={clip} onCancel={jest.fn()} onDone={jest.fn()} />);
    const video = videoPlayer();
    await act(async () => fireEvent(screen.getByTestId('trim-strip'), 'layout', { nativeEvent: { layout: { width: 300 } } }));
    await act(async () => fireEvent(screen.getByTestId('trim-playhead'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }));
    expect(screen.getByTestId('trim-head-time')).toHaveTextContent('00:01.5');
    expect(screen.getByTestId('trim-playhead')).toHaveProp('accessibilityValue', { text: '00:01.5' });
    expect(video.currentTime).toBe(1.5);
    await act(async () => fireEvent(screen.getByTestId('trim-playhead'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }));
    await act(async () => fireEvent(screen.getByTestId('trim-playhead'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }));
    expect(screen.getByTestId('trim-head-time')).toHaveTextContent('00:01.4');
    expect(video.currentTime).toBe(1.4);
  });
});

test('sent here by Analyse, the screen says why and that Done analyses', async () => {
  const long = { ...demoClip('ok'), uri: 'file:///long.mov', durationS: 33, trim: { start: 0, end: 33 } };
  const screen = await render(<TrimScreen clip={long} nudge onCancel={jest.fn()} onDone={jest.fn()} />);
  expect(screen.getByTestId('trim-nudge')).toHaveTextContent('Long clips take minutes on the phone. Trim to one lift, under 15 s, for a fast read.');
  expect(screen.queryByTestId('trim-problem')).toBeNull();
});
