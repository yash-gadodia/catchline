import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { File } from 'expo-file-system';
import { snatchMock, snatchReal } from '../../analysis/fixtures';
import ShareScreen, { type ShareDeps } from './ShareScreen';
import ShareCard from './ShareCard';
import { cardCopy, cardSize, cueMeasurement, safeInsets } from './model';
import { localClipFor, rememberClip, useLocalClips } from './localClips';
import type { OverlaySpec } from './overlay';

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    VideoView: View,
    useVideoPlayer: () => ({ play: jest.fn(), pause: jest.fn(), addListener: () => ({ remove: jest.fn() }) }),
  };
});
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  useLocalClips.setState({ clips: {} });
});

const CLIP = { uri: 'file:///originals/lift.mov', startS: 2 };
const VIDEO = 'file:///cache/share-video/catchline-1.mp4';

function deps(over: Partial<ShareDeps> = {}): ShareDeps {
  return {
    renderVideo: jest.fn(async () => VIDEO),
    renderStill: jest.fn(async () => 'file:///cache/card.png'),
    share: jest.fn(async () => 'shared' as const),
    save: jest.fn(async () => 'saved' as const),
    discard: jest.fn(),
    ...over,
  };
}

describe('share model', () => {
  it('sizes the still card at the 390 base', () => {
    expect(cardSize('9:16')).toEqual({ width: 390, height: 693 });
    expect(cardSize('4:5')).toEqual({ width: 390, height: 488 });
  });

  it('keeps 9:16 copy clear of the story overlays', () => {
    expect(safeInsets('9:16', { width: 1080, height: 1920 })).toEqual({ top: 250, bottom: 346, left: 65, right: 119 });
  });

  it('builds the card copy from the analysis', () => {
    expect(cueMeasurement(snatchMock)?.id).toBe('bar_drift_hip');
    expect(cueMeasurement(snatchReal)?.id).toBe('jump_forward');
    expect(cardCopy(snatchMock)).toEqual({ hero: '6 cm', label: 'Bar drift at hip', cue: 'Stay over the bar longer', meta: 'snatch · 62.5 kg' });
  });
});

describe('local clips', () => {
  it('remembers the clip behind a lift and forgets it once the file is gone', () => {
    let exists = true;
    (File as unknown as jest.Mock).mockImplementation(() => ({
      get exists() {
        return exists;
      },
    }));
    rememberClip('lift-1', 'file:///originals/a.mov', 1.5);
    expect(localClipFor('lift-1')).toEqual({ uri: 'file:///originals/a.mov', startS: 1.5 });
    expect(localClipFor('lift-2')).toBeNull();
    exists = false;
    expect(localClipFor('lift-1')).toBeNull();
  });
});

describe('ShareCard', () => {
  it('renders the strobe still with the label, number, cue, path and brand', async () => {
    const { getByTestId } = await render(<ShareCard analysis={snatchMock} aspect="9:16" brand />);
    expect(getByTestId('share-card-9:16')).toBeOnTheScreen();
    expect(getByTestId('card-label')).toHaveTextContent('BAR DRIFT AT HIP');
    expect(getByTestId('card-hero')).toHaveTextContent('6 cm');
    expect(getByTestId('card-cue')).toHaveTextContent('Stay over the bar longer');
    expect(getByTestId('card-meta')).toHaveTextContent('snatch · 62.5 kg');
    expect(getByTestId('card-path')).toBeOnTheScreen();
    expect(getByTestId('card-brand')).toBeOnTheScreen();
  });

  it('drops the brand for paid lifters', async () => {
    const { queryByTestId, getByTestId } = await render(<ShareCard analysis={snatchMock} aspect="4:5" brand={false} />);
    expect(getByTestId('share-card-4:5')).toBeOnTheScreen();
    expect(queryByTestId('card-brand')).toBeNull();
  });
});

describe('ShareScreen', () => {
  it('renders the overlay video from the lifter clip and shows progress', async () => {
    let progress: (p: number) => void = () => {};
    const d = deps({
      renderVideo: jest.fn((_uri: string, _spec: OverlaySpec, onProgress: (p: number) => void) => {
        progress = onProgress;
        return new Promise<string>(() => {});
      }),
    });
    const screen = await render(<ShareScreen analysis={snatchReal} pro={false} clip={CLIP} onBack={jest.fn()} deps={d} />);
    expect(d.renderVideo).toHaveBeenCalledTimes(1);
    const [uri, spec] = (d.renderVideo as jest.Mock).mock.calls[0];
    expect(uri).toBe('file:///originals/lift.mov');
    expect(spec.width).toBe(1080);
    expect(spec.height).toBe(1920);
    expect(spec.segments).toEqual([{ startS: 29.4, endS: 35.567, rate: 1 }]);
    expect(screen.getByTestId('share-rendering')).toBeOnTheScreen();
    await act(async () => progress(0.4));
    expect(screen.getByTestId('share-primary')).toHaveTextContent('Making your video 40%');
    expect(screen.getByTestId('render-progress')).toHaveStyle({ width: '40%' });
  });

  it('plays the ready video and shares or saves the file', async () => {
    const d = deps();
    const screen = await render(<ShareScreen analysis={snatchReal} pro={false} clip={CLIP} onBack={jest.fn()} deps={d} />);
    await waitFor(() => expect(screen.getByTestId('share-video')).toBeOnTheScreen());
    expect(screen.getByTestId('share-primary')).toHaveTextContent('Share video');
    await press(screen.getByTestId('share-primary'));
    expect(d.share).toHaveBeenCalledWith(VIDEO);
    await press(screen.getByTestId('share-save'));
    expect(d.save).toHaveBeenCalledWith(VIDEO);
    expect(screen.getByTestId('share-notice')).toHaveTextContent('Saved to Photos.');
  });

  it('renders 4:5 once on switch and discards both renders on close', async () => {
    const d = deps({ renderVideo: jest.fn(async (_u: string, spec: OverlaySpec) => `file:///cache/share-video/${spec.height}.mp4`) });
    const screen = await render(<ShareScreen analysis={snatchReal} pro={false} clip={CLIP} onBack={jest.fn()} deps={d} />);
    await waitFor(() => expect(screen.getByTestId('share-video')).toBeOnTheScreen());
    await press(screen.getByTestId('share-aspect-4:5'));
    await waitFor(() => expect(d.renderVideo).toHaveBeenCalledTimes(2));
    expect((d.renderVideo as jest.Mock).mock.calls[1][1].height).toBe(1350);
    await press(screen.getByTestId('share-aspect-9:16'));
    expect(d.renderVideo).toHaveBeenCalledTimes(2);
    await act(async () => screen.unmount());
    expect(d.discard).toHaveBeenCalledWith('file:///cache/share-video/1920.mp4');
    expect(d.discard).toHaveBeenCalledWith('file:///cache/share-video/1350.mp4');
  });

  it('falls back to the strobe still when the original video is gone', async () => {
    const d = deps();
    const screen = await render(<ShareScreen analysis={snatchMock} pro={false} clip={null} onBack={jest.fn()} deps={d} />);
    expect(d.renderVideo).not.toHaveBeenCalled();
    expect(screen.getByTestId('share-note')).toHaveTextContent("The original video isn't on this phone any more, so this shares a still of the lift.");
    expect(screen.queryByTestId('share-mode')).toBeNull();
    expect(screen.getByTestId('share-card-9:16')).toBeOnTheScreen();
    expect(screen.getByTestId('share-primary')).toHaveTextContent('Share image');
    await press(screen.getByTestId('share-primary'));
    expect((d.renderStill as jest.Mock).mock.calls[0][1]).toBe('9:16');
    expect(d.share).toHaveBeenCalledWith('file:///cache/card.png');
  });

  it('switches from the video to the strobe card', async () => {
    const d = deps();
    const screen = await render(<ShareScreen analysis={snatchReal} pro={false} clip={CLIP} onBack={jest.fn()} deps={d} />);
    await waitFor(() => expect(screen.getByTestId('share-video')).toBeOnTheScreen());
    await press(screen.getByTestId('share-mode-still'));
    expect(screen.queryByTestId('share-video')).toBeNull();
    await press(screen.getByTestId('share-primary'));
    expect(d.share).toHaveBeenCalledWith('file:///cache/card.png');
  });

  it('says so when the share sheet fails', async () => {
    const d = deps({ share: jest.fn(async () => Promise.reject(new Error('no sheet'))) });
    const screen = await render(<ShareScreen analysis={snatchReal} pro={false} clip={CLIP} onBack={jest.fn()} deps={d} />);
    await waitFor(() => expect(screen.getByTestId('share-video')).toBeOnTheScreen());
    await press(screen.getByTestId('share-primary'));
    expect(screen.getByTestId('share-notice')).toHaveTextContent("Couldn't open the share sheet. Try again.");
  });

  it('asks for Photos access when saving is denied', async () => {
    const d = deps({ save: jest.fn(async () => 'denied' as const) });
    const screen = await render(<ShareScreen analysis={snatchReal} pro={false} clip={CLIP} onBack={jest.fn()} deps={d} />);
    await waitFor(() => expect(screen.getByTestId('share-video')).toBeOnTheScreen());
    await press(screen.getByTestId('share-save'));
    expect(screen.getByTestId('share-notice')).toHaveTextContent('Allow Catchline to add to Photos in Settings to save.');
  });

  it('offers a retry when the render fails', async () => {
    const renderVideo = jest.fn().mockRejectedValueOnce(new Error('export')).mockResolvedValueOnce(VIDEO);
    const d = deps({ renderVideo });
    const screen = await render(<ShareScreen analysis={snatchReal} pro={false} clip={CLIP} onBack={jest.fn()} deps={d} />);
    await waitFor(() => expect(screen.getByTestId('share-note')).toHaveTextContent("Couldn't make the video. Try again, or share the still."));
    await press(screen.getByTestId('share-retry'));
    await waitFor(() => expect(screen.getByTestId('share-video')).toBeOnTheScreen());
    expect(renderVideo).toHaveBeenCalledTimes(2);
  });
});
