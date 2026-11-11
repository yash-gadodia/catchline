import { JOINTS, L_ANK, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_HIP, R_KNEE, R_SHO, R_WRI } from './movement';
import { Pt } from './num';
import { DeviceInput } from './source';
import { BODY_JOINTS, track } from './tracking';

// A side-on lifter standing still at 30 fps (inference px, 1280 x 720) whose hands go from the hips to overhead and
// back over three seconds: no movement to pick, not a snatch, clean or jerk.
function clip(n = 90, seen = true): DeviceInput {
  const k = Array.from({ length: n }, (_, f) => {
    const row: Pt[] = Array.from({ length: JOINTS }, (): Pt => [NaN, NaN]);
    if (!seen) return row;
    const up = Math.sin((Math.PI * f) / (n - 1));
    const both = (l: number, r: number, p: Pt) => {
      row[l] = [...p];
      row[r] = [...p];
    };
    both(L_ANK, R_ANK, [360, 1100]);
    both(L_KNEE, R_KNEE, [360, 920]);
    both(L_HIP, R_HIP, [360, 740]);
    both(L_SHO, R_SHO, [360, 520]);
    both(L_WRI, R_WRI, [400, 740 - 500 * up]);
    return row;
  });
  const I = () => [[1, 0, 0], [0, 1, 0]];
  return {
    meta: { width: 1080, height: 1920, fps: 30, frameCount: n },
    shape: [1280, 720],
    lifter: { k, scores: k.map(() => new Array<number>(JOINTS).fill(0.9)), boxes: k.map(() => [300, 360, 460, 1120]) },
    cameraPath: k.map(I),
    source: {
      window: (start, count) => {
        const m = Math.max(0, Math.min(count, n - start));
        return { Ms: Array.from({ length: m }, I), inliers: new Array<number>(m).fill(100) };
      },
      plates: () => [],
      trackPlate: (_s, len) => ({ centres: Array.from({ length: len }, (): Pt => [NaN, NaN]), scores: new Array<number>(len).fill(0) }),
    },
  };
}

describe('track (4.0: tracking only)', () => {
  it('gives any clip one path over the whole clip, the start line and the body on every frame, with no cue', () => {
    const { analysis, body } = track(clip(), { analysisId: 'lift-1', assetPrefix: 'lift-1' });
    const a = analysis as { failure: unknown; cue: unknown; reps: { startFrame: number; endFrame: number; phases: unknown[]; path: { frame: number; x: number; y: number; src?: string }[]; guides?: { startX: number } }[]; noCueReason: unknown; video: { fps: number; frameCount: number } };
    expect([a.failure, a.cue, a.reps.length]).toEqual([null, null, 1]);
    expect(a.noCueReason).toEqual({ code: 'path_only', gate: 'no_reps', offSideDeg: 0 });
    const rep = a.reps[0];
    expect([rep.startFrame, rep.endFrame, rep.phases.length, rep.path.length]).toEqual([0, 89, 0, 90]);
    expect(rep.path.every((p) => p.src === 'wrist')).toBe(true);
    expect(rep.path[0].x).toBeCloseTo(400 / 720, 3);
    expect(rep.guides?.startX).toBe(rep.path[0].x);
    // the hands peak mid-clip, half a metre of pixels above the hips
    const top = rep.path.reduce((m, p) => (p.y < m.y ? p : m));
    expect(top.frame).toBeGreaterThanOrEqual(43);
    expect(top.frame).toBeLessThanOrEqual(46);
    expect(top.y).toBeCloseTo(240 / 1280, 2);
    expect(body?.frames).toHaveLength(90);
    const row = body?.frames[10] ?? [];
    expect(row).toHaveLength(BODY_JOINTS.length * 2);
    // left shoulder, then the left elbow the pose never saw
    expect(row.slice(0, 2)).toEqual([0.5, 0.406]);
    expect(row.slice(4, 6)).toEqual([null, null]);
  });

  it('fails as no person when the pose saw nobody', () => {
    const { analysis, body } = track(clip(90, false));
    expect((analysis as { failure: { code: string } }).failure.code).toBe('no_person');
    expect(body).toBeNull();
  });
});
