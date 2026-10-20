// pipeline.run after pose: the entry point of the on-device measurement. Not wired into the app yet.
import { detect, Detected } from './detect';
import { toWorld } from './geometry';
import { run as runLifts } from './lifts';
import { FAMILY, check, signals } from './movement';
import { Ctx, Result, fail, runSnatch } from './pipeline';
import { DeviceInput } from './source';

export type AnalyseOptions = {
  analysisId?: string;
  assetPrefix?: string;
  detected?: Detected;
  // test seam: analyse these rep windows (or gymnastics cycles) instead of the ones the rep finder returns
  forceReps?: [number, number, number][];
};

// The Analysis for one clip from its lifter keypoints, camera motion and plates. Throws for a kipping HSPU (not
// ported: it needs the two-pass upside-down pose the phone does not run).
export function analyse(input: DeviceInput, movement: string, opts: AnalyseOptions = {}): Result {
  const { meta, lifter } = input;
  const fps = meta.fps;
  const [H, W] = input.shape;
  const n = lifter.k.length;
  const world = toWorld(lifter.k, input.cameraPath);
  const ctx: Ctx = {
    input,
    movement,
    analysisId: opts.analysisId ?? 'golden',
    assetPrefix: opts.assetPrefix ?? 'kf',
    k: lifter.k,
    ks: lifter.scores,
    boxes: lifter.boxes,
    world,
    fps,
    H,
    W,
    n,
  };
  const det = opts.detected ?? detect(world, fps);
  const stamp = (res: Result): Result => {
    res.analysis.detectedMovement = { movement: det.movement, confidence: det.confidence };
    return res;
  };
  const sig = signals(world, fps);
  const [ok, msg] = check(movement, sig);
  if (!ok) {
    const code = !(movement in FAMILY) ? 'not_available' : sig === null ? 'no_person' : 'movement_mismatch';
    return stamp(fail(ctx, 'unsupported_movement', code, msg ?? ''));
  }
  if (movement === 'snatch') return stamp(runSnatch(ctx, opts.forceReps));
  return stamp(runLifts(ctx, opts.forceReps));
}
