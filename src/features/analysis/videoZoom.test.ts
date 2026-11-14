import { dragged, held, NO_ZOOM, pinched } from './videoZoom';

const box = { width: 200, height: 400 };

describe('pinched', () => {
  it('doubles the picture when the fingers spread to twice as far apart', () => {
    expect(pinched(NO_ZOOM, { x: 80, y: 200 }, { x: 120, y: 200 }, { x: 60, y: 200 }, { x: 140, y: 200 }, box)).toEqual({ scale: 2, x: 0, y: 0 });
  });
  it('drags the picture with the fingers while enlarging it', () => {
    expect(pinched(NO_ZOOM, { x: 80, y: 200 }, { x: 120, y: 200 }, { x: 90, y: 180 }, { x: 170, y: 180 }, box)).toEqual({ scale: 2, x: 30, y: -20 });
  });
  it('never goes below the whole picture or past four times', () => {
    expect(pinched(NO_ZOOM, { x: 60, y: 200 }, { x: 140, y: 200 }, { x: 90, y: 200 }, { x: 110, y: 200 }, box)).toEqual(NO_ZOOM);
    expect(pinched(NO_ZOOM, { x: 95, y: 200 }, { x: 105, y: 200 }, { x: 0, y: 200 }, { x: 200, y: 200 }, box).scale).toBe(4);
  });
});

describe('dragged and held', () => {
  it('moves an enlarged picture, stopping at its own edge', () => {
    expect(dragged({ scale: 2, x: 0, y: 0 }, 40, -60, box)).toEqual({ scale: 2, x: 40, y: -60 });
    expect(dragged({ scale: 2, x: 0, y: 0 }, 500, -500, box)).toEqual({ scale: 2, x: 100, y: -200 });
  });
  it('leaves the whole picture where it is', () => {
    expect(held({ scale: 1, x: 30, y: 30 }, box)).toEqual(NO_ZOOM);
  });
});
