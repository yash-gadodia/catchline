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

  it('shows all of a wide video in a taller box: full width, centred down', () => {
    const b = fitBox({ width: 1920, height: 1080 }, { width: 400, height: 500 });
    expect(b).toEqual({ left: expect.closeTo(0, 3), top: expect.closeTo(137.5, 3), width: expect.closeTo(400, 3), height: expect.closeTo(225, 3) });
  });
});
