import { act, render, waitFor, fireEvent } from '@testing-library/react-native';
import PoseCoreML from '../../../modules/pose-coreml';
import PlateRoute from '../../../app/capture/plate';
import { useCapture } from './store';
import { submitDraft } from './submit';

const mockNav = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockNav, useNavigation: () => ({ setOptions: jest.fn(), getParent: () => undefined }) }));
jest.mock('../../lib/useNoSwipeBack', () => ({ useNoSwipeBack: jest.fn() }));
jest.mock('./submit', () => ({ submitDraft: jest.fn(() => true) }));
jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return { __esModule: true, VideoView: View, useVideoPlayer: () => ({ pause: jest.fn(), videoTrack: { size: { width: 1080, height: 1920 } }, availableVideoTracks: [], generateThumbnailsAsync: () => new Promise(() => {}) }) };
});

const find = (PoseCoreML as unknown as { findPlate: jest.Mock }).findPlate;
const clip = { uri: 'file:///lift.mov', durationS: 8, fps: 30, source: 'library' as const, trim: { start: 1, end: 6 }, overridden: [] };

beforeEach(() => {
  jest.clearAllMocks();
  useCapture.setState({ draft: clip });
});

describe('finding the plate before tracking', () => {
  it('looks on the first trimmed frame and tracks from the plate the lifter takes', async () => {
    find.mockResolvedValue({ x: 0.5, y: 0.8, r: 0.1, confidence: 0.9 });
    const view = await render(<PlateRoute />);
    await waitFor(() => expect(view.getByTestId('mark-screen')).toBeOnTheScreen());
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith('file:///lift.mov', 1);
    await act(async () => {
      fireEvent.press(view.getByTestId('mark-track'));
    });
    expect(useCapture.getState().draft?.plateMark).toEqual({ x: 0.5, y: 0.8, r: 0.1 });
    expect(submitDraft).toHaveBeenCalledWith({ replace: true });
  });

  it('looks a little later when the first frame has no plate, and remembers which frame it was', async () => {
    find.mockResolvedValueOnce(null).mockResolvedValueOnce({ x: 0.4, y: 0.7, r: 0.12, confidence: 0.6 });
    const view = await render(<PlateRoute />);
    await waitFor(() => expect(view.getByTestId('mark-screen')).toBeOnTheScreen());
    expect(find).toHaveBeenNthCalledWith(2, 'file:///lift.mov', 1.5);
    await act(async () => {
      fireEvent.press(view.getByTestId('mark-track'));
    });
    expect(useCapture.getState().draft?.plateMark).toEqual({ x: 0.4, y: 0.7, r: 0.12, atS: 0.5 });
  });

  it('asks the lifter to circle it, or skip, when no plate is found', async () => {
    find.mockResolvedValue(null);
    const view = await render(<PlateRoute />);
    await waitFor(() => expect(view.getByTestId('mark-hint')).toBeOnTheScreen());
    expect(find).toHaveBeenCalledTimes(3);
    expect(view.getByTestId('mark-track')).toBeDisabled();
    await act(async () => {
      fireEvent.press(view.getByTestId('mark-skip'));
    });
    expect(useCapture.getState().draft?.plateMark).toBeNull();
    expect(submitDraft).toHaveBeenCalledWith({ replace: true });
  });
});
