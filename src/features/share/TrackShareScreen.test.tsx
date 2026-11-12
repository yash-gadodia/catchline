import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useVideoPlayer } from 'expo-video';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { snatchMock } from '../../analysis/fixtures';
import TrackShareScreen, { type TrackShareDeps } from './TrackShareScreen';
import type { TrackSpec } from './trackShare';
import { track } from '../../lib/analytics';

jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));
beforeEach(() => jest.mocked(track).mockClear());

const CLIP = 'file:///documents/lifts/a/clip.mp4';
const VIDEO = 'file:///cache/share-video/catchline-1.mp4';
const IMAGE = 'file:///cache/share-video/catchline-1.jpg';
const analysis: Analysis = { ...snatchMock, video: { ...snatchMock.video, width: 1080, height: 1920, fps: 60, frameCount: 4 } };
const frameRow = new Array<number | null>(32).fill(null).map((_, i) => (i < 4 ? 0.5 : null));
const body: Body = { version: 1, frames: [frameRow, frameRow, frameRow, frameRow] };

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

function deps(over: Partial<TrackShareDeps> = {}): TrackShareDeps {
  return {
    renderVideo: jest.fn(async () => VIDEO),
    renderImage: jest.fn(async () => IMAGE),
    share: jest.fn(async () => ({ outcome: 'shared' as const, activity: 'com.apple.UIKit.activity.SaveToCameraRoll' })),
    discard: jest.fn(),
    askRating: jest.fn(async () => 'asked' as const),
    ...over,
  };
}

const specOf = (fn: unknown, call = 0) => (fn as jest.Mock).mock.calls[call][1] as TrackSpec;

describe('TrackShareScreen', () => {
  it('opens with the path, the lines and the body on, and the wordmark', async () => {
    const { getByTestId, queryByTestId } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={deps()} />);
    expect(getByTestId('tracker-lines')).toBeTruthy();
    expect(getByTestId('tracker-body')).toBeTruthy();
    expect(getByTestId('share-watermark')).toHaveTextContent('catchline');
    await press(getByTestId('share-toggle-body'));
    expect(queryByTestId('tracker-body')).toBeNull();
    await press(getByTestId('share-toggle-lines'));
    expect(queryByTestId('tracker-lines')).toBeNull();
  });

  it('renders the video with the chosen layers and speed, then opens the share sheet', async () => {
    const d = deps();
    const { getByTestId, getByText } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark={false} onBack={() => {}} deps={d} />);
    await press(getByTestId('share-toggle-lines'));
    await press(getByText('0.25×'));
    await press(getByTestId('share-video-btn'));
    await waitFor(() => expect(d.share).toHaveBeenCalledWith(VIDEO));
    expect((d.renderVideo as jest.Mock).mock.calls[0][0]).toBe(CLIP);
    const spec = specOf(d.renderVideo);
    expect(spec.speed).toBe(0.25);
    expect(spec.startX).toBeNull();
    expect(spec.path.length).toBe(snatchMock.reps[0].path.length);
    expect(spec.bones).toHaveLength(4);
    expect(spec.watermark).toBeNull();
  });

  it('renders the same choices once', async () => {
    const d = deps();
    const { getByTestId } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
    await press(getByTestId('share-video-btn'));
    await waitFor(() => expect(d.share).toHaveBeenCalledTimes(1));
    await press(getByTestId('share-video-btn'));
    await waitFor(() => expect(d.share).toHaveBeenCalledTimes(2));
    expect(d.renderVideo).toHaveBeenCalledTimes(1);
  });

  it('shares one frame as an image', async () => {
    const d = deps();
    const { getByTestId } = await render(<TrackShareScreen analysis={analysis} body={null} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
    await press(getByTestId('share-image-btn'));
    await waitFor(() => expect(d.share).toHaveBeenCalledWith(IMAGE));
    const spec = specOf(d.renderImage);
    expect(spec.frame).toBe(0);
    expect(spec.watermark).toBe('catchline');
    expect(d.renderVideo).not.toHaveBeenCalled();
  });

  it('has no whole-clip chip when tracking marked no lift, and shares every frame', async () => {
    const d = deps();
    const { getByTestId, queryByTestId } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
    expect(queryByTestId('share-toggle-whole')).toBeNull();
    await press(getByTestId('share-video-btn'));
    await waitFor(() => expect(d.share).toHaveBeenCalledWith(VIDEO));
    expect([specOf(d.renderVideo).startFrame, specOf(d.renderVideo).endFrame]).toEqual([0, 3]);
  });

  describe('a clip with the lift marked', () => {
    const long: Analysis = { ...analysis, video: { ...analysis.video, fps: 60, frameCount: 300 }, lift: { startFrame: 90, endFrame: 240 } };
    type Fake = { play: jest.Mock; pause: jest.Mock; currentTime?: number; emit: (event: string, payload: object) => void };
    const players: Fake[] = [];
    const real = jest.mocked(useVideoPlayer).getMockImplementation();

    beforeEach(() => {
      players.length = 0;
      jest.mocked(useVideoPlayer).mockImplementation(((_source: unknown, setup?: (p: Fake) => void) => {
        if (players.length) return players[0];
        const listeners: Record<string, ((payload: object) => void)[]> = {};
        const player = {
          play: jest.fn(),
          pause: jest.fn(),
          addListener: (event: string, fn: (payload: object) => void) => {
            (listeners[event] ??= []).push(fn);
            return { remove: () => void listeners[event].splice(listeners[event].indexOf(fn), 1) };
          },
          emit: (event: string, payload: object) => [...(listeners[event] ?? [])].forEach((fn) => fn(payload)),
        };
        setup?.(player);
        players.push(player);
        return player;
      }) as unknown as typeof useVideoPlayer);
    });
    afterEach(() => {
      jest.mocked(useVideoPlayer).mockImplementation(real);
    });

    const at = async (time: number) => {
      await act(async () => {
        players[0].emit('timeUpdate', { currentTime: time });
      });
    };

    it('opens on the first frame of the lift and plays round inside it', async () => {
      const { getByTestId } = await render(<TrackShareScreen analysis={long} body={null} clipUri={CLIP} watermark onBack={() => {}} deps={deps()} />);
      expect(players[0].currentTime).toBeCloseTo(90.5 / 60, 6);
      expect(getByTestId('share-toggle-whole').props.accessibilityState).toEqual({ selected: false, disabled: false });
      await at(200.5 / 60);
      expect(players[0].currentTime).toBeCloseTo(90.5 / 60, 6);
      // one frame past the lift's last: back to its first
      players[0].currentTime = undefined;
      await at(241.5 / 60);
      expect(players[0].currentTime).toBeCloseTo(90.5 / 60, 6);
    });

    it('shares the lift only, and the image from inside it', async () => {
      const d = deps();
      const { getByTestId } = await render(<TrackShareScreen analysis={long} body={null} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
      await press(getByTestId('share-image-btn'));
      await waitFor(() => expect(d.share).toHaveBeenCalledWith(IMAGE));
      expect(specOf(d.renderImage).frame).toBe(90);
      await at(150.5 / 60);
      await press(getByTestId('share-image-btn'));
      await waitFor(() => expect(d.renderImage).toHaveBeenCalledTimes(2));
      expect(specOf(d.renderImage, 1).frame).toBe(150);
      await press(getByTestId('share-video-btn'));
      await waitFor(() => expect(d.share).toHaveBeenCalledWith(VIDEO));
      expect([specOf(d.renderVideo).startFrame, specOf(d.renderVideo).endFrame]).toEqual([90, 240]);
    });

    it('shares the whole clip when asked, as a different file, and comes back into the lift', async () => {
      const d = deps();
      const { getByTestId } = await render(<TrackShareScreen analysis={long} body={null} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
      await press(getByTestId('share-video-btn'));
      await waitFor(() => expect(d.share).toHaveBeenCalledTimes(1));
      await press(getByTestId('share-toggle-whole'));
      expect(getByTestId('share-toggle-whole').props.accessibilityState).toEqual({ selected: true, disabled: false });
      await press(getByTestId('share-video-btn'));
      await waitFor(() => expect(d.share).toHaveBeenCalledTimes(2));
      expect(d.renderVideo).toHaveBeenCalledTimes(2);
      expect([specOf(d.renderVideo, 1).startFrame, specOf(d.renderVideo, 1).endFrame]).toEqual([0, 299]);
      // on a frame outside the lift, then back to the lift: the frame moves to the lift's first
      await at(10.5 / 60);
      await press(getByTestId('share-toggle-whole'));
      expect(players[0].currentTime).toBeCloseTo(90.5 / 60, 6);
      await press(getByTestId('share-image-btn'));
      await waitFor(() => expect(d.renderImage).toHaveBeenCalledTimes(1));
      expect(specOf(d.renderImage).frame).toBe(90);
    });
  });

  describe('what it reports', () => {
    it('one share_exported and one share_completed per share, with the choices made, then asks for a rating', async () => {
      const d = deps();
      const { getByTestId, getByText } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
      await press(getByText('0.5×'));
      await press(getByTestId('share-video-btn'));
      await waitFor(() => expect(d.askRating).toHaveBeenCalledTimes(1));
      expect(jest.mocked(track).mock.calls).toEqual([
        // 4 frames at 60 fps, at half speed
        ['share_exported', { kind: 'video', speed: 0.5, overlay_path: true, overlay_lines: true, overlay_body: true, whole_clip: false, has_bar_path: true, duration_s: 0.1, completed: true }],
        ['share_completed', { kind: 'video', activity: 'com.apple.UIKit.activity.SaveToCameraRoll' }],
      ]);
      expect(d.askRating).toHaveBeenCalledWith(true);
    });

    it('an image has no speed or length, and a lift without a bar path says so', async () => {
      const d = deps();
      const noPath: Analysis = { ...analysis, reps: [{ ...analysis.reps[0], path: [] }] };
      const { getByTestId } = await render(<TrackShareScreen analysis={noPath} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
      await press(getByTestId('share-toggle-lines'));
      await press(getByTestId('share-image-btn'));
      await waitFor(() => expect(d.askRating).toHaveBeenCalledWith(false));
      expect(jest.mocked(track).mock.calls).toEqual([
        ['share_exported', { kind: 'image', speed: 1, overlay_path: true, overlay_lines: false, overlay_body: true, whole_clip: false, has_bar_path: false, duration_s: 0, completed: true }],
        ['share_completed', { kind: 'image', activity: 'com.apple.UIKit.activity.SaveToCameraRoll' }],
      ]);
    });

    it('a share sheet that was closed is reported as dismissed and never asks for a rating', async () => {
      const d = deps({ share: jest.fn(async () => ({ outcome: 'cancelled' as const, activity: null })) });
      const { getByTestId } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
      await press(getByTestId('share-video-btn'));
      await waitFor(() => expect(track).toHaveBeenCalledTimes(2));
      expect(jest.mocked(track).mock.calls[1]).toEqual(['share_completed', { kind: 'video', activity: 'dismissed' }]);
      expect(d.askRating).not.toHaveBeenCalled();
    });

    it('reports nothing when the render fails', async () => {
      const d = deps({ renderVideo: jest.fn(async () => Promise.reject(new Error('writer'))) });
      const { getByTestId, findByTestId } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
      await press(getByTestId('share-video-btn'));
      await findByTestId('share-notice');
      expect(track).not.toHaveBeenCalled();
      expect(d.askRating).not.toHaveBeenCalled();
    });
  });

  it('offers 2x and 4x only on a binary that renders them', async () => {
    const old = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={deps()} />);
    expect(old.queryByText('2×')).toBeNull();
    expect(old.queryByText('4×')).toBeNull();
  });

  it('renders 4x when the binary can', async () => {
    const d = deps({ fastShare: true });
    const { getByTestId, getByText } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
    await press(getByText('4×'));
    await press(getByTestId('share-video-btn'));
    await waitFor(() => expect(d.share).toHaveBeenCalledWith(VIDEO));
    expect(specOf(d.renderVideo).speed).toBe(4);
  });

  it('has no body toggle for a lift without joints', async () => {
    const { queryByTestId } = await render(<TrackShareScreen analysis={analysis} body={null} clipUri={CLIP} watermark onBack={() => {}} deps={deps()} />);
    expect(queryByTestId('share-toggle-body')).toBeNull();
  });

  it('says so when the render fails and does not open the share sheet', async () => {
    const d = deps({ renderVideo: jest.fn(async () => Promise.reject(new Error('writer'))) });
    const { getByTestId, findByTestId } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
    await press(getByTestId('share-video-btn'));
    expect(await findByTestId('share-notice')).toHaveTextContent("Couldn't make that. Try again.");
    expect(d.share).not.toHaveBeenCalled();
  });

  it('discards what it made on leaving', async () => {
    const d = deps();
    const { getByTestId, unmount } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={d} />);
    await press(getByTestId('share-video-btn'));
    await waitFor(() => expect(d.share).toHaveBeenCalled());
    await unmount();
    expect(d.discard).toHaveBeenCalledWith(VIDEO);
  });
});
