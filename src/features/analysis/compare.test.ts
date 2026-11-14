import type { Analysis, TracePoint } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { snatchMock } from '../../analysis/fixtures';
import type { Lift } from '../library/types';
import { anchor, facing, ghostPath, liftPath, liftShape, liftsBefore, peakFrame, sameKindLifts, standingHeightPx } from './compare';

// One body row: both shoulders at shoulderY, both ankles at ankleY, heels at heelX and toes at toeX.
function row(shoulderY: number, ankleY: number, heelX = 0.4, toeX = 0.5): (number | null)[] {
  const r = new Array<number | null>(32).fill(null);
  for (const s of [0, 1]) {
    r[(0 + s) * 2] = 0.5;
    r[(0 + s) * 2 + 1] = shoulderY;
    r[(10 + s) * 2] = 0.5;
    r[(10 + s) * 2 + 1] = ankleY;
    r[(12 + s) * 2] = heelX;
    r[(12 + s) * 2 + 1] = ankleY;
    r[(14 + s) * 2] = toeX;
    r[(14 + s) * 2 + 1] = ankleY;
  }
  return r;
}
const bodyOf = (rows: (number | null)[][]): Body => ({ version: 1, frames: rows });
const pt = (frame: number, x: number, y: number): TracePoint => ({ frame, x, y, src: 'plate' });
function lift(path: TracePoint[], video: { width: number; height: number }, window?: { startFrame: number; endFrame: number }): Analysis {
  return { ...snatchMock, video: { ...snatchMock.video, ...video, frameCount: 100 }, lift: window, reps: [{ ...snatchMock.reps[0], path }] };
}

describe('standingHeightPx', () => {
  it('is the shoulder-to-ankle height near its tallest, in video pixels', () => {
    // nine frames crouched (0.3 of the height) and one standing (0.5): the 90th percentile is the standing one
    const body = bodyOf([...Array.from({ length: 9 }, () => row(0.5, 0.8)), row(0.3, 0.8)]);
    expect(standingHeightPx(body, { width: 1080, height: 1920 })).toBeCloseTo(960, 6);
  });

  it('is unknown with no body or fewer than five frames that show it', () => {
    expect(standingHeightPx(null, { width: 1080, height: 1920 })).toBeNull();
    expect(standingHeightPx(bodyOf([row(0.3, 0.8), row(0.3, 0.8)]), { width: 1080, height: 1920 })).toBeNull();
  });
});

describe('facing', () => {
  it('reads the way the toes point from the heels', () => {
    expect(facing(bodyOf([row(0.3, 0.8, 0.4, 0.5)]))).toBe(1);
    expect(facing(bodyOf([row(0.3, 0.8, 0.5, 0.4)]))).toBe(-1);
    expect(facing(bodyOf([new Array<number | null>(32).fill(null)]))).toBe(0);
    expect(facing(null)).toBe(0);
  });
});

describe('liftPath', () => {
  it('keeps to the frames of the lift when one is marked', () => {
    const path = [pt(5, 0.5, 0.8), pt(20, 0.5, 0.7), pt(40, 0.5, 0.3), pt(90, 0.5, 0.8)];
    expect(liftPath(lift(path, { width: 1080, height: 1920 }, { startFrame: 10, endFrame: 50 }))).toEqual([path[1], path[2]]);
    expect(liftPath(lift(path, { width: 1080, height: 1920 }))).toEqual(path);
  });
});

describe('anchor', () => {
  it('is the lowest point the bar reached before its highest, not where tracking began or where the bar was dropped', () => {
    const path = [pt(0, 0.5, 0.6), pt(5, 0.5, 0.8), pt(20, 0.52, 0.2), pt(40, 0.6, 0.85)];
    expect(anchor(path)).toEqual(path[1]);
    expect(anchor([])).toBeNull();
  });
});

describe('ghostPath', () => {
  const standing = (shoulderY: number) => bodyOf(Array.from({ length: 10 }, () => row(shoulderY, 0.8)));

  it('puts the earlier path’s anchor on today’s and scales it by the two standing heights', () => {
    // earlier: 1080 x 1920, lifter 0.5 of the height = 960 px. today: 720 x 1280, lifter 0.25 = 320 px. scale 1/3.
    const earlier = { analysis: lift([pt(0, 0.5, 0.8), pt(10, 0.6, 0.2)], { width: 1080, height: 1920 }), body: standing(0.3) };
    const today = { analysis: lift([pt(0, 0.4, 0.7), pt(10, 0.4, 0.5)], { width: 720, height: 1280 }), body: standing(0.55) };
    const ghost = ghostPath(earlier, today);
    expect(ghost).toHaveLength(2);
    expect(ghost?.[0].x).toBeCloseTo(0.4, 6);
    expect(ghost?.[0].y).toBeCloseTo(0.7, 6);
    // dx: 0.1 * 1080 px = 108 px, a third = 36 px, over 720 = 0.05. dy: -0.6 * 1920 = -1152 px, a third = -384, over 1280 = -0.3.
    expect(ghost?.[1].x).toBeCloseTo(0.45, 6);
    expect(ghost?.[1].y).toBeCloseTo(0.4, 6);
  });

  it('mirrors the earlier path when the two clips face opposite ways', () => {
    const left = bodyOf(Array.from({ length: 10 }, () => row(0.3, 0.8, 0.5, 0.4)));
    const earlier = { analysis: lift([pt(0, 0.5, 0.8), pt(10, 0.6, 0.2)], { width: 1080, height: 1920 }), body: left };
    const today = { analysis: lift([pt(0, 0.4, 0.7), pt(10, 0.4, 0.5)], { width: 1080, height: 1920 }), body: standing(0.3) };
    const ghost = ghostPath(earlier, today);
    expect(ghost?.[1].x).toBeCloseTo(0.3, 6);
    expect(ghost?.[1].y).toBeCloseTo(0.1, 6);
  });

  it('keeps the earlier path as filmed when a body was not read', () => {
    const earlier = { analysis: lift([pt(0, 0.5, 0.8), pt(10, 0.6, 0.2)], { width: 1080, height: 1920 }), body: null };
    const today = { analysis: lift([pt(0, 0.4, 0.7), pt(10, 0.4, 0.5)], { width: 720, height: 1280 }), body: standing(0.55) };
    const ghost = ghostPath(earlier, today);
    expect(ghost?.[1].x).toBeCloseTo(0.5, 6);
    expect(ghost?.[1].y).toBeCloseTo(0.1, 6);
  });

  it('is nothing when either lift has no bar path', () => {
    const none = { analysis: lift([], { width: 1080, height: 1920 }), body: null };
    const some = { analysis: lift([pt(0, 0.4, 0.7), pt(10, 0.4, 0.5)], { width: 1080, height: 1920 }), body: null };
    expect(ghostPath(none, some)).toBeNull();
    expect(ghostPath(some, none)).toBeNull();
    const hanging = { analysis: { ...some.analysis, traceKind: 'hip' as const }, body: null };
    expect(ghostPath(hanging, some)).toBeNull();
    expect(ghostPath(some, hanging)).toBeNull();
  });
});

describe('liftsBefore', () => {
  const l = (id: string, at: string, more: Partial<Lift> = {}): Lift => ({ id, analysisId: id, movement: 'snatch', date: at.slice(0, 10), at, status: 'done', ...more });
  const lifts = [
    l('today', '2026-11-11T10:00:00.000Z'),
    l('later', '2026-11-12T10:00:00.000Z'),
    l('yesterday', '2026-11-10T10:00:00.000Z'),
    l('older', '2026-11-08T10:00:00.000Z'),
    l('body-only', '2026-11-10T18:00:00.000Z', { shows: 'body' }),
    l('failed', '2026-11-10T19:00:00.000Z', { status: 'failed' }),
  ];

  it('is the finished lifts with a bar path filmed before this one, newest first', () => {
    expect(liftsBefore(lifts, 'today').map((x) => x.id)).toEqual(['yesterday', 'older']);
    expect(liftsBefore(lifts, 'later').map((x) => x.id)).toEqual(['today', 'yesterday', 'older']);
  });

  it('is nothing for the first lift, or a lift not in the library', () => {
    expect(liftsBefore(lifts, 'older')).toEqual([]);
    expect(liftsBefore(lifts, 'missing')).toEqual([]);
  });
});

describe('sameKindLifts', () => {
  const l = (id: string, at: string, more: Partial<Lift> = {}): Lift => ({ id, analysisId: id, movement: 'snatch', date: at.slice(0, 10), at, status: 'done', ...more });
  const lifts = [l('a', '2026-11-11T10:00:00.000Z'), l('later', '2026-11-12T10:00:00.000Z'), l('old', '2026-11-08T10:00:00.000Z'), l('clean', '2026-11-10T10:00:00.000Z'), l('failed', '2026-11-09T10:00:00.000Z', { status: 'failed' })];
  const shapes = { a: 'floor-overhead', later: 'floor-overhead', old: 'floor-overhead', clean: 'floor-shoulders', failed: 'floor-overhead' };

  it('is every other finished lift of the same kind, earlier or later, newest first', () => {
    expect(sameKindLifts(lifts, shapes, 'a').map((x) => x.id)).toEqual(['later', 'old']);
    expect(sameKindLifts(lifts, shapes, 'clean')).toEqual([]);
  });

  it('is nothing for a lift whose kind is not known', () => {
    expect(sameKindLifts(lifts, {}, 'a')).toEqual([]);
    expect(sameKindLifts(lifts, shapes, undefined)).toEqual([]);
  });
});

describe('liftShape', () => {
  // shoulders at 0.3, ankles at 0.8: one shoulder-to-ankle height is half the picture
  const standing = bodyOf(Array.from({ length: 100 }, () => row(0.3, 0.8)));
  const video = { width: 1000, height: 1000, fps: 30 };
  // a path through these heights above the ankles (in shoulder-to-ankle heights), one point a frame
  const through = (heights: number[]) => heights.map((h, f) => pt(f, 0.5, 0.8 - h * 0.5));
  const shape = (heights: number[]) => liftShape({ analysis: lift(through(heights), video), body: standing });
  const ramp = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

  it('tells a snatch, a clean, a deadlift, a squat and a clean and jerk apart', () => {
    expect(shape(ramp(0.1, 1.4, 20))).toBe('floor-overhead');
    expect(shape(ramp(0.1, 0.9, 20))).toBe('floor-shoulders');
    expect(shape(ramp(0.1, 0.5, 20))).toBe('floor-hips');
    expect(shape([...ramp(0.95, 0.5, 10), ...ramp(0.5, 0.95, 10)])).toBe('rack-shoulders');
    // a snatch caught in a deep squat: the bar is low against the ankles for a long time, but an arm above the shoulders
    const deep = bodyOf(Array.from({ length: 100 }, (_, f) => (f >= 10 && f < 40 ? row(0.55, 0.8) : row(0.3, 0.8))));
    const squatCatch = [...ramp(0.1, 1.1, 10), ...new Array(30).fill(0.9), ...ramp(0.9, 1.4, 10)];
    expect(liftShape({ analysis: lift(through(squatCatch), video), body: deep })).toBe('floor-overhead');
    // a clean, the bar resting at the shoulders for half a second, then the jerk
    expect(shape([...ramp(0.1, 0.9, 10), ...new Array(15).fill(0.9), ...ramp(0.9, 1.4, 8)])).toBe('floor-overhead-jerk');
  });

  it('is unknown without a body, or for a body-only result', () => {
    expect(liftShape({ analysis: lift(through(ramp(0.1, 1.3, 20)), video), body: null })).toBeNull();
    expect(liftShape({ analysis: { ...lift(through(ramp(0.1, 1.3, 20)), video), traceKind: 'hip' }, body: standing })).toBeNull();
  });
});

describe('peakFrame', () => {
  it('is the frame where the bar is highest inside the range', () => {
    const path = [pt(0, 0.5, 0.05), pt(10, 0.5, 0.8), pt(20, 0.5, 0.2), pt(30, 0.5, 0.4)];
    expect(peakFrame(path, 5, 30)).toBe(20);
    expect(peakFrame(path, 0, 30)).toBe(0);
    expect(peakFrame(path, 40, 50)).toBeNull();
  });
});
