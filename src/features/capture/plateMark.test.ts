import { containRect, markFrom } from './plateMark';

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
