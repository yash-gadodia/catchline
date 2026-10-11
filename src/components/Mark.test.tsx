import { act, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import Mark, { AnimatedMark, LaunchOverlay, MARK_DONE_MS } from './Mark';
import { lightTick } from '../lib/haptics';

jest.mock('../lib/haptics', () => ({ lightTick: jest.fn(async () => undefined) }));

const reanimated = Reanimated as unknown as { useReducedMotion: () => boolean };
const motion = reanimated.useReducedMotion;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  reanimated.useReducedMotion = motion;
});
afterEach(() => jest.useRealTimers());

describe('Mark', () => {
  it('draws the C in bone and the dot in flare', async () => {
    const { getByTestId } = await render(<Mark size={48} testID="mark" />);
    const svg = getByTestId('mark');
    expect(svg).toHaveProp('width', 48);
    const json = JSON.stringify((await render(<Mark size={48} />)).toJSON());
    expect(json).toContain('"d":"M118 48 A46 46 0 1 0 118 112"');
    // react-native-svg packs colours as ARGB ints: 0xFFEDE9E1 bone, 0xFFFF1F3D flare.
    expect(json).toContain(`"stroke":{"type":0,"payload":${0xffede9e1}}`);
    expect(json).toContain(`"fill":{"type":0,"payload":${0xffff1f3d}},"propList":["fill"],"cx":118,"cy":48,"r":17`);
  });
});

describe('AnimatedMark', () => {
  it('lands the dot with a light haptic, then finishes after 1400 ms', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await render(<AnimatedMark size={160} onDone={onDone} />);
    expect(getByTestId('animated-mark')).toBeOnTheScreen();
    expect(MARK_DONE_MS).toBe(1400);

    await act(async () => {
      jest.advanceTimersByTime(1259);
    });
    expect(lightTick).toHaveBeenCalledTimes(0);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(lightTick).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(0);
    await act(async () => {
      jest.advanceTimersByTime(140);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows the final mark at once with Reduce Motion', async () => {
    reanimated.useReducedMotion = () => true;
    const onDone = jest.fn();
    await render(<AnimatedMark size={160} onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(lightTick).toHaveBeenCalledTimes(0);
  });
});

describe('LaunchOverlay', () => {
  it('reports when it is on screen so the native splash can hide', async () => {
    const onShown = jest.fn();
    const { getByTestId } = await render(<LaunchOverlay onShown={onShown} onDone={jest.fn()} />);
    const overlay = getByTestId('launch-overlay');
    expect(overlay).toHaveProp('accessibilityLabel', 'Catchline');
    await act(async () => {
      overlay.props.onLayout();
    });
    expect(onShown).toHaveBeenCalledTimes(1);
  });
});
