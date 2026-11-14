import { fireEvent, render } from '@testing-library/react-native';
import SpeedChart from './SpeedChart';

// a lift on frames 90 to 240 at 60 fps: 0.54 m/s to frame 170, then 1.08
const at = new Map(Array.from({ length: 131 }, (_, i) => [100 + i, 100 + i <= 170 ? 0.54 : 1.08] as const));
const base = { at, first: 90, last: 240, rep: { start: 90, end: Infinity }, fps: 60 };
// 336 wide: 36 for the speed labels, 300 of plot
const layout = { nativeEvent: { layout: { width: 336, height: 140 } } };
const touches = (...xs: number[]) => ({ nativeEvent: { pageX: xs[0], locationX: xs[0], touches: xs.map((pageX) => ({ pageX })) } });

async function chart(props: Partial<Parameters<typeof SpeedChart>[0]> = {}) {
  const onSeek = jest.fn();
  const onZoom = jest.fn();
  const view = await render(<SpeedChart {...base} frame={162} onSeek={onSeek} onZoom={onZoom} {...props} />);
  await fireEvent(view.getByTestId('speed-plot'), 'layout', layout);
  return { ...view, onSeek, onZoom };
}

describe('SpeedChart axes', () => {
  it('labels speed in half metres a second and time in seconds from the start of the lift', async () => {
    const { getByTestId, queryByTestId, getByText } = await chart();
    expect(getByText('m/s')).toBeOnTheScreen();
    expect(['speed-tick-y-0', 'speed-tick-y-1', 'speed-tick-y-2'].map((id) => getByTestId(id).props.children)).toEqual(['0.0', '0.5', '1.0']);
    expect(queryByTestId('speed-tick-y-3')).toBeNull();
    expect(['speed-tick-x-0', 'speed-tick-x-1', 'speed-tick-x-2'].map((id) => getByTestId(id).props.children)).toEqual(['0.0 s', '1.0 s', '2.0 s']);
    expect(queryByTestId('speed-tick-x-3')).toBeNull();
  });

  it('shows the playhead with its time, and a dot on the line where the speed was read', async () => {
    const { getByTestId } = await chart();
    expect(getByTestId('speed-cursor-time')).toHaveTextContent('1.20 s');
    expect(getByTestId('speed-cursor')).toBeOnTheScreen();
    expect(getByTestId('speed-now-dot')).toBeOnTheScreen();
  });

  it('has a cursor but no dot on a frame with no reading, and keeps the numbers row', async () => {
    const { getByTestId, queryByTestId } = await chart({ frame: 95 });
    expect(getByTestId('speed-cursor-time')).toHaveTextContent('0.08 s');
    expect(queryByTestId('speed-now-dot')).toBeNull();
    expect(getByTestId('speed-stats')).toHaveTextContent('now – · avg up 0.79 · min 0.54 · max 1.08 m/s');
  });

  it('still draws without a frame rate (no time labels)', async () => {
    const { getByTestId, queryByTestId } = await chart({ fps: undefined });
    expect(getByTestId('speed-line')).toBeOnTheScreen();
    expect(queryByTestId('speed-tick-x-0')).toBeNull();
    expect(queryByTestId('speed-cursor-time')).toBeNull();
  });
});

describe('SpeedChart gestures', () => {
  it('a finger on the plot seeks to the frame under it', async () => {
    const { getByTestId, onSeek } = await chart();
    const plot = getByTestId('speed-plot');
    // a tap seeks as the finger lifts (a finger landing may be the first of a pinch)
    await fireEvent(plot, 'responderGrant', touches(186));
    expect(onSeek).not.toHaveBeenCalled();
    await fireEvent(plot, 'responderRelease', touches(186));
    expect(onSeek.mock.calls).toEqual([[165]]);
    await fireEvent(plot, 'responderGrant', touches(186));
    await fireEvent(plot, 'responderMove', touches(336));
    // left of the plot (over the speed labels) is the first frame
    await fireEvent(plot, 'responderMove', touches(10));
    expect(onSeek.mock.calls).toEqual([[165], [240], [90]]);
  });

  it('spreading two fingers zooms the time axis around them, and does not seek', async () => {
    const { getByTestId, onSeek, onZoom } = await chart();
    const plot = getByTestId('speed-plot');
    await fireEvent(plot, 'responderGrant', touches(136, 236));
    await fireEvent(plot, 'responderMove', touches(136, 236));
    await fireEvent(plot, 'responderMove', touches(86, 286));
    expect(onZoom).toHaveBeenLastCalledWith({ first: 128, last: 203 });
    // one finger lifts: the other does not scrub
    await fireEvent(plot, 'responderMove', touches(86));
    await fireEvent(plot, 'responderRelease', touches(86));
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('zoomed in, it shows only that part of the lift and seeks inside it', async () => {
    const { getByTestId, queryByTestId, onSeek } = await chart({ zoom: { first: 128, last: 203 }, frame: 100 });
    expect(['speed-tick-x-0', 'speed-tick-x-1'].map((id) => getByTestId(id).props.children)).toEqual(['1.0 s', '1.5 s']);
    expect(queryByTestId('speed-tick-x-2')).toBeNull();
    // the playhead is before the window
    expect(queryByTestId('speed-cursor')).toBeNull();
    await fireEvent(getByTestId('speed-plot'), 'responderGrant', touches(186));
    await fireEvent(getByTestId('speed-plot'), 'responderRelease', touches(186));
    expect(onSeek).toHaveBeenLastCalledWith(165.5);
  });

  it('offers a reset only while zoomed', async () => {
    const whole = await chart();
    expect(whole.queryByTestId('speed-zoom-reset')).toBeNull();
    const zoomed = await chart({ zoom: { first: 128, last: 203 } });
    expect(zoomed.getByTestId('speed-zoom-reset')).toHaveTextContent('reset zoom');
    fireEvent.press(zoomed.getByTestId('speed-zoom-reset'));
    expect(zoomed.onZoom).toHaveBeenLastCalledWith(null);
  });

  it('does not pinch where the screen does not ask for zoom', async () => {
    const { getByTestId, onSeek } = await chart({ onZoom: undefined });
    await fireEvent(getByTestId('speed-plot'), 'responderGrant', touches(136, 236));
    await fireEvent(getByTestId('speed-plot'), 'responderMove', touches(86, 286));
    expect(onSeek).toHaveBeenLastCalledWith(115);
  });
});
