import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { snatchMock } from '../../analysis/fixtures';
import { buildTrackSpec, frameCountOf, pxPerPt, shareChart, type TrackShareOptions } from './trackShare';

// shoulder, elbow, wrist, hip, knee, ankle, heel, toe; left then right.
const row = (pts: Record<number, [number, number]>): (number | null)[] => {
  const out: (number | null)[] = new Array<number | null>(32).fill(null);
  for (const [i, [x, y]] of Object.entries(pts)) {
    out[Number(i) * 2] = x;
    out[Number(i) * 2 + 1] = y;
  }
  return out;
};
// The left arm and the left foot, plus the right hip: the left side is the one seen.
const SEEN = row({ 0: [0.5, 0.2], 2: [0.5, 0.35], 4: [0.6, 0.35], 7: [0.52, 0.5], 12: [0.48, 0.92], 14: [0.56, 0.93] });
const body: Body = { version: 1, frames: [row({}), SEEN, SEEN] };

const lift = (over: Partial<Analysis> = {}): Analysis => ({
  ...snatchMock,
  video: { uri: '', width: 1080, height: 1920, fps: 59.94, frameCount: 3 },
  reps: [
    {
      ...snatchMock.reps[0],
      path: [
        { frame: 0, x: 0.4, y: 0.8, src: 'plate' },
        { frame: 2, x: 0.45, y: 0.3, src: 'plate' },
      ],
      guides: { ...snatchMock.reps[0].guides!, startX: 0.41 },
    },
  ],
  ...over,
});
const ALL: TrackShareOptions = { path: true, lines: true, body: true, watermark: true, speed: 0.5 };

describe('pxPerPt', () => {
  it('matches the tracker box on a 390 pt phone', () => {
    // portrait 9:16: the box is 506 pt tall, 285 pt wide
    expect(pxPerPt({ width: 1080, height: 1920 })).toBeCloseTo(1080 / 285, 6);
    // landscape and square: full width
    expect(pxPerPt({ width: 1920, height: 1080 })).toBeCloseTo(1920 / 390, 6);
    expect(pxPerPt({ width: 1080, height: 1080 })).toBeCloseTo(1080 / 390, 6);
  });
});

describe('buildTrackSpec', () => {
  it('draws only the last second of a hanging movement’s hip trail, and all of a bar path', () => {
    const hip = { ...lift(), traceKind: 'hip' as const, video: { ...lift().video, fps: 30 } };
    expect(buildTrackSpec(hip, body, ALL).trailFrames).toBe(30);
    expect(buildTrackSpec(lift(), body, ALL).trailFrames).toBeUndefined();
  });

  it('signs the video with the logo lockup and an end card, and leaves both off without the watermark', () => {
    expect(buildTrackSpec(lift(), body, ALL).brand).toEqual({ wordmark: 'Catchline', line: 'Free on the App Store', endLine: 'Track your lift. Free on the App Store.', endS: 1.5, top: 0.12 });
    expect(buildTrackSpec(lift(), body, { ...ALL, watermark: false }).brand).toBeUndefined();
  });

  it('carries the path, the lines, the speed and the clip timing', () => {
    const spec = buildTrackSpec(lift(), body, ALL, 1);
    expect(spec.speed).toBe(0.5);
    expect(spec.fps).toBe(59.94);
    expect(spec.frameCount).toBe(3);
    expect(spec.frame).toBe(1);
    expect(spec.path).toEqual([
      [0, 0.4, 0.8],
      [2, 0.45, 0.3],
    ]);
    expect(spec.startX).toBe(0.41);
    expect(spec.floorY).toBe(0.93);
    expect(spec.watermark).toBe('Catchline · free on the App Store');
  });

  it('draws both sides when the angle is unknown, one side when the clip is side-on', () => {
    const both = buildTrackSpec(lift(), body, ALL);
    expect(both.bones).toEqual([[], [0.5, 0.2, 0.5, 0.35, 0.5, 0.35, 0.6, 0.35, 0.48, 0.92, 0.56, 0.93], [0.5, 0.2, 0.5, 0.35, 0.5, 0.35, 0.6, 0.35, 0.48, 0.92, 0.56, 0.93]]);
    expect(both.joints[1]).toEqual([0.5, 0.2, 0.5, 0.35, 0.6, 0.35, 0.52, 0.5, 0.48, 0.92, 0.56, 0.93]);
    const side = buildTrackSpec(lift({ noCueReason: { code: 'path_only', offSideDeg: 10 } }), body, ALL);
    expect(side.bones[1]).toEqual(both.bones[1]);
    // the right hip is left out
    expect(side.joints[1]).toEqual([0.5, 0.2, 0.5, 0.35, 0.6, 0.35, 0.48, 0.92, 0.56, 0.93]);
  });

  it('leaves out every layer that is switched off', () => {
    const spec = buildTrackSpec(lift(), body, { path: false, lines: false, body: false, watermark: false, speed: 1 });
    expect(spec.path).toEqual([]);
    expect(spec.startX).toBeNull();
    expect(spec.floorY).toBeNull();
    expect(spec.bones).toEqual([]);
    expect(spec.joints).toEqual([]);
    expect(spec.watermark).toBeNull();
    expect(spec.speed).toBe(1);
  });

  it('has no body layer for a lift without one, and falls back to the first traced point for the start line', () => {
    const a = lift();
    const spec = buildTrackSpec({ ...a, reps: [{ ...a.reps[0], guides: undefined }] }, null, ALL);
    expect(spec.bones).toEqual([]);
    expect(spec.floorY).toBeNull();
    expect(spec.startX).toBe(0.4);
  });

  it('sizes the strokes from the design tokens in output pixels, always in the dark palette', () => {
    const { style } = buildTrackSpec(lift(), body, ALL);
    // 1080 / 285 = 3.789 px per pt
    expect(style).toEqual({
      flare: '#FF1F3D',
      halo: '#000000',
      bone: '#EDE9E1',
      pathWidth: 9.47,
      haloWidth: 15.16,
      boneWidth: 7.58,
      lineWidth: 3.79,
      dash: [7.58, 18.95],
      lineAlpha: 0.6,
      dotRadius: 17.05,
      dotStroke: 5.68,
      jointRadius: 11.37,
      jointStroke: 3.79,
      markSize: 56.84,
      markInset: 352.42,
      markFonts: ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'],
    });
  });

  it('covers the whole clip when tracking marked no lift, or the lift does not fit the clip', () => {
    const spec = buildTrackSpec(lift(), body, ALL);
    expect([spec.startFrame, spec.endFrame, spec.frame]).toEqual([0, 2, 0]);
    const off = buildTrackSpec(lift({ lift: { startFrame: 1, endFrame: 3 } }), body, ALL);
    expect([off.startFrame, off.endFrame]).toEqual([0, 2]);
  });

  it('covers the lift only, with the image frame inside it, unless the whole clip is asked for', () => {
    const long = lift({ video: { uri: '', width: 1080, height: 1920, fps: 60, frameCount: 300 }, lift: { startFrame: 90, endFrame: 240 } });
    const spec = buildTrackSpec(long, null, ALL);
    expect([spec.startFrame, spec.endFrame, spec.frame, spec.frameCount]).toEqual([90, 240, 90, 300]);
    expect(buildTrackSpec(long, null, ALL, 12).frame).toBe(90);
    expect(buildTrackSpec(long, null, ALL, 150).frame).toBe(150);
    expect(buildTrackSpec(long, null, ALL, 299).frame).toBe(240);
    // the path is not cut: the renderer draws it up to the frame it is on, as the player does
    expect(spec.path).toEqual([[0, 0.4, 0.8], [2, 0.45, 0.3]]);
    const all = buildTrackSpec(long, null, { ...ALL, whole: true }, 12);
    expect([all.startFrame, all.endFrame, all.frame]).toEqual([0, 299, 12]);
  });

  it('keeps the image frame inside the clip', () => {
    expect(buildTrackSpec(lift(), body, ALL, 99).frame).toBe(2);
    expect(buildTrackSpec(lift(), body, ALL, -4).frame).toBe(0);
    expect(frameCountOf(lift({ video: { uri: '', width: 1080, height: 1920, fps: 30, frameCount: 0 } }), null)).toBe(1);
  });
});

describe('what a 4.0.3 binary draws', () => {
  // a plate read on every frame, rising steadily: one rep, with a bar speed on each frame
  const rising = lift({
    video: { uri: '', width: 1080, height: 1920, fps: 30, frameCount: 12 },
    reps: [{ ...snatchMock.reps[0], path: Array.from({ length: 12 }, (_, f) => ({ frame: f, x: 0.5, y: 0.8 - f * 0.04, src: 'plate' as const, r: 0.1 })) }],
  });

  it('adds the whole path to draw faint, where each rep starts, the speed graph and the lifter line', () => {
    const spec = buildTrackSpec(rising, null, { ...ALL, details: { graph: true, caption: '14 Nov 2026 · 62.5 kg' } });
    expect(spec.ghost).toEqual([Array.from({ length: 12 }, (_, f) => [0.5, 0.8 - f * 0.04])]);
    expect(spec.repStarts).toEqual([0]);
    expect(spec.caption).toBe('14 Nov 2026 · 62.5 kg');
    expect(spec.chart?.unit).toBe('m/s');
    expect(spec.chart?.min).toBe(0);
    expect(spec.chart?.values.length).toBe(8);
    expect(spec.chart?.values.every(([, v]) => v > 0)).toBe(true);
    expect(spec.chart?.max).toBe(Math.max(...(spec.chart?.values ?? []).map(([, v]) => v)));
  });

  it('leaves the graph and the line out when they are switched off, and all of it out on an older binary', () => {
    const quiet = buildTrackSpec(rising, null, { ...ALL, details: { graph: false, caption: null } });
    expect(quiet.chart).toBeUndefined();
    expect(quiet.caption).toBeUndefined();
    expect(quiet.repStarts).toEqual([0]);
    const old = buildTrackSpec(rising, null, ALL);
    expect(old.ghost).toBeUndefined();
    expect(old.repStarts).toBeUndefined();
    expect(old.chart).toBeUndefined();
  });

  it('has no graph for a lift whose plate size was never read', () => {
    expect(shareChart(lift(), 0, 2)).toBeUndefined();
  });
});
