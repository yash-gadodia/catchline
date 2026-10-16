import { act, fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Dimensions, processColor } from 'react-native';
import { coverFit } from '../../analysis/geometry';
import { snatchMock } from '../../analysis/fixtures';
import { colors } from '../../design/tokens';
import DrawLayer from './DrawLayer';
import PlayerScreen from './PlayerScreen';
import type { Shape } from './drawGeometry';

const box = { width: 200, height: 100 };
const fit = { x: 0, y: 0, width: 200, height: 100 };
const video = { width: 400, height: 200 };

function Harness({ pxPerCm, drawing = true }: { pxPerCm?: number; drawing?: boolean }) {
  const [shapes, setShapes] = useState<Shape[]>([]);
  return <DrawLayer box={box} fit={fit} video={video} pxPerCm={pxPerCm} shapes={shapes} onShapes={setShapes} drawing={drawing} />;
}

const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y } });

async function drag(surface: Parameters<typeof fireEvent>[0], from: [number, number], to: [number, number]) {
  await fireEvent(surface, 'responderGrant', touch(...from));
  await fireEvent(surface, 'responderMove', touch(...to));
  await fireEvent(surface, 'responderRelease', touch(...to));
}

const tap = (surface: Parameters<typeof fireEvent>[0], x: number, y: number) => drag(surface, [x, y], [x, y]);

beforeEach(() => jest.clearAllMocks());

describe('DrawLayer', () => {
  it('a drag draws a line labelled in cm from the analysis scale', async () => {
    const view = await render(<Harness pxPerCm={2} />);
    await drag(view.getByTestId('draw-surface'), [10, 10], [10, 60]);
    // 50 pt on a 200x100 stage over a 400x200 video is 100 px; at 2 px/cm that is 50 cm.
    expect(view.getByTestId('draw-label-0')).toHaveTextContent('50.0 cm');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('a line has no length label without a scale', async () => {
    const view = await render(<Harness />);
    await drag(view.getByTestId('draw-surface'), [10, 10], [10, 60]);
    expect(view.getByTestId('draw-shape-0')).toBeOnTheScreen();
    expect(view.queryByTestId('draw-label-0')).toBeNull();
  });

  it('three taps place an angle that reads in degrees at the vertex, one tick per point', async () => {
    const view = await render(<Harness pxPerCm={2} />);
    const surface = view.getByTestId('draw-surface');
    await tap(surface, 50, 50);
    await tap(surface, 100, 50);
    expect(view.queryByTestId('draw-label-0')).toBeNull();
    await tap(surface, 100, 0);
    expect(view.getByTestId('draw-label-0')).toHaveTextContent('90°');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3);
  });

  it('draws the shape being placed in flare and finished ones in bone', async () => {
    const view = await render(<Harness pxPerCm={2} />);
    const surface = view.getByTestId('draw-surface');
    await drag(surface, [10, 10], [10, 60]);
    await tap(surface, 50, 50);
    expect(view.getByTestId('draw-shape-0')).toHaveProp('stroke', { type: 0, payload: processColor(colors.text) });
    expect(view.getByTestId('draw-shape-1')).toHaveProp('stroke', { type: 0, payload: processColor(colors.flare) });
  });

  it('stops at three shapes', async () => {
    const view = await render(<Harness pxPerCm={2} />);
    const surface = view.getByTestId('draw-surface');
    for (let i = 0; i < 4; i++) await drag(surface, [10 + i * 20, 10], [10 + i * 20, 60]);
    expect(view.getByTestId('draw-shape-2')).toBeOnTheScreen();
    expect(view.queryByTestId('draw-shape-3')).toBeNull();
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3);
  });

  it('takes no touches outside draw mode', async () => {
    const view = await render(<Harness drawing={false} />);
    expect(view.queryByTestId('draw-surface')).toBeNull();
  });
});

describe('PlayerScreen draw mode', () => {
  const props = { onBack: () => {}, onShare: () => {} };
  const press = async (el: Parameters<typeof fireEvent.press>[0]) => {
    await act(async () => {
      fireEvent.press(el);
    });
  };

  it('offers Draw only when paused', async () => {
    const view = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    expect(view.getByTestId('toggle-draw')).not.toBeChecked();
    await press(view.getByTestId('stage-press'));
    expect(view.queryByTestId('toggle-draw')).toBeNull();
  });

  it('draws in draw mode, keeps the marks after stepping out of it, and clears them', async () => {
    const view = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    expect(view.queryByTestId('draw-surface')).toBeNull();
    expect(view.queryByTestId('toggle-clear')).toBeNull();
    await press(view.getByTestId('toggle-draw'));
    expect(view.getByTestId('toggle-draw')).toBeChecked();
    expect(view.getByTestId('stage-press')).toBeDisabled();
    await drag(view.getByTestId('draw-surface'), [100, 100], [100, 300]);
    const { width, height } = Dimensions.get('window');
    const box = { width, height: Math.round(Math.min(width * 1.25, height * 0.45)) };
    const fit = coverFit(snatchMock.video, box, { x: 0.5, y: 0.3 });
    const cm = (200 * snatchMock.video.height) / fit.height / (snatchMock.pxPerCm ?? 1);
    expect(view.getByTestId('draw-label-0')).toHaveTextContent(`${cm.toFixed(1)} cm`);

    await press(view.getByTestId('step-forward'));
    expect(view.queryByTestId('draw-surface')).toBeNull();
    expect(view.getByTestId('toggle-draw')).not.toBeChecked();
    expect(view.getByTestId('draw-shape-0')).toBeOnTheScreen();

    await press(view.getByTestId('toggle-clear'));
    expect(view.queryByTestId('draw-shape-0')).toBeNull();
    expect(view.queryByTestId('toggle-clear')).toBeNull();
  });

  it('drops a half-placed angle when draw mode is turned off', async () => {
    const view = await render(<PlayerScreen analysis={snatchMock} {...props} />);
    await press(view.getByTestId('toggle-draw'));
    await tap(view.getByTestId('draw-surface'), 100, 100);
    expect(view.getByTestId('draw-shape-0')).toBeOnTheScreen();
    await press(view.getByTestId('toggle-draw'));
    expect(view.queryByTestId('draw-shape-0')).toBeNull();
  });
});
