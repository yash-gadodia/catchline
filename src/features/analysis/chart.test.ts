import { pinched, ticks } from './chart';

describe('axis ticks', () => {
  it('labels a speed range on half metres a second, zero included', () => {
    expect(ticks(-0.1, 1.08, 3)).toEqual([0, 0.5, 1]);
    expect(ticks(-1.52, 2.19, 3)).toEqual([0, 2]);
    expect(ticks(-1.52, 2.19, 4)).toEqual([-1, 0, 1, 2]);
  });

  it('labels a time range on a round step that fits', () => {
    expect(ticks(0, 2.5, 4)).toEqual([0, 1, 2]);
    expect(ticks(0.63, 1.88, 4)).toEqual([1, 1.5]);
    expect(ticks(0.2, 0.45, 4)).toEqual([0.2, 0.3, 0.4]);
  });

  it('has none for an empty range', () => {
    expect(ticks(1, 1, 4)).toEqual([]);
  });
});

describe('pinching the chart', () => {
  const full = { first: 90, last: 240 };

  it('spreading the fingers to twice as wide shows half the frames, around the frame under them', () => {
    expect(pinched(full, 0.5, 0.5, 2, full, 15)).toEqual({ first: 128, last: 203 });
    // fingers a fifth of the way across: frame 120 stays a fifth of the way across
    expect(pinched(full, 0.2, 0.2, 2, full, 15)).toEqual({ first: 105, last: 180 });
  });

  it('sliding both fingers moves the window, and it stops at the ends of the lift', () => {
    const zoomed = { first: 128, last: 203 };
    expect(pinched(zoomed, 0.5, 0.7, 1, full, 15)).toEqual({ first: 113, last: 188 });
    expect(pinched(zoomed, 0.5, 5, 1, full, 15)).toEqual({ first: 90, last: 165 });
    expect(pinched(zoomed, 0.5, -5, 1, full, 15)).toEqual({ first: 165, last: 240 });
  });

  it('goes no closer than the shortest window', () => {
    expect(pinched(full, 0.5, 0.5, 100, full, 15)).toEqual({ first: 158, last: 173 });
  });

  it('pinching back out to the whole lift clears the zoom', () => {
    expect(pinched({ first: 128, last: 203 }, 0.5, 0.5, 0.5, full, 15)).toBeNull();
    expect(pinched({ first: 128, last: 203 }, 0.5, 0.5, 0.25, full, 15)).toBeNull();
  });
});
