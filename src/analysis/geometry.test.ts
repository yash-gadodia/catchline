import { coverFit, focusOn, polylineLength, svgPath, toScreen } from './geometry';

const portrait = { width: 1080, height: 1920 };

describe('coverFit', () => {
  it('fills a 4:5 box with a 9:16 frame by width, cropping height around the focus', () => {
    const fit = coverFit(portrait, { width: 390, height: 488 }, { x: 0.5, y: 0.3 });
    expect(fit.width).toBeCloseTo(390, 6);
    expect(fit.height).toBeCloseTo(693.333, 3);
    expect(fit.x).toBeCloseTo(0, 6);
    expect(fit.y).toBeCloseTo(-61.6, 3);
  });

  it('keeps the zoom origin fixed on screen when zooming', () => {
    const box = { width: 390, height: 390 };
    const origin = { x: 0.7, y: 0.4 };
    const plain = coverFit(portrait, box);
    const zoomed = coverFit(portrait, box, undefined, 1.25, origin);
    const a = toScreen(origin, plain);
    const b = toScreen(origin, zoomed);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(zoomed.width).toBeCloseTo(487.5, 6);
  });
});

describe('toScreen', () => {
  it('maps normalised top-left origin coordinates through the fit', () => {
    const fit = { x: -10, y: -20, width: 400, height: 800 };
    expect(toScreen({ x: 0, y: 0 }, fit)).toEqual({ x: -10, y: -20 });
    expect(toScreen({ x: 0.5, y: 0.25 }, fit)).toEqual({ x: 190, y: 180 });
    expect(toScreen({ x: 1, y: 1 }, fit)).toEqual({ x: 390, y: 780 });
  });
});

describe('focusOn', () => {
  it('centres a point vertically when the crop allows it', () => {
    const box = { width: 390, height: 390 };
    const focus = focusOn({ x: 0.5, y: 0.5 }, portrait, box);
    expect(focus.x).toBe(0.5);
    expect(focus.y).toBeCloseTo(0.5, 6);
  });

  it('clamps to the top edge for a point near the top of the frame', () => {
    const focus = focusOn({ x: 0.5, y: 0.05 }, portrait, { width: 390, height: 390 });
    expect(focus.y).toBe(0);
  });
});

describe('svgPath and polylineLength', () => {
  it('builds an M/L path with one decimal', () => {
    expect(svgPath([{ x: 1, y: 2 }, { x: 3.25, y: 4 }])).toBe('M1.0 2.0 L3.3 4.0');
    expect(svgPath([])).toBe('');
  });

  it('sums segment lengths', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });
});
