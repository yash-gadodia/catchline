import type { Rep } from './types';
import {
  clampFrame,
  crossesPhase,
  frameAtProgress,
  keyFrameAt,
  liftPath,
  measurementsByPhase,
  pathFrom,
  pathUpTo,
  phaseAt,
  phaseFrame,
  phaseOfFrame,
  phaseRail,
  phaseSeconds,
  phaseTicks,
  pointAt,
  progressOf,
  stepKeyFrame,
} from './timeline';

const rep: Rep = {
  index: 2,
  startFrame: 100,
  endFrame: 200,
  made: true,
  phases: [
    { name: 'setup', startFrame: 100, endFrame: 120 },
    { name: 'first_pull', startFrame: 120, endFrame: 150 },
    { name: 'transition', startFrame: 150, endFrame: 200 },
  ],
  keyFrames: [
    { phase: 'setup', frame: 110, image: 'a' },
    { phase: 'first_pull', frame: 140, image: 'b' },
    { phase: 'transition', frame: 160, image: 'c' },
  ],
  path: [
    { frame: 100, x: 0.5, y: 0.8 },
    { frame: 140, x: 0.6, y: 0.4 },
    { frame: 200, x: 0.6, y: 0.1 },
  ],
};

describe('phaseAt', () => {
  it('returns the phase whose span holds the frame (start inclusive, end exclusive)', () => {
    expect(phaseAt(rep, 100)?.name).toBe('setup');
    expect(phaseAt(rep, 119)?.name).toBe('setup');
    expect(phaseAt(rep, 120)?.name).toBe('first_pull');
    expect(phaseAt(rep, 200)?.name).toBe('transition');
  });

  it('returns null outside the rep', () => {
    expect(phaseAt(rep, 99)).toBeNull();
    expect(phaseAt(rep, 201)).toBeNull();
  });
});

describe('pointAt', () => {
  it('interpolates linearly between trace points', () => {
    const p = pointAt(rep.path, 120)!;
    expect(p.x).toBeCloseTo(0.55, 6);
    expect(p.y).toBeCloseTo(0.6, 6);
  });

  it('clamps before the first and after the last point', () => {
    expect(pointAt(rep.path, 50)).toEqual({ x: 0.5, y: 0.8 });
    expect(pointAt(rep.path, 999)).toEqual({ x: 0.6, y: 0.1 });
    expect(pointAt([], 10)).toBeNull();
  });
});

describe('pathUpTo / pathFrom', () => {
  it('cuts the trace at the current frame with an interpolated end point', () => {
    const head = pathUpTo(rep.path, 120);
    expect(head).toHaveLength(2);
    expect(head[0]).toEqual({ frame: 100, x: 0.5, y: 0.8 });
    expect(head[1].frame).toBe(120);
    expect(head[1].x).toBeCloseTo(0.55, 6);
  });

  it('starts the remainder at the same interpolated point', () => {
    const tail = pathFrom(rep.path, 120);
    expect(tail.map((p) => p.frame)).toEqual([120, 140, 200]);
    expect(tail[0].y).toBeCloseTo(0.6, 6);
  });
});

describe('keyframes', () => {
  it('shows the latest keyframe at or before the frame, else the first', () => {
    expect(keyFrameAt(rep, 105).image).toBe('a');
    expect(keyFrameAt(rep, 140).image).toBe('b');
    expect(keyFrameAt(rep, 199).image).toBe('c');
  });

  it('steps to the next and previous keyframe and stays put at the ends', () => {
    expect(stepKeyFrame(rep, 140, 1)).toBe(160);
    expect(stepKeyFrame(rep, 140, -1)).toBe(110);
    expect(stepKeyFrame(rep, 160, 1)).toBe(160);
    expect(stepKeyFrame(rep, 110, -1)).toBe(110);
  });
});

describe('scrubber maths', () => {
  it('converts between frames and progress within the rep', () => {
    expect(progressOf(rep, 150)).toBe(0.5);
    expect(progressOf(rep, 50)).toBe(0);
    expect(frameAtProgress(rep, 0.25)).toBe(125);
    expect(frameAtProgress(rep, 1.4)).toBe(200);
  });

  it('puts a tick at every phase boundary after the first', () => {
    expect(phaseTicks(rep)).toEqual([0.2, 0.5]);
  });

  it('clamps and rounds frames into the rep', () => {
    expect(clampFrame(rep, 12)).toBe(100);
    expect(clampFrame(rep, 150.6)).toBe(151);
    expect(clampFrame(rep, 999)).toBe(200);
  });

  it('detects a phase crossing', () => {
    expect(crossesPhase(rep, 118, 121)).toBe(true);
    expect(crossesPhase(rep, 121, 149)).toBe(false);
  });
});

describe('phase timing', () => {
  it('reports seconds from frames and fps', () => {
    expect(phaseSeconds(rep.phases[1], 60)).toBeCloseTo(0.5, 6);
  });

  it('weights the rail by phase length', () => {
    expect(phaseRail(rep)).toEqual([
      { name: 'setup', weight: 20 },
      { name: 'first_pull', weight: 30 },
      { name: 'transition', weight: 50 },
    ]);
  });
});

describe('liftPath', () => {
  it('ends at the catch keyframe when there is one', () => {
    const withCatch: Rep = { ...rep, keyFrames: [...rep.keyFrames, { phase: 'catch', frame: 170 }] };
    expect(liftPath(withCatch).map((p) => p.frame)).toEqual([100, 140, 170]);
    expect(liftPath(rep).map((p) => p.frame)).toEqual([100, 140, 200]);
  });
});

describe('phaseOfFrame', () => {
  it('names the phase whose keyframe sits on the frame, else the phase the frame is in', () => {
    const r: Rep = { ...rep, keyFrames: [...rep.keyFrames, { phase: 'transition', frame: 149 }] };
    expect(phaseOfFrame(r, 149)).toBe('transition');
    expect(phaseOfFrame(r, 148)).toBe('first_pull');
    expect(phaseOfFrame(r, 99)).toBeNull();
  });
});

describe('phaseFrame', () => {
  it('lands on the phase keyframe, or its first frame without one', () => {
    expect(phaseFrame(rep, 'first_pull')).toBe(140);
    expect(phaseFrame({ ...rep, keyFrames: [] }, 'first_pull')).toBe(120);
  });
});

describe('measurementsByPhase', () => {
  const m = (id: string, frame: number, status: 'cue' | 'normal' = 'normal') => ({ id, label: id, value: 1, unit: 'cm' as const, frame, status, note: '' });

  it("groups the rep's measurements by phase, the cue first, and drops frames outside the rep", () => {
    const grouped = measurementsByPhase(rep, [m('a', 125), m('b', 130, 'cue'), m('c', 105), m('d', 300)]);
    expect(grouped.first_pull?.map((x) => x.id)).toEqual(['b', 'a']);
    expect(grouped.setup?.map((x) => x.id)).toEqual(['c']);
    expect(Object.keys(grouped).sort()).toEqual(['first_pull', 'setup']);
  });
});
