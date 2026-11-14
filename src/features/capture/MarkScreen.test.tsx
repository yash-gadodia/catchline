import { act, fireEvent, render } from '@testing-library/react-native';
import MarkScreen from './MarkScreen';

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    VideoView: View,
    useVideoPlayer: () => ({ pause: jest.fn(), videoTrack: { size: { width: 1080, height: 1920 } }, availableVideoTracks: [], generateThumbnailsAsync: () => new Promise(() => {}) }),
  };
});

const clip = { uri: 'file:///lift.mov', at: 1, initial: null };

describe('marking the plate', () => {
  it('puts the drag on the picture as a numbered example until the first press, with the why under it', async () => {
    const view = await render(<MarkScreen {...clip} onBack={jest.fn()} onTrack={jest.fn()} />);
    expect(view.getByTestId('mark-hint')).toHaveTextContent('1Press the middle of the plate2Drag out to its edge');
    expect(view.getByTestId('mark-example', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(view.getByText('Adjust plate')).toBeOnTheScreen();
    expect(view.getByTestId('mark-help')).toHaveTextContent('Circle the plate nearest the camera. It shows the tracker which plate to follow, so your bar path comes out more accurate.');
    expect(view.getByTestId('mark-track')).toBeDisabled();
    expect(view.getByTestId('mark-cancel')).toHaveTextContent('Cancel');
  });

  it('takes the hint away at the first press on the picture', async () => {
    const view = await render(<MarkScreen {...clip} onBack={jest.fn()} onTrack={jest.fn()} />);
    await act(async () => {
      fireEvent(view.getByTestId('mark-stage'), 'responderGrant', { nativeEvent: { locationX: 100, locationY: 100, touches: [], changedTouches: [] }, touchHistory: { touchBank: [] } });
    });
    expect(view.queryByTestId('mark-hint')).toBeNull();
  });

  const touch = { touches: [], changedTouches: [] };
  const press = (view: Awaited<ReturnType<typeof render>>) =>
    fireEvent(view.getByTestId('mark-stage'), 'responderGrant', { nativeEvent: { locationX: 100, locationY: 100, ...touch }, touchHistory: { touchBank: [] } });

  it('says what to do next while the finger is down, on the picture', async () => {
    const view = await render(<MarkScreen {...clip} onBack={jest.fn()} onTrack={jest.fn()} />);
    await act(async () => {
      press(view);
    });
    expect(view.getByTestId('mark-coach')).toHaveTextContent('Drag out to the edge of the plate');
  });

  it('brings the example back after a plain tap and says to drag, since a tap marks nothing', async () => {
    const view = await render(<MarkScreen {...clip} onBack={jest.fn()} onTrack={jest.fn()} />);
    await act(async () => {
      press(view);
    });
    await act(async () => {
      fireEvent(view.getByTestId('mark-stage'), 'responderRelease', { nativeEvent: { locationX: 100, locationY: 100, ...touch }, touchHistory: { touchBank: [] } });
    });
    expect(view.getByTestId('mark-tap-hint')).toHaveTextContent("Drag, don't tap");
    expect(view.getByTestId('mark-hint')).toBeOnTheScreen();
    expect(view.queryByTestId('mark-coach')).toBeNull();
    expect(view.getByTestId('mark-track')).toBeDisabled();
  });

  // the stage is 390 wide; a 1080x1920 frame fitted in its height sits centred
  const found = { x: 0.5, y: 0.5, r: 0.1 };
  const stage = (view: Awaited<ReturnType<typeof render>>) => view.getByTestId('mark-stage');
  const at = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, ...touch }, touchHistory: { touchBank: [] } });

  it('opens on the plate the tracker found, with nothing to track again until it is changed', async () => {
    const onTrack = jest.fn();
    const view = await render(<MarkScreen uri="file:///lift.mov" at={1} initial={found} onBack={jest.fn()} onTrack={onTrack} />);
    expect(view.queryByTestId('mark-hint')).toBeNull();
    expect(view.getByTestId('mark-help')).toHaveTextContent('We found the plate here. Drag the circle to move it, or drag its rim to resize it.');
    expect(view.getByTestId('mark-track')).toHaveTextContent('Track again');
    expect(view.getByTestId('mark-track')).toBeDisabled();
  });

  it('Cancel leaves without tracking', async () => {
    const onBack = jest.fn();
    const onTrack = jest.fn();
    const view = await render(<MarkScreen uri="file:///lift.mov" at={1} initial={found} onBack={onBack} onTrack={onTrack} />);
    await act(async () => {
      fireEvent.press(view.getByTestId('mark-cancel'));
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onTrack).not.toHaveBeenCalled();
  });

  it('before tracking, takes the plate found as it is, or skips for a lift with no plate', async () => {
    const onTrack = jest.fn();
    const onSkip = jest.fn();
    const view = await render(<MarkScreen uri="file:///lift.mov" at={1} initial={found} onBack={jest.fn()} onTrack={onTrack} onSkip={onSkip} />);
    expect(view.getByText('Check the plate')).toBeOnTheScreen();
    expect(view.getByTestId('mark-help')).toHaveTextContent('Is the circle on your plate? Drag it to move it, or drag its rim to resize it.');
    expect(view.getByTestId('mark-track')).toHaveTextContent('Track');
    expect(view.getByTestId('mark-track')).toBeEnabled();
    await act(async () => {
      fireEvent.press(view.getByTestId('mark-track'));
    });
    expect(onTrack).toHaveBeenCalledWith(found);
    expect(view.getByTestId('mark-skip')).toHaveTextContent('No plate? Skip');
    await act(async () => {
      fireEvent.press(view.getByTestId('mark-skip'));
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('mark-cancel')).toBeNull();
  });
});
