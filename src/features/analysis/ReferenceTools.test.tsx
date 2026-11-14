import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import type { Point } from '../../analysis/types';
import { Freehand, Grid, PlumbLine, gridLines } from './ReferenceTools';

const box = { width: 300, height: 400 };

describe('the grid', () => {
  it('is square cells, six across the picture', () => {
    expect(gridLines(box)).toEqual({ xs: [50, 100, 150, 200, 250], ys: [50, 100, 150, 200, 250, 300, 350] });
    // a line on the picture's bottom edge is left out
    expect(gridLines({ width: 300, height: 120 }).ys).toEqual([50, 100]);
  });

  it('draws one line for each', async () => {
    const { getByTestId } = await render(<Grid box={box} />);
    expect(getByTestId('ref-grid').children).toHaveLength(12);
  });
});

describe('the vertical line', () => {
  function Harness({ start }: { start: number }) {
    const [x, setX] = useState(start);
    return <PlumbLine box={box} x={x} onMove={setX} />;
  }
  const at = (pageX: number) => ({ nativeEvent: { pageX } });

  it('sits where it is put and follows a drag left or right', async () => {
    const { getByTestId } = await render(<Harness start={0.5} />);
    // a 44 pt handle centred on half of 300
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: 128, width: 44, height: 400 });
    await fireEvent(getByTestId('ref-plumb'), 'responderGrant', at(160));
    await fireEvent(getByTestId('ref-plumb'), 'responderMove', at(100));
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: 68 });
    expect(getByTestId('ref-plumb')).toHaveProp('accessibilityValue', { min: 0, max: 100, now: 30 });
  });

  it('stops at the edges of the picture', async () => {
    const { getByTestId } = await render(<Harness start={0.5} />);
    await fireEvent(getByTestId('ref-plumb'), 'responderGrant', at(160));
    await fireEvent(getByTestId('ref-plumb'), 'responderMove', at(900));
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: 278 });
    await fireEvent(getByTestId('ref-plumb'), 'responderMove', at(-900));
    expect(getByTestId('ref-plumb')).toHaveStyle({ left: -22 });
  });

  it('moves a hundredth of the picture at a time for VoiceOver', async () => {
    const onMove = jest.fn();
    const { getByTestId } = await render(<PlumbLine box={box} x={0.5} onMove={onMove} />);
    await fireEvent(getByTestId('ref-plumb'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent(getByTestId('ref-plumb'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onMove.mock.calls).toEqual([[0.51], [0.49]]);
  });
});

describe('freehand drawing', () => {
  function Harness({ drawing = true }: { drawing?: boolean }) {
    const [strokes, setStrokes] = useState<Point[][]>([]);
    return <Freehand box={box} strokes={strokes} onStrokes={setStrokes} drawing={drawing} />;
  }
  const at = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y } });

  it('draws the stroke under the finger and keeps it when the finger lifts', async () => {
    const { getByTestId, queryByTestId } = await render(<Harness />);
    const surface = getByTestId('freehand-surface');
    await fireEvent(surface, 'responderGrant', at(30, 40));
    await fireEvent(surface, 'responderMove', at(60, 80));
    expect(getByTestId('freehand-live')).toHaveProp('d', 'M30.0 40.0 L60.0 80.0');
    await fireEvent(surface, 'responderMove', at(150, 100));
    await fireEvent(surface, 'responderRelease', at(150, 100));
    expect(queryByTestId('freehand-live')).toBeNull();
    expect(getByTestId('freehand-stroke-0')).toHaveProp('d', 'M30.0 40.0 L60.0 80.0 L150.0 100.0');
  });

  it('a tap leaves a dot, and a finger dragged off the picture stays on its edge', async () => {
    const { getByTestId } = await render(<Harness />);
    const surface = getByTestId('freehand-surface');
    await fireEvent(surface, 'responderGrant', at(30, 40));
    await fireEvent(surface, 'responderRelease', at(30, 40));
    expect(getByTestId('freehand-stroke-0')).toHaveProp('d', 'M30.0 40.0 L30.0 40.0');
    await fireEvent(surface, 'responderGrant', at(290, 390));
    await fireEvent(surface, 'responderMove', at(350, 450));
    await fireEvent(surface, 'responderRelease', at(350, 450));
    expect(getByTestId('freehand-stroke-1')).toHaveProp('d', 'M290.0 390.0 L300.0 400.0');
  });

  it('takes no touches when drawing is off', async () => {
    const { queryByTestId } = await render(<Harness drawing={false} />);
    expect(queryByTestId('freehand-surface')).toBeNull();
  });
});
