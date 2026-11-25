import { fitBox, SAMPLE_ANALYSIS, SAMPLE_BODY } from './sample';

describe('the bundled sample lift', () => {
  it('is a tracked lift the welcome screen can draw: a bar path and the joints on every frame', () => {
    expect(SAMPLE_ANALYSIS.traceKind).toBe('bar');
    expect(SAMPLE_ANALYSIS.reps[0].path.length).toBeGreaterThanOrEqual(30);
    expect(SAMPLE_BODY.version).toBe(1);
    expect(SAMPLE_BODY.frames).toHaveLength(SAMPLE_ANALYSIS.video.frameCount);
    expect(SAMPLE_BODY.frames.every((row) => row.length === 32)).toBe(true);
  });
});

describe('fitBox', () => {
  it('shows all of a tall video in a wider box: full height, centred across', () => {
    const b = fitBox({ width: 1080, height: 1920 }, { width: 400, height: 500 });
    expect(b).toEqual({ left: expect.closeTo(59.375, 3), top: expect.closeTo(0, 3), width: expect.closeTo(281.25, 3), height: expect.closeTo(500, 3) });
  });


  it('fills the height with a clip wider than the box, slid across to keep the lifter in the middle', () => {
    // 1920 x 1080 in 400 x 500: scale 500/1080, width 888.9; the lifter at 0.3 across sits at 266.7, so left is 200 - 266.7
    const b = fitBox({ width: 1920, height: 1080 }, { width: 400, height: 500 }, 0.3);
    expect(b).toEqual({ left: expect.closeTo(-66.667, 3), top: expect.closeTo(0, 3), width: expect.closeTo(888.889, 3), height: expect.closeTo(500, 3) });
    // never slid past an edge
    expect(fitBox({ width: 1920, height: 1080 }, { width: 400, height: 500 }, 0.02).left).toBeCloseTo(0, 6);
    expect(fitBox({ width: 1920, height: 1080 }, { width: 400, height: 500 }, 0.99).left).toBeCloseTo(400 - 888.889, 3);
  });
});
