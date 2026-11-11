import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { snatchMock } from '../../analysis/fixtures';
import TrackShareScreen, { type TrackShareDeps } from './TrackShareScreen';
import type { TrackSpec } from './trackShare';

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
    share: jest.fn(async () => 'shared' as const),
    discard: jest.fn(),
    ...over,
  };
}

const specOf = (fn: unknown, call = 0) => (fn as jest.Mock).mock.calls[call][1] as TrackSpec;

describe('TrackShareScreen', () => {
  it('shows the clip with the lines on, the body off, and the wordmark', async () => {
    const { getByTestId, queryByTestId } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark onBack={() => {}} deps={deps()} />);
    expect(getByTestId('tracker-lines')).toBeTruthy();
    expect(queryByTestId('tracker-body')).toBeNull();
    expect(getByTestId('share-watermark')).toHaveTextContent('catchline');
    await press(getByTestId('share-toggle-body'));
    expect(getByTestId('tracker-body')).toBeTruthy();
    await press(getByTestId('share-toggle-lines'));
    expect(queryByTestId('tracker-lines')).toBeNull();
  });

  it('renders the video with the chosen layers and speed, then opens the share sheet', async () => {
    const d = deps();
    const { getByTestId, getByText } = await render(<TrackShareScreen analysis={analysis} body={body} clipUri={CLIP} watermark={false} onBack={() => {}} deps={d} />);
    await press(getByTestId('share-toggle-lines'));
    await press(getByTestId('share-toggle-body'));
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
