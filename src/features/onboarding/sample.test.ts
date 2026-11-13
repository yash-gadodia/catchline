import { coverBox, focusY, SAMPLE_ANALYSIS, SAMPLE_BODY } from './sample';
import { snatchMock } from '../../analysis/fixtures';

describe('the bundled sample lift', () => {
  it('is a tracked lift the welcome screen can draw: a bar path and the joints on every frame', () => {
    expect(SAMPLE_ANALYSIS.traceKind).toBe('bar');
    expect(SAMPLE_ANALYSIS.reps[0].path.length).toBeGreaterThanOrEqual(30);
    expect(SAMPLE_BODY.version).toBe(1);
    expect(SAMPLE_BODY.frames).toHaveLength(SAMPLE_ANALYSIS.video.frameCount);
    expect(SAMPLE_BODY.frames.every((row) => row.length === 32)).toBe(true);
  });
});

describe('coverBox', () => {
  it('fills a wider box at full width, slid so the focus sits in the middle', () => {
    // 1080 x 1920 into 400 x 500: scale 400/1080, height 711.1; focus 0.5 centres it (top -105.6)
    const b = coverBox({ width: 1080, height: 1920 }, { width: 400, height: 500 }, 0.5);
    expect(b.left).toBeCloseTo(0, 6);
    expect(b.width).toBeCloseTo(400, 6);
    expect(b.height).toBeCloseTo(711.111, 3);
    expect(b.top).toBeCloseTo(-105.556, 3);
  });

  it('never slides the video off an edge of the box', () => {
    expect(coverBox({ width: 1080, height: 1920 }, { width: 400, height: 500 }, 0.05).top).toBe(0);
    expect(coverBox({ width: 1080, height: 1920 }, { width: 400, height: 500 }, 0.99).top).toBeCloseTo(500 - 711.111, 3);
  });

  it('fills a taller box at full height, centred across', () => {
    const b = coverBox({ width: 1920, height: 1080 }, { width: 400, height: 500 }, 0.5);
    expect(b.height).toBeCloseTo(500, 6);
    expect(b.width).toBeCloseTo(888.889, 3);
    expect(b.left).toBeCloseTo(-244.444, 3);
    expect(b.top).toBeCloseTo(0, 6);
  });
});

describe('focusY', () => {
  it('is half way between the highest and lowest tracked point', () => {
    const analysis = { ...snatchMock, reps: [{ ...snatchMock.reps[0], path: [{ frame: 0, x: 0.5, y: 0.8, src: 'plate' as const }, { frame: 1, x: 0.5, y: 0.2, src: 'plate' as const }] }] };
    expect(focusY(analysis, null)).toBeCloseTo(0.5, 6);
    const row = new Array<number | null>(32).fill(null);
    row[0] = 0.5;
    row[1] = 0.9;
    expect(focusY(analysis, { version: 1, frames: [row] })).toBeCloseTo(0.55, 6);
    expect(focusY({ ...analysis, reps: [] }, null)).toBe(0.5);
  });
});
