import { addAnglePoint, addLine, angleAt, fromScreen, lineLengthCm, lineLengthPx, MAX_SHAPES, type Shape } from './drawGeometry';

const video = { width: 1080, height: 1920 };

describe('line length', () => {
  it('measures in video pixels from normalised points', () => {
    expect(lineLengthPx({ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.6 }, video)).toBeCloseTo(960, 6);
    expect(lineLengthPx({ x: 0, y: 0 }, { x: 0.3, y: 0.1 }, { width: 1000, height: 4000 })).toBeCloseTo(500, 6);
  });

  it('converts to cm with the analysis scale', () => {
    expect(lineLengthCm({ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.6 }, video, 2.4)).toBeCloseTo(400, 6);
    expect(lineLengthCm({ x: 0, y: 0 }, { x: 0.5, y: 0 }, video, 3.6)).toBeCloseTo(150, 6);
  });

  it('has no cm without a scale', () => {
    expect(lineLengthCm({ x: 0, y: 0 }, { x: 0.5, y: 0 }, video, undefined)).toBeNull();
    expect(lineLengthCm({ x: 0, y: 0 }, { x: 0.5, y: 0 }, video, 0)).toBeNull();
  });
});

describe('angle at the vertex', () => {
  const sq = { width: 100, height: 100 };

  it('reads a right angle as 90', () => {
    expect(angleAt({ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.1 }, sq)).toBeCloseTo(90, 6);
  });

  it('reads a straight line as 180', () => {
    expect(angleAt({ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }, sq)).toBeCloseTo(180, 6);
  });

  it('reads an obtuse angle', () => {
    expect(angleAt({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }, sq)).toBeCloseTo(135, 6);
  });

  it('is the same whichever arm is tapped first', () => {
    expect(angleAt({ x: 0.9, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.4, y: 0.4 }, sq)).toBeCloseTo(135, 6);
  });

  it('measures in pixels so a tall frame does not skew it', () => {
    // 0.1 across a 200 px wide frame and 0.05 down a 400 px tall frame are both 20 px: 45 degrees.
    expect(angleAt({ x: 0.6, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.45 }, { width: 200, height: 400 })).toBeCloseTo(45, 6);
  });
});

describe('screen to video coordinates', () => {
  it('inverts the stage fit', () => {
    expect(fromScreen({ x: 60, y: 30 }, { x: -40, y: 10, width: 400, height: 200 })).toEqual({ x: 0.25, y: 0.1 });
  });
});

describe('shape list', () => {
  const p = (x: number) => ({ x, y: x });

  it('collects three taps into one angle', () => {
    let shapes: Shape[] = [];
    shapes = addAnglePoint(shapes, p(0.1));
    shapes = addAnglePoint(shapes, p(0.2));
    expect(shapes).toEqual([{ kind: 'angle', points: [p(0.1), p(0.2)] }]);
    shapes = addAnglePoint(shapes, p(0.3));
    shapes = addAnglePoint(shapes, p(0.4));
    expect(shapes).toEqual([
      { kind: 'angle', points: [p(0.1), p(0.2), p(0.3)] },
      { kind: 'angle', points: [p(0.4)] },
    ]);
  });

  it('a line drops an angle left half-placed', () => {
    const shapes = addLine(addAnglePoint([], p(0.1)), p(0.2), p(0.3));
    expect(shapes).toEqual([{ kind: 'line', points: [p(0.2), p(0.3)] }]);
  });

  it(`stops at ${MAX_SHAPES} shapes`, () => {
    let shapes: Shape[] = [];
    for (let i = 0; i < 4; i++) shapes = addLine(shapes, p(0.1), p(0.2));
    expect(shapes).toHaveLength(3);
    expect(addAnglePoint(shapes, p(0.5))).toBe(shapes);
  });
});
