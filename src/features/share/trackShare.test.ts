import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { snatchMock } from '../../analysis/fixtures';
import { buildStory, buildTrackSpec, frameCountOf, pxPerPt, shareCaption, shareChart, storyPlacement, storyValue, type TrackShareOptions } from './trackShare';

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

describe('the 9:16 story a 4.0.5 binary renders', () => {
  const rising = lift({
    video: { uri: '', width: 1080, height: 1920, fps: 30, frameCount: 12 },
    reps: [{ ...snatchMock.reps[0], path: Array.from({ length: 12 }, (_, f) => ({ frame: f, x: 0.4 + f * 0.01, y: 0.8 - f * 0.04, src: 'plate' as const, r: 0.1 })) }],
  });
  const STORY = { kicker: '14 Nov 2026 · 62.5 kg', title: '62.5 kg', code: 'YASH42' };

  it('makes the peak bar speed the number, replays around it at half speed and ends on the weight and the code', () => {
    const spec = buildTrackSpec(rising, null, { ...ALL, speed: 1, details: { graph: true, caption: null }, story: STORY });
    const peak = spec.chart!.values.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(spec.story).toEqual({
      width: 1080,
      height: 1920,
      focusX: 0.455,
      hero: { value: peak[1], unit: 'm/s', label: 'peak bar speed', kicker: '14 Nov 2026 · 62.5 kg', peakFrame: peak[0] },
      replay: { from: 0, to: 11, speed: 0.5 },
      end: { title: '62.5 kg', lines: ['Bar path by Catchline. Free on the App Store.', 'Code YASH42 gets you a month of Pro.'], s: 2 },
      mark: 'catchline',
      displayFonts: ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'],
      bodyFonts: ['SchibstedGrotesk_400Regular', 'SchibstedGrotesk-Regular'],
    });
  });

  it('has no replay when the lifter already slowed the video, and no code line without a code', () => {
    const spec = buildTrackSpec(rising, null, { ...ALL, speed: 0.5, story: { ...STORY, code: null } });
    expect(spec.story?.replay).toBeUndefined();
    expect(spec.story?.end.lines).toEqual(['Bar path by Catchline. Free on the App Store.']);
  });

  it('with no bar speed has no number; the end card is titled by the weight, or "Bar path" without one', () => {
    const spec = buildTrackSpec(lift(), null, { ...ALL, speed: 1, story: { kicker: null, title: null, code: null } });
    expect(spec.story?.hero).toBeUndefined();
    expect(spec.story?.replay).toBeUndefined();
    expect(spec.story?.end.title).toBe('Bar path');
    expect(spec.story?.focusX).toBe(0.425);
  });

  it('is left out unless asked for', () => {
    expect(buildTrackSpec(rising, null, ALL).story).toBeUndefined();
  });
});

describe('where the clip sits on the 9:16 canvas', () => {
  it('a 9:16 clip fills it; the bar path cannot be lowered when there is no room', () => {
    expect(storyPlacement({ width: 1080, height: 1920 }, 0.5, 0.05)).toEqual({ x: 0, y: 0, width: 1, height: 1, wide: false });
  });

  it('a 3:4 clip covers the height and is cropped around the bar path', () => {
    expect(storyPlacement({ width: 810, height: 1080 }, 0.5, 0.4)).toEqual({ x: -0.167, y: 0, width: 1.333, height: 1, wide: false });
    // a path at the left edge: the crop stops at the clip's own edge
    expect(storyPlacement({ width: 810, height: 1080 }, 0.1, 0.4).x).toBe(0);
    expect(storyPlacement({ width: 810, height: 1080 }, 0.95, 0.4).x).toBe(-0.333);
  });

  it('a wide clip fits the width under the header instead of being cropped to a sliver', () => {
    expect(storyPlacement({ width: 1920, height: 1080 }, 0.5, 0.3)).toEqual({ x: 0, y: 0.16, width: 1, height: 0.316, wide: true });
  });
});

describe('the number on the story', () => {
  const hero = { value: 2, peakFrame: 110 };
  it('counts up from the first frame of the lift and holds at its peak', () => {
    expect(storyValue(hero, 10, 10)).toBe(0);
    expect(storyValue(hero, 60, 10)).toBeCloseTo(1.75, 5);
    expect(storyValue(hero, 110, 10)).toBe(2);
    expect(storyValue(hero, 300, 10)).toBe(2);
    expect(storyValue({ value: 2, peakFrame: 5 }, 10, 10)).toBe(2);
  });
});

describe('the caption copied for the post', () => {
  const end = { title: '62.5 kg', lines: [], s: 2 };
  const hero = { value: 1.82, unit: 'm/s', label: 'peak bar speed', kicker: '', peakFrame: 40 };
  it('says the weight and the speed, where the path came from, the code and the tags', () => {
    expect(shareCaption({ hero, end }, 'YASH42', 'https://x/i/?c=YASH42')).toBe(
      '62.5 kg · 1.82 m/s peak bar speed\nBar path by Catchline. Code YASH42 gets you a month of Pro free: https://x/i/?c=YASH42\n#catchline #barpath #weightlifting',
    );
  });
  it('without a weight, a code or a story says only what is true', () => {
    expect(shareCaption({ hero, end: { ...end, title: '1.82 m/s' } }, null, 'https://store')).toBe('1.82 m/s peak bar speed\nBar path by Catchline, free on the App Store: https://store\n#catchline #barpath #weightlifting');
    expect(shareCaption({ end: { ...end, title: 'Bar path' } }, null, 'https://store')).toBe('Bar path by Catchline, free on the App Store: https://store\n#catchline #barpath #weightlifting');
    expect(shareCaption(null, null, 'https://store')).toBe('Bar path by Catchline, free on the App Store: https://store\n#catchline #barpath #weightlifting');
  });
});

describe('the story number is the player\'s number', () => {
  const path = Array.from({ length: 61 }, (_, f) => ({ frame: f, x: 0.5, y: f <= 30 ? 0.8 - f * 0.012 : f <= 45 ? 0.44 : 0.44 - (f - 45) * 0.03, r: 0.05 }));
  const analysis = { video: { uri: 'x', width: 1080, height: 1920, fps: 30, frameCount: 61 }, traceKind: 'bar', reps: [{ path }], lift: { startFrame: 0, endFrame: 40 } } as unknown as Parameters<typeof buildStory>[0];
  const story = { kicker: null, title: null, code: null };

  it('is the peak inside the lift, not a faster reading after it', () => {
    const after = Math.max(...shareChart(analysis, 0, 60)!.values.map(([, v]) => v));
    const hero = buildStory(analysis, story, 0, 60, 1).hero!;
    expect(hero.peakFrame).toBeLessThanOrEqual(40);
    expect(hero.value).toBeLessThan(after);
  });

  it("is measured at the clip's real rate when the screen knows it", () => {
    const recorded = buildStory(analysis, story, 0, 60, 1).hero!.value;
    const real = buildStory(analysis, story, 0, 60, 1, 28.3).hero!.value;
    expect(real / recorded).toBeCloseTo(28.3 / 30, 1);
  });
});
