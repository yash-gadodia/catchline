import type { TracePoint } from '../../analysis/types';
import { cropAround, correctionFrame, labelIn, liftFrames, pickTracked, MAX_CROP_PX, type PlatePoint } from './crops';

const frame = { width: 1080, height: 1920 };
const ids = () => {
  let n = 0;
  return () => `f${++n}`;
};
const video = { uri: '', width: 1080, height: 1920, fps: 60, frameCount: 120 };
const rep = (path: TracePoint[]) => [{ path }] as never;
// a pull: still for 10 frames, up from 0.8 to 0.3 by frame 40 (fastest at 20 -> 21), down again
const pull: TracePoint[] = [
  { frame: 0, x: 0.5, y: 0.8, src: 'plate' },
  { frame: 10, x: 0.5, y: 0.8, src: 'plate' },
  { frame: 20, x: 0.5, y: 0.7, src: 'plate' },
  { frame: 21, x: 0.5, y: 0.62, src: 'plate' },
  { frame: 30, x: 0.5, y: 0.5, src: 'plate' },
  { frame: 40, x: 0.52, y: 0.3, src: 'plate' },
  { frame: 60, x: 0.5, y: 0.6, src: 'plate' },
];

describe('cropAround', () => {
  it('is three plate diameters wide, centred on the plate', () => {
    // r 0.05 of 1920 = 96 px; 6 r = 576 px square around (540, 960)
    expect(cropAround({ x: 0.5, y: 0.5 }, 0.05, frame)).toEqual({ left: 0.2333, top: 0.35, side: 0.3, px: 512 });
  });

  it('never makes a JPEG wider than 512 px and never upscales a small crop', () => {
    expect(cropAround({ x: 0.5, y: 0.5 }, 0.3, frame).px).toBe(MAX_CROP_PX);
    // r 0.02 of 1920 = 38.4 px; 6 r = 230.4 px
    expect(cropAround({ x: 0.5, y: 0.5 }, 0.02, frame).px).toBe(230);
  });

  it('never covers the whole frame, however big the plate was drawn', () => {
    // 6 r would be 3456 px; capped at 0.8 of the 1080 px side = 864 px = 0.45 of the height
    expect(cropAround({ x: 0.5, y: 0.5 }, 0.3, frame)).toEqual({ left: 0.1, top: 0.275, side: 0.45, px: 512 });
  });

  it('is shifted to stay inside the frame at an edge', () => {
    expect(cropAround({ x: 0.98, y: 0.02 }, 0.05, frame)).toEqual({ left: 0.4667, top: 0, side: 0.3, px: 512 });
  });

  it('uses a stock plate size when none is known', () => {
    // 0.08 of 1920 = 153.6 px; 6 r = 921.6, capped at 864
    expect(cropAround({ x: 0.5, y: 0.5 }, null, frame).side).toBe(0.45);
  });
});

describe('labelIn', () => {
  it('puts a centred plate at the middle of its crop, a sixth of the side in radius', () => {
    const crop = cropAround({ x: 0.5, y: 0.5 }, 0.05, frame);
    // the crop's left edge is kept to 4 places (0.2333 of 1080 = 251.96 px, not 252), and the label is true to that crop
    expect(labelIn(crop, frame, { x: 0.5, y: 0.5 }, 0.05)).toEqual({ x: 0.5001, y: 0.5, r: 0.1667 });
  });

  it('follows the plate when the crop was shifted off an edge', () => {
    const crop = cropAround({ x: 0.98, y: 0.02 }, 0.05, frame);
    // centre (1058.4, 38.4) px in a 576 px crop starting at (504, 0)
    const label = labelIn(crop, frame, { x: 0.98, y: 0.02 }, 0.05);
    expect(label.x).toBeCloseTo(0.9625, 3);
    expect(label.y).toBeCloseTo(0.0667, 3);
    expect(label.r).toBe(0.1667);
  });
});

describe('pickTracked', () => {
  it('picks lift-off, mid-pull, the top and the fastest frame', () => {
    expect(pickTracked({ reps: rep(pull), traceKind: 'bar', lift: { startFrame: 10, endFrame: 60 } }).map((p) => p.frame)).toEqual([10, 30, 40, 21]);
  });

  it('leaves out the marked frame and never repeats one', () => {
    expect(pickTracked({ reps: rep(pull), traceKind: 'bar' }, [0]).map((p) => p.frame)).toEqual([30, 40, 21]);
  });

  it('sends nothing read off the wrists, and nothing for a hip trace', () => {
    const wrists = pull.map((p) => ({ ...p, src: 'wrist' as const }));
    expect(pickTracked({ reps: rep(wrists), traceKind: 'bar' })).toEqual([]);
    expect(pickTracked({ reps: rep(pull), traceKind: 'hip' })).toEqual([]);
  });
});

describe('liftFrames', () => {
  const base = { liftId: 'lift-1', analysis: { reps: rep(pull), traceKind: 'bar' as const, video, failure: null } };

  it('sends the mark as a strong label and up to four tracked frames as weak ones', () => {
    const frames = liftFrames({ ...base, mark: { x: 0.5, y: 0.8, r: 0.05 }, newId: ids() });
    expect(frames.map((f) => [f.id, f.kind, f.frame])).toEqual([
      ['f1', 'mark', 0],
      ['f2', 'track', 30],
      ['f3', 'track', 40],
      ['f4', 'track', 21],
    ]);
    expect(frames[0].label).toEqual({ x: 0.5001, y: 0.5, r: 0.1667 });
    // the tracker gives no size today: the crop is sized from the mark, the label carries the centre alone
    expect(frames[1].crop.side).toBe(0.3);
    expect(frames[1].label).toEqual({ x: 0.5001, y: 0.5, r: null });
    expect(frames[1].confidence).toBeNull();
  });

  it('sends no strong label when the mark was skipped', () => {
    const frames = liftFrames({ ...base, mark: null, newId: ids() });
    expect(frames.map((f) => f.kind)).toEqual(['track', 'track', 'track', 'track']);
    expect(frames.map((f) => f.frame)).toEqual([0, 30, 40, 21]);
  });

  it('carries the tracker size and score once it reports them', () => {
    const scored: PlatePoint[] = pull.map((p) => ({ ...p, r: 0.04, score: 0.9 }));
    const frames = liftFrames({ ...base, analysis: { ...base.analysis, reps: rep(scored) }, mark: null, newId: ids() });
    expect(frames[0].label.r).toBe(0.1667);
    expect(frames[0].confidence).toBe(0.9);
  });

  it('sends the mark alone for a lift that failed', () => {
    const frames = liftFrames({ ...base, analysis: { ...base.analysis, failure: { reason: 'unknown' } as never }, mark: { x: 0.5, y: 0.8, r: 0.05 }, newId: ids() });
    expect(frames.map((f) => f.kind)).toEqual(['mark']);
  });

  it('keeps every crop inside 512 px and inside the frame', () => {
    for (const r of [0.02, 0.05, 0.1, 0.3, 1]) {
      for (const f of liftFrames({ ...base, mark: { x: 0.02, y: 0.99, r }, newId: ids() })) {
        expect(f.crop.px).toBeLessThanOrEqual(512);
        expect(f.crop.side * 1920).toBeLessThanOrEqual(0.8 * 1080 + 0.5);
        expect(f.crop.left).toBeGreaterThanOrEqual(0);
        expect(f.crop.top).toBeGreaterThanOrEqual(0);
        expect(f.crop.left * 1080 + f.crop.side * 1920).toBeLessThanOrEqual(1080.5);
        expect(f.crop.top + f.crop.side).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});

describe('correctionFrame', () => {
  it('is a strong label on the frame the lifter was on', () => {
    expect(correctionFrame({ liftId: 'lift-1', frame: 37, mark: { x: 0.5, y: 0.5, r: 0.05 }, size: frame, newId: ids() })).toEqual({
      id: 'f1',
      liftId: 'lift-1',
      kind: 'correction',
      frame: 37,
      crop: { left: 0.2333, top: 0.35, side: 0.3, px: 512 },
      label: { x: 0.5001, y: 0.5, r: 0.1667 },
      confidence: null,
    });
  });
});
