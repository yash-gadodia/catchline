// Tracking only (4.0): every clip the same way, no movement to pick, no reps, phases or cue. The bar path over the whole clip (the
// hips for a hanging movement) with its start line, and the body's joints on every frame.
import { detect } from './detect';
import { finitePt, fromRef, normalise, toRef, toWorld } from './geometry';
import {
  JOINTS, K, L_ANK, L_BIGTOE, L_ELB, L_HEEL, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_BIGTOE, R_ELB, R_HEEL, R_HIP, R_KNEE, R_SHO, R_WRI,
  col, family, lowpassK, signals,
} from './movement';
import { AnalysisJson, Ctx, PlateMark, fail, pathOnly } from './pipeline';
import { DeviceInput } from './source';
import { liftWindow } from './liftWindow';
import { midPt } from './geometry';
import { percentile } from './num';

// The joints kept per frame, in this order; a frame holds x, y for each (normalised to the frame), null where the
// pose has no such joint on that frame.
export const BODY_JOINTS = [L_SHO, R_SHO, L_ELB, R_ELB, L_WRI, R_WRI, L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK, L_HEEL, R_HEEL, L_BIGTOE, R_BIGTOE];
export type Body = { version: 1; frames: (number | null)[][] };

const BRIDGE_S = 0.6;

export type Tracked = { analysis: AnalysisJson; body: Body | null };

// opts.plateMark: a point the user put on the plate (the frame, and x, y as shares of the frame's width and height);
// the plate under it is followed over the whole clip in place of the one the search would find.
export function track(input: DeviceInput, opts: { analysisId?: string; assetPrefix?: string; plateMark?: PlateMark } = {}): Tracked {
  const { meta, lifter } = input;
  const [H, W] = input.shape;
  const n = lifter.k.length;
  const world = toWorld(lifter.k, input.cameraPath);
  const sig = signals(world, meta.fps);
  const hanging = family(sig) === 'hanging';
  const ctx: Ctx = {
    input,
    movement: hanging ? 'kipping_pull_up' : 'snatch',
    analysisId: opts.analysisId ?? 'golden',
    assetPrefix: opts.assetPrefix ?? 'kf',
    k: lifter.k,
    ks: lifter.scores,
    boxes: lifter.boxes,
    world,
    fps: meta.fps,
    H,
    W,
    n,
    plateMark: opts.plateMark,
  };
  if (sig === null) return { analysis: fail(ctx, 'unsupported_movement', 'no_person', 'Could not find a person in this clip.').analysis, body: null };
  const only = pathOnly(ctx, 'no_reps');
  if (!only) return { analysis: fail(ctx, 'unsupported_movement', 'no_path', 'Could not follow the bar or the body in this clip.').analysis, body: null };
  // Once the plate has been followed, the path is the plate's: the hands before it is first read and after it is last
  // read (walking up to the bar, the bar dropped and the lifter moving off) are not the bar, so they are not drawn.
  // Between plate readings the hands stand in only for a short loss (the blur of the pull, BRIDGE_S at most): over a
  // longer one they have often left the bar (between two lifts, the bar on the floor), and the path then joins the
  // two plate readings directly.
  const rep = (only.analysis.reps as { path: { frame: number; x: number; src?: string }[]; guides?: { startX: number } }[])[0];
  const firstPlate = rep.path.findIndex((p) => p.src === 'plate');
  // A barbell clip whose plate was never read gets no bar path at all (11-11, the owner's own clips): the hands walk
  // up to the bar, rest on the hips and leave, and that scribble reads as a wrong answer. The body is still drawn.
  if (firstPlate < 0 && only.analysis.traceKind === 'bar') {
    rep.path = [];
    delete rep.guides;
  }
  if (firstPlate >= 0) {
    let lastPlate = rep.path.length - 1;
    while (rep.path[lastPlate].src !== 'plate') lastPlate -= 1;
    if (lastPlate > firstPlate) {
      const span = rep.path.slice(firstPlate, lastPlate + 1);
      const onPlate = span.filter((p) => p.src === 'plate');
      rep.path = span.filter((p) => {
        if (p.src === 'plate') return true;
        const before = onPlate.filter((q) => q.frame < p.frame).pop();
        const after = onPlate.find((q) => q.frame > p.frame);
        return before !== undefined && after !== undefined && after.frame - before.frame <= BRIDGE_S * meta.fps;
      });
      if (rep.guides) rep.guides.startX = rep.path[0].x;
    }
  }
  const det = detect(world, meta.fps);
  only.analysis.detectedMovement = { movement: det.movement, confidence: det.confidence };

  const { Ms } = input.source.window(0, n);
  const kw = lifter.k.slice(0, Ms.length);
  const cols = Array.from({ length: JOINTS }, (_, j) => toRef(col(kw, j), Ms));
  const kr: K = kw.map((_, f) => cols.map((c) => c[f]));
  const ksm = lowpassK(kr, meta.fps, 6.0);
  const frames = ksm.map((row, f) =>
    BODY_JOINTS.flatMap((j) => {
      if (!finitePt(kr[f][j]) || !finitePt(row[j])) return [null, null];
      const p = normalise(fromRef(row[j], Ms[f]), W, H, 3);
      return [p.x, p.y];
    }),
  );
  // where the lift is in the clip: the hands' height above the feet, in standing heights (the shoulders stand at
  // about 0.82 of it)
  const drop = ksm.map((row) => midPt(row[L_ANK], row[R_ANK])[1] - midPt(row[L_SHO], row[R_SHO])[1]).filter(Number.isFinite);
  const stand = drop.length ? percentile(drop, 90) / 0.82 : NaN;
  const lift = only.analysis.traceKind === 'bar' && stand > 0
    ? liftWindow(ksm.map((row, f) => (finitePt(kr[f][L_WRI]) || finitePt(kr[f][R_WRI]) ? (midPt(row[L_ANK], row[R_ANK])[1] - Math.max(...[row[L_WRI], row[R_WRI]].filter(finitePt).map((p) => p[1]))) / stand : NaN)), meta.fps)
    : null;
  if (lift) only.analysis.lift = lift;
  return { analysis: only.analysis, body: { version: 1, frames } };
}
