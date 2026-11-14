import { containRect, foundMark, grab, markFrom } from './plateMark';

describe('containRect', () => {
  it('letterboxes a portrait frame in a wider box and a landscape frame in a taller one', () => {
    expect(containRect({ width: 720, height: 1280 }, { width: 400, height: 400 })).toEqual({ x: 87.5, y: 0, width: 225, height: 400 });
    expect(containRect({ width: 1280, height: 720 }, { width: 400, height: 400 })).toEqual({ x: 0, y: 87.5, width: 400, height: 225 });
  });
});

describe('markFrom', () => {
  const rect = { x: 87.5, y: 0, width: 225, height: 400 };
  it('turns a press on the centre dragged to the rim into shares of the frame', () => {
    expect(markFrom({ x: 200, y: 300 }, { x: 240, y: 300 }, rect)).toEqual({ x: 0.5, y: 0.75, r: 0.1 });
  });
  it('refuses a press off the picture and a circle too small to be a plate', () => {
    expect(markFrom({ x: 40, y: 300 }, { x: 80, y: 300 }, rect)).toBeNull();
    expect(markFrom({ x: 200, y: 300 }, { x: 204, y: 300 }, rect)).toBeNull();
  });
});

describe('grab', () => {
  it('moves from inside the circle, resizes from its rim, and starts a new circle from further out', () => {
    expect(grab(0, 50)).toBe('move');
    expect(grab(30, 50)).toBe('move');
    expect(grab(31, 50)).toBe('resize');
    expect(grab(78, 50)).toBe('resize');
    expect(grab(79, 50)).toBe('new');
  });
  it('keeps both bands a fingertip wide on a small circle', () => {
    expect(grab(10, 10)).toBe('move');
    expect(grab(38, 10)).toBe('resize');
    expect(grab(39, 10)).toBe('new');
  });
});

describe('foundMark', () => {
  it('is the first point of the path that carries the plate size', () => {
    expect(foundMark([{ frame: 3, x: 0.4, y: 0.8 }, { frame: 4, x: 0.41, y: 0.79, r: 0.11 }, { frame: 5, x: 0.42, y: 0.7, r: 0.12 }])).toEqual({ frame: 4, x: 0.41, y: 0.79, r: 0.11 });
  });
  it('is null when the tracker found no plate', () => {
    expect(foundMark([])).toBeNull();
    expect(foundMark([{ frame: 0, x: 0.5, y: 0.5 }])).toBeNull();
  });
});
