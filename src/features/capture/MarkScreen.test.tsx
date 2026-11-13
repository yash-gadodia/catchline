import { act, fireEvent, render } from '@testing-library/react-native';
import MarkScreen from './MarkScreen';

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    VideoView: View,
    useVideoPlayer: () => ({ pause: jest.fn(), availableVideoTracks: [], generateThumbnailsAsync: () => new Promise(() => {}) }),
  };
});

const clip = { uri: 'file:///lift.mov', durationS: 8, fps: 30, source: 'library' as const, trim: { start: 1, end: 6 }, overridden: [] };

describe('marking the plate', () => {
  it('puts the drag on the picture as a numbered example until the first press, with the why under it', async () => {
    const view = await render(<MarkScreen clip={clip} onBack={jest.fn()} onTrack={jest.fn()} />);
    expect(view.getByTestId('mark-hint')).toHaveTextContent('1Press the middle of the plate2Drag out to its edge');
    expect(view.getByTestId('mark-example', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(view.getByText('Circle the plate')).toBeOnTheScreen();
    expect(view.getByTestId('mark-help')).toHaveTextContent('Circle the plate nearest the camera. It shows the tracker which plate to follow, so your bar path comes out more accurate.');
    expect(view.getByTestId('mark-track')).toBeDisabled();
    // a pull-up or muscle-up has no plate: Skip says so, and tracks the body only
    expect(view.getByTestId('mark-skip')).toHaveTextContent('No plate? Skip');
  });

  it('takes the hint away at the first press on the picture', async () => {
    const view = await render(<MarkScreen clip={clip} onBack={jest.fn()} onTrack={jest.fn()} />);
    await act(async () => {
      fireEvent(view.getByTestId('mark-stage'), 'responderGrant', { nativeEvent: { locationX: 100, locationY: 100, touches: [], changedTouches: [] }, touchHistory: { touchBank: [] } });
    });
    expect(view.queryByTestId('mark-hint')).toBeNull();
  });
});
