import { render } from '@testing-library/react-native';
import { CurrentDot, FeetMarks, FlarePath, KeyDots, OverlaySvg, TrackPath } from './overlays';

const box = { width: 100, height: 100 };
const pts = [
  { x: 10, y: 90 },
  { x: 12, y: 50 },
  { x: 11, y: 10 },
];

function find(node: unknown, pred: (props: Record<string, unknown>) => boolean, out: Record<string, unknown>[] = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => find(n, pred, out));
    return out;
  }
  const n = node as { props?: Record<string, unknown>; children?: unknown };
  if (n.props && pred(n.props)) out.push(n.props);
  find(n.children, pred, out);
  return out;
}

describe('overlay weights on a real clip', () => {
  it('the bar path is 2.5 pt with a thin 4 pt black outline', async () => {
    const view = await render(
      <OverlaySvg box={box}>
        <FlarePath points={pts} />
      </OverlaySvg>
    );
    const strokes = find(view.toJSON(), (p) => p.d !== undefined).map((p) => p.strokeWidth);
    expect(strokes).toEqual([4, 2.5]);
  });

  it('the dashed low-confidence path keeps its dashes at the thinner weight', async () => {
    const view = await render(
      <OverlaySvg box={box}>
        <FlarePath points={pts} dashed />
      </OverlaySvg>
    );
    const flare = find(view.toJSON(), (p) => p.d !== undefined && p.strokeWidth === 2.5);
    expect(flare.map((p) => [p.strokeDasharray, p.strokeLinecap])).toEqual([[['8', '6'], 0]]);
  });

  it('the hip track is a 2 pt bone line and the shoulder track a dashed hairline, both under the flare path', async () => {
    const view = await render(
      <OverlaySvg box={box}>
        <TrackPath points={pts} kind="hips" />
        <TrackPath points={pts} kind="shoulders" />
        <FlarePath points={pts} />
      </OverlaySvg>
    );
    const paths = find(view.toJSON(), (p) => p.d !== undefined).map((p) => [p.strokeWidth, p.strokeDasharray ?? null]);
    expect(paths).toEqual([
      [2, null],
      [1, ['3', '3']],
      [4, null],
      [2.5, null],
    ]);
  });

  it('the feet marks are two ticks joined by a dotted line with the shift over the landing, one tick when the feet stayed', async () => {
    const moved = await render(
      <OverlaySvg box={box}>
        <FeetMarks start={{ x: 20, y: 90 }} end={{ x: 40, y: 90 }} label="3 cm forward" />
      </OverlaySvg>
    );
    const lines = find(moved.toJSON(), (p) => p.x1 !== undefined).map((p) => [p.x1, p.x2, p.strokeDasharray ?? null]);
    expect(lines).toEqual([
      [13, 27, null],
      [33, 47, null],
      [20, 40, ['2', '3']],
    ]);
    expect(moved.getByTestId('feet-shift').props.children.props.children).toBe('3 cm forward');
    const stayed = await render(
      <OverlaySvg box={box}>
        <FeetMarks start={{ x: 20, y: 90 }} end={{ x: 22, y: 90 }} />
      </OverlaySvg>
    );
    expect(find(stayed.toJSON(), (p) => p.x1 !== undefined)).toHaveLength(1);
  });

  it('phase dots are 6 pt across and the current dot 10.5 pt, outline included', async () => {
    const view = await render(
      <OverlaySvg box={box}>
        <KeyDots points={pts} />
        <CurrentDot point={pts[0]} />
      </OverlaySvg>
    );
    const circles = find(view.toJSON(), (p) => p.r !== undefined).map((p) => Number(p.r) * 2);
    expect(circles).toEqual([5, 5, 5, 9]);
  });
});
