import { act, fireEvent, render } from '@testing-library/react-native';
import { useVideoPlayer } from 'expo-video';
import type { Analysis } from '../../analysis/types';
import { snatchMock } from '../../analysis/fixtures';
import CompareScreen from './CompareScreen';

type Fake = { play: jest.Mock; pause: jest.Mock; playing: boolean; currentTime?: number; playbackRate?: number; emit: (event: string, payload: object) => void };
const players: Record<string, Fake> = {};

beforeEach(() => {
  for (const k of Object.keys(players)) delete players[k];
  jest.mocked(useVideoPlayer).mockImplementation(((source: string, setup?: (p: Fake) => void) => {
    if (players[source]) return players[source];
    const listeners: Record<string, ((payload: object) => void)[]> = {};
    const made: Fake & { addListener: (event: string, fn: (payload: object) => void) => { remove: () => void } } = {
      playing: false,
      play: jest.fn(() => {
        made.playing = true;
        made.emit('playingChange', { isPlaying: true });
      }),
      pause: jest.fn(() => {
        made.playing = false;
        made.emit('playingChange', { isPlaying: false });
      }),
      addListener: (event, fn) => {
        (listeners[event] ??= []).push(fn);
        return { remove: () => void listeners[event].splice(listeners[event].indexOf(fn), 1) };
      },
      emit: (event, payload) => [...(listeners[event] ?? [])].forEach((fn) => fn(payload)),
    };
    setup?.(made);
    players[source] = made;
    return made;
  }) as unknown as typeof useVideoPlayer);
});

// a plate rising 0.004 of the height a frame at 60 fps, 0.05 of the height in radius: 1.08 m/s
const lift = (id: string, start: number, end: number): Analysis => ({
  ...snatchMock,
  id,
  video: { ...snatchMock.video, width: 1080, height: 1920, fps: 60, frameCount: 300 },
  lift: { startFrame: start, endFrame: end },
  reps: [{ ...snatchMock.reps[0], path: Array.from({ length: end - start + 1 }, (_, i) => ({ frame: start + i, x: 0.5, y: 0.8 - 0.004 * i, src: 'plate' as const, r: 0.05 })) }],
});
const A = 'file:///a/clip.mp4';
const B = 'file:///b/clip.mp4';
const show = () =>
  render(
    <CompareScreen
      today={{ analysis: lift('a', 90, 210), body: null, clipUri: A, title: '14 Nov, 08:50' }}
      earlier={{ analysis: lift('b', 30, 90), body: null, clipUri: B, title: '13 Nov, 10:55' }}
      onBack={() => {}}
    />,
  );
const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

describe('CompareScreen', () => {
  it('shows both lifts, each titled, with the bar speed of each', async () => {
    const { getByTestId } = await show();
    expect(getByTestId('compare-title-0')).toHaveTextContent('This · 14 Nov, 08:50');
    expect(getByTestId('compare-title-1')).toHaveTextContent('13 Nov, 10:55');
    expect(getByTestId('compare-chart')).toBeOnTheScreen();
    expect(getByTestId('compare-stats-0')).toHaveTextContent(/^this: now .* · peak 1\.08 · avg up 1\.08 m\/s$/);
    expect(getByTestId('compare-stats-1')).toHaveTextContent(/^earlier: now .* · peak 1\.08 · avg up 1\.08 m\/s$/);
  });

  it('plays both from the start of their own lift, and steps both together', async () => {
    const { getByTestId } = await show();
    await press(getByTestId('compare-play'));
    expect(players[A].play).toHaveBeenCalledTimes(1);
    expect(players[B].play).toHaveBeenCalledTimes(1);
    await press(getByTestId('compare-play'));
    expect(players[A].playing).toBe(false);
    expect(players[B].playing).toBe(false);
    // one step is a thirtieth of a second: two frames at 60 fps, from each lift's own first frame
    await press(getByTestId('compare-forward'));
    expect(players[A].currentTime).toBeCloseTo(92.5 / 60, 6);
    expect(players[B].currentTime).toBeCloseTo(32.5 / 60, 6);
  });

  it('stops the shorter lift on its last frame while the longer plays on', async () => {
    const { getByTestId } = await show();
    await press(getByTestId('compare-play'));
    await act(async () => players[B].emit('timeUpdate', { currentTime: 90.5 / 60 }));
    expect(players[B].playing).toBe(false);
    expect(players[A].playing).toBe(true);
  });

  it('changes the speed of both', async () => {
    const { getByTestId } = await show();
    await press(getByTestId('compare-speed'));
    expect(getByTestId('compare-speed')).toHaveTextContent('0.5×');
    expect(players[A].playbackRate).toBe(0.5);
    expect(players[B].playbackRate).toBe(0.5);
  });

  it('offers the other lifts of the same kind, marks the one on show, and picks another', async () => {
    const onPick = jest.fn();
    const others = [
      { id: 'b', title: '13 Nov, 10:55' },
      { id: 'c', title: 'Heavy single · 12 Nov, 09:10' },
    ];
    const view = await render(
      <CompareScreen
        today={{ analysis: lift('a', 90, 210), body: null, clipUri: A, title: '14 Nov, 08:50' }}
        earlier={{ analysis: lift('b', 30, 90), body: null, clipUri: B, title: '13 Nov, 10:55' }}
        onBack={() => {}}
        others={others}
        picked="b"
        onPick={onPick}
      />,
    );
    expect(view.getByTestId('compare-pick-b')).toBeSelected();
    expect(view.getByTestId('compare-pick-c')).not.toBeSelected();
    expect(view.getByTestId('compare-pick-c')).toHaveTextContent('Heavy single · 12 Nov, 09:10');
    await press(view.getByTestId('compare-pick-b'));
    expect(onPick).not.toHaveBeenCalled();
    await press(view.getByTestId('compare-pick-c'));
    expect(onPick).toHaveBeenCalledWith('c');
  });

  it('has no picker when there is only one lift to set against', async () => {
    const view = await render(
      <CompareScreen
        today={{ analysis: lift('a', 90, 210), body: null, clipUri: A, title: '14 Nov, 08:50' }}
        earlier={{ analysis: lift('b', 30, 90), body: null, clipUri: B, title: '13 Nov, 10:55' }}
        onBack={() => {}}
        others={[{ id: 'b', title: '13 Nov, 10:55' }]}
        picked="b"
        onPick={jest.fn()}
      />,
    );
    expect(view.queryByTestId('compare-others')).toBeNull();
  });
});
