import { render } from '@testing-library/react-native';
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
  it('shows the drag as an example beside the instruction before anything is marked', async () => {
    const view = await render(<MarkScreen clip={clip} onBack={jest.fn()} onTrack={jest.fn()} />);
    expect(view.getByTestId('mark-example', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(view.getByTestId('mark-help')).toHaveTextContent('Press on the centre of the plate nearest the camera and drag out to its edge. This shows the tracker which plate to follow, so your bar path comes out more accurate.');
    expect(view.getByTestId('mark-track')).toBeDisabled();
  });
});
