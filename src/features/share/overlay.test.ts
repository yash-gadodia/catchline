import { snatchMock, snatchReal } from '../../analysis/fixtures';
import type { Analysis } from '../../analysis/types';
import { buildOverlaySpec, outputDuration, outputTime, repSegments, videoRect } from './overlay';

const MONO = ['SometypeMono_400Regular', 'SometypeMono-Regular'];
const DISPLAY = ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'];
const BLACK = ['BigShouldersDisplay_900Black', 'BigShouldersDisplay-Black'];

describe('videoRect', () => {
  it('covers a 9:16 phone clip edge to edge', () => {
    expect(videoRect({ width: 608, height: 1080 }, { width: 1080, height: 1920 })).toEqual({ x: -0.4, y: 0, width: 1080.9, height: 1920 });
  });

  it('fits a landscape clip whole on black', () => {
    expect(videoRect({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toEqual({ x: 0, y: 656.3, width: 1080, height: 607.5 });
    expect(videoRect({ width: 608, height: 1080 }, { width: 1080, height: 1350 })).toEqual({ x: 160, y: 0, width: 760, height: 1350 });
  });
});

describe('repSegments', () => {
  it('plays a 30 fps rep in real time from the trim start', () => {
    const rep = snatchReal.reps.find((r) => r.index === 2)!;
    expect(repSegments(rep, 30, 2)).toEqual([{ startS: 29.4, endS: 35.567, rate: 1 }]);
  });

  it('slows the first pull to the end of the catch to half speed at 60 fps', () => {
    const rep = snatchMock.reps.find((r) => r.index === snatchMock.cue!.evidence.rep)!;
    const segments = repSegments(rep, 60, 2);
    expect(segments).toEqual([
      { startS: 8, endS: 8.5, rate: 1 },
      { startS: 8.5, endS: 9.867, rate: 0.5 },
      { startS: 9.867, endS: 10.667, rate: 1 },
    ]);
    expect(outputDuration(segments)).toBe(4.034);
    expect(outputTime(segments, 8.5)).toBe(0.5);
    expect(outputTime(segments, 9)).toBe(1.5);
    expect(outputTime(segments, 10.667)).toBe(4.034);
    expect(outputTime(segments, 11)).toBeNull();
  });

  it('cuts a long rep to 12 s', () => {
    const rep = { ...snatchReal.reps[0], startFrame: 0, endFrame: 900, phases: [] };
    expect(repSegments(rep, 30, 0)).toEqual([{ startS: 0, endS: 12, rate: 1 }]);
  });
});

describe('buildOverlaySpec', () => {
  it('builds the 9:16 story from the cue rep: path, dots, text and wordmark in output pixels', () => {
    const spec = buildOverlaySpec(snatchReal, { aspect: '9:16', clipStartS: 2, pro: false });
    expect(spec).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      durationS: 6.167,
      video: { x: -0.4, y: 0, width: 1080.9, height: 1920 },
      pathColor: '#FF1F3D',
      pathWidth: 10,
      dotColor: '#EDE9E1',
      dotRadius: 9,
      scrimFrom: 960,
    });
    expect(spec.path).toHaveLength(66);
    expect(spec.path[0]).toEqual({ t: 0, x: 531.6, y: 1048.1 });
    expect(spec.path[65]).toEqual({ t: 2.167, x: 605.9, y: 189.9 });
    expect(spec.dots).toEqual([
      { t: 0.967, x: 537.2, y: 1028 },
      { t: 1.467, x: 540.3, y: 746.3 },
      { t: 1.6, x: 542.2, y: 649 },
      { t: 2.167, x: 605.9, y: 189.9 },
    ]);
    expect(spec.stack).toEqual({
      x: 64,
      bottom: 1580,
      width: 896,
      gap: 8,
      items: [
        { text: 'Jumped forward', fonts: MONO, size: 30, color: '#A39F97', tracking: 2.4, upper: true },
        { text: '7.4 cm', fonts: BLACK, size: 160, color: '#EDE9E1', tracking: -3.2, upper: false },
        { text: 'Land where you started', fonts: DISPLAY, size: 68, color: '#EDE9E1', tracking: -1.4, upper: false },
      ],
    });
    expect(spec.wordmark).toEqual({ x: 64, y: 250, size: 44, text: { text: 'Catchline', fonts: DISPLAY, size: 40, color: '#EDE9E1', tracking: 0, upper: false } });
  });

  it('keeps the path in step with the slowed pull', () => {
    const spec = buildOverlaySpec(snatchMock, { aspect: '9:16', clipStartS: 2, pro: false });
    expect(spec.durationS).toBe(4.034);
    expect(spec.dots.map((d) => d.t)).toEqual([0.467, 1.234, 1.566, 2.966]);
    expect(spec.path[spec.path.length - 1]).toEqual({ t: 2.966, x: 817.8, y: 499.2 });
  });

  it('lays out 4:5 for the feed with feed margins', () => {
    const spec = buildOverlaySpec(snatchMock, { aspect: '4:5', clipStartS: 2, pro: false });
    expect(spec.height).toBe(1350);
    expect(spec.video).toEqual({ x: 160, y: 0, width: 760, height: 1350 });
    expect(spec.path[0]).toEqual({ t: 0, x: 684.4, y: 756 });
    expect(spec.stack.bottom).toBe(1278);
    expect(spec.stack.width).toBe(952);
    expect(spec.wordmark?.y).toBe(64);
  });

  it('drops the wordmark for paid lifters and the number when there is no cue', () => {
    expect(buildOverlaySpec(snatchMock, { aspect: '9:16', clipStartS: 0, pro: true }).wordmark).toBeNull();
    const noCue: Analysis = { ...snatchMock, cue: null };
    expect(buildOverlaySpec(noCue, { aspect: '9:16', clipStartS: 0, pro: false }).stack.items).toEqual([]);
  });

  it('leaves out path points past the 12 s cut', () => {
    const long: Analysis = {
      ...snatchReal,
      cue: null,
      bestRepIndex: 1,
      reps: [{ ...snatchReal.reps[0], startFrame: 0, endFrame: 900, phases: [], keyFrames: [], path: [{ frame: 0, x: 0.5, y: 0.5 }, { frame: 300, x: 0.5, y: 0.4 }, { frame: 600, x: 0.5, y: 0.3 }] }],
    };
    expect(buildOverlaySpec(long, { aspect: '9:16', clipStartS: 0, pro: false }).path).toEqual([
      { t: 0, x: 540.1, y: 960 },
      { t: 10, x: 540.1, y: 768 },
    ]);
  });
});
