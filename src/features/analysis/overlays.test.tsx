import { render } from '@testing-library/react-native';
import { CurrentDot, FlarePath, KeyDots, OverlaySvg } from './overlays';

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
