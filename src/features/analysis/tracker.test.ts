import type { Body } from '../../analysis/device/tracking';
import { snatchMock } from '../../analysis/fixtures';
import { bones, drawnPath, drawnSide, floorY, frameAt, jointAngles, joints, liftRange, spread, timeOf } from './tracker';

// shoulder, elbow, wrist, hip, knee, ankle, heel, toe; left then right. The right side is unseen but for the hip.
const row = (pts: Record<number, [number, number]>): (number | null)[] => {
  const out: (number | null)[] = new Array<number | null>(32).fill(null);
  for (const [i, [x, y]] of Object.entries(pts)) {
    out[Number(i) * 2] = x;
    out[Number(i) * 2 + 1] = y;
  }
  return out;
};
const STANDING = row({ 0: [0.5, 0.2], 2: [0.5, 0.35], 4: [0.6, 0.35], 6: [0.5, 0.5], 7: [0.52, 0.5], 8: [0.5, 0.7], 10: [0.5, 0.9], 12: [0.48, 0.92], 14: [0.56, 0.93] });
const body: Body = { version: 1, frames: [row({}), STANDING] };

describe('frames and time', () => {
  it('maps a time to the frame on screen and back to a time inside that frame', () => {
    expect(frameAt(0, 30, 90)).toBe(0);
    expect(frameAt(1 / 30, 30, 90)).toBe(1);
    expect(frameAt(0.049, 30, 90)).toBe(1);
    expect(frameAt(99, 30, 90)).toBe(89);
    expect(timeOf(12, 30)).toBeCloseTo(0.41667, 5);
    for (const f of [0, 1, 17, 89]) expect(frameAt(timeOf(f, 30), 30, 90)).toBe(f);
    for (const f of [0, 59, 119]) expect(frameAt(timeOf(f, 59.94), 59.94, 120)).toBe(f);
    // a 60 fps camera clip, ten seconds: every frame boundary lands on its own frame
    for (const f of [0, 1, 299, 599]) {
      expect(frameAt(timeOf(f, 60), 60, 600)).toBe(f);
      expect(frameAt(f / 60, 60, 600)).toBe(f);
      expect(frameAt(f / (60000 / 1001), 60000 / 1001, 600)).toBe(f);
    }
  });
});

describe('liftRange', () => {
  it('is the lift where tracking marked one, the whole clip when asked or when there is none', () => {
    expect(liftRange({ startFrame: 90, endFrame: 240 }, 300, false)).toEqual({ cropped: true, first: 90, last: 240 });
    expect(liftRange({ startFrame: 90, endFrame: 240 }, 300, true)).toEqual({ cropped: false, first: 0, last: 299 });
    expect(liftRange(undefined, 300, false)).toEqual({ cropped: false, first: 0, last: 299 });
  });

  it('ignores a lift that does not fit the clip', () => {
    expect(liftRange({ startFrame: 90, endFrame: 300 }, 300, false)).toEqual({ cropped: false, first: 0, last: 299 });
    expect(liftRange({ startFrame: 240, endFrame: 240 }, 300, false)).toEqual({ cropped: false, first: 0, last: 299 });
    expect(liftRange({ startFrame: -1, endFrame: 240 }, 300, false)).toEqual({ cropped: false, first: 0, last: 299 });
    expect(liftRange(undefined, 0, false)).toEqual({ cropped: false, first: 0, last: 0 });
  });
});

describe('the body on a frame', () => {
  it('reads the joints, leaving unseen ones null', () => {
    const j = joints(body, 1);
    expect(j).toHaveLength(16);
    expect(j[0]).toEqual({ x: 0.5, y: 0.2 });
    expect(j[1]).toBeNull();
    expect(joints(body, 5)).toEqual([]);
    expect(joints(null, 0)).toEqual([]);
  });

  it('draws only bones with both ends seen', () => {
    // left side: all 7 limbs; right side: none (only the hip is seen); hips joined across, shoulders not
    expect(bones(joints(body, 1))).toHaveLength(8);
    expect(bones(joints(body, 0))).toEqual([]);
  });

  it('measures knee, hip and elbow in video pixels from the side that is seen', () => {
    const a = jointAngles(joints(body, 1), { width: 720, height: 1280 });
    expect(a.map((x) => x.name)).toEqual(['elbow', 'hip', 'knee']);
    expect(a[0].deg).toBeCloseTo(90, 5);
    expect(a[1].deg).toBeCloseTo(180, 5);
    expect(a[2].deg).toBeCloseTo(180, 5);
    expect(a[0].at).toEqual({ x: 0.5, y: 0.35 });
  });

  it('puts the floor under the feet of the first frame that shows them', () => {
    expect(floorY(body)).toBe(0.93);
    expect(floorY(null)).toBeNull();
  });
});

describe('drawnSide and spread', () => {
  it('draws one side of the body near side-on (the one seen more), both off side-on or with no angle', () => {
    expect(drawnSide(body, 8)).toBe(0);
    expect(drawnSide(body, 45)).toBe('both');
    expect(drawnSide(body, undefined)).toBe('both');
    expect(drawnSide(null, 0)).toBe('both');
    // the left limbs only: 7 bones, no line across the hips
    expect(bones(joints(body, 1), 0)).toHaveLength(7);
    expect(bones(joints(body, 1), 1)).toEqual([]);
    expect(jointAngles(joints(body, 1), { width: 720, height: 1280 }, 1)).toEqual([]);
  });

  it('moves a label that would cover another down, leaving distant ones alone', () => {
    const out = spread([{ id: 'a', x: 100, y: 200 }, { id: 'b', x: 120, y: 210 }, { id: 'c', x: 300, y: 205 }], 56, 28);
    expect(out).toEqual([{ id: 'a', x: 100, y: 200 }, { id: 'c', x: 300, y: 205 }, { id: 'b', x: 120, y: 228 }]);
  });
});

describe('drawnPath', () => {
  const pts = Array.from({ length: 120 }, (_, frame) => ({ frame, x: 0.5, y: 0.5 }));
  const of = (traceKind: 'bar' | 'hip') => ({ ...snatchMock, traceKind, video: { ...snatchMock.video, fps: 30 }, reps: [{ ...snatchMock.reps[0], path: pts }] });

  it('draws a bar path from its start up to the frame', () => {
    expect(drawnPath(of('bar'), 100)[0].frame).toBe(0);
  });

  it('draws only the last second of a hanging movement’s hip trail', () => {
    const drawn = drawnPath(of('hip'), 100);
    expect(drawn[0].frame).toBe(70);
    expect(drawn[drawn.length - 1].frame).toBe(100);
  });
});
