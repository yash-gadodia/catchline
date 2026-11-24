import { act, fireEvent, render } from '@testing-library/react-native';
import { useVideoPlayer } from 'expo-video';
import { SAMPLE_ANALYSIS } from './sample';
import SampleTour from './SampleTour';

const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
  await act(async () => {
    fireEvent.press(el);
  });
};

describe('the sample tour', () => {
  beforeEach(() => jest.clearAllMocks());

  it('two taps: the video and that it stays on the phone, then the plate circled on its first frame, then on to tracking', async () => {
    const onTrack = jest.fn();
    const screen = await render(<SampleTour onTrack={onTrack} />);
    const player = (useVideoPlayer as jest.Mock).mock.results[0].value;
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 of 3')).toBeOnTheScreen();
    expect(screen.getByText('From your camera roll or filmed in the app. It never leaves your iPhone.')).toBeOnTheScreen();
    expect(screen.queryByTestId('tour-plate')).toBeNull();
    await press(screen.getByText('Next'));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 of 3')).toBeOnTheScreen();
    expect(screen.getByText('Catchline finds the bar')).toBeOnTheScreen();
    expect(screen.getByTestId('tour-plate')).toBeOnTheScreen();
    expect(onTrack).not.toHaveBeenCalled();
    await press(screen.getByText('Track it'));
    expect(onTrack).toHaveBeenCalledTimes(1);
  });

  it('with Reduce Motion the video does not play', async () => {
    await render(<SampleTour onTrack={jest.fn()} reduceMotion />);
    const player = (useVideoPlayer as jest.Mock).mock.results[0].value;
    expect(player.play).not.toHaveBeenCalled();
  });

  it('the bundled sample has the plate size on its first frame (the circle) and along the path (bar speed)', () => {
    const path = SAMPLE_ANALYSIS.reps[0].path;
    expect(path[0].r).toBeGreaterThan(0);
    expect(path.filter((p) => (p.r ?? 0) > 0).length / path.length).toBeGreaterThan(0.8);
  });
});
