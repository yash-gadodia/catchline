import { etaSeconds } from './eta';

describe('etaSeconds', () => {
  it('says nothing until a few seconds and some progress have passed', () => {
    expect(etaSeconds([])).toBeNull();
    expect(etaSeconds([{ at: 0, fraction: 0 }])).toBeNull();
    expect(etaSeconds([{ at: 0, fraction: 0 }, { at: 2000, fraction: 0.2 }])).toBeNull();
    expect(etaSeconds([{ at: 0, fraction: 0 }, { at: 5000, fraction: 0.03 }])).toBeNull();
  });

  it('extrapolates the rate so far over what is left', () => {
    // 20% in 10 s: 40 s more for the remaining 80%
    expect(etaSeconds([{ at: 0, fraction: 0 }, { at: 10000, fraction: 0.2 }])).toBe(40);
    // the first sample anchors the rate, the samples between do not matter
    expect(etaSeconds([{ at: 0, fraction: 0 }, { at: 3000, fraction: 0.5 }, { at: 10000, fraction: 0.2 }])).toBe(40);
    expect(etaSeconds([{ at: 1000, fraction: 0.1 }, { at: 11000, fraction: 0.9 }])).toBe(1);
  });

  it('says nothing once the run is done', () => {
    expect(etaSeconds([{ at: 0, fraction: 0 }, { at: 10000, fraction: 1 }])).toBeNull();
  });
});
