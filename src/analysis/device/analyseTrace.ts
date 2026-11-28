// The Analysis JSON for a lift from its trace (cv/catchline_cv/trace.py TRACE_VERSION 1), as Python's pipeline.run
// gives it under trace.replaying. The phone records the same trace natively; this is the step after pose.
import { analyse } from './analyse';
import { AnalysisJson, PlateMark, Result } from './pipeline';
import { Plan, Trace, TraceMissing, traceInput } from './trace';
import { Body, track } from './tracking';

export type Analysis = AnalysisJson;
type Opts = { analysisId?: string; assetPrefix?: string };

function replay(trace: unknown, movement: string, opts: Opts) {
  const t = trace as Trace;
  if (!t || typeof t !== 'object' || t.traceVersion !== 1) throw new TraceMissing(`trace version ${(t as Trace | null)?.traceVersion}`);
  const input = traceInput(t, movement);
  return { input, analysis: analyse(input, movement, opts).analysis };
}

export function analyseTrace(trace: unknown, movement: string, opts: Opts = {}): Analysis {
  return replay(trace, movement, opts).analysis;
}

// The eval loop's view: the analysis plus the pipeline's per-rep internals (yaw, scale method, events) and the misses
export function analyseTraceResult(trace: unknown, movement: string, opts: Opts = {}): Result & { misses: string[] } {
  const t = trace as Trace;
  if (!t || typeof t !== 'object' || t.traceVersion !== 1) throw new TraceMissing(`trace version ${(t as Trace | null)?.traceVersion}`);
  const input = traceInput(t, movement);
  return { ...analyse(input, movement, opts), misses: input.replayer.misses };
}

// What the native pixel stages still owe this trace: the rep windows to stabilise, the setup frames to search for
// plates, the plate tracks and the stills, read off the replay's misses (trace.Replayer semantics). Empty windows,
// plates and tracks with no misses: the trace is complete and analyseTrace's answer is the server's.
export function planFromMisses(trace: unknown, movement: string, opts: Opts = {}): Plan & { misses: string[] } {
  const { input, analysis } = replay(trace, movement, opts);
  const n = input.lifter.k.length;
  const reps = (analysis.reps ?? []) as { keyFrames: { frame: number; image: string }[] }[];
  const keyframes = reps.flatMap((r) =>
    r.keyFrames.map((kf) => ({ name: kf.image.slice(kf.image.lastIndexOf('/') + 1), frame: Math.min(Math.max(kf.frame, 0), n - 1) })),
  );
  return { ...input.replayer.plan, keyframes, misses: input.replayer.misses };
}

// The trace's frame rate is one over the clip's shortest frame. A clip with a single one-tick frame (seen on a 60 fps
// clip, 27-11-2026) reads as 600 fps, the 3.5 s clip then counted as a third of a second, and a clear side-on snatch
// failed as "no person". No phone films above 240: past that, or well past what the transcoder read, the transcoder's
// rate is the clip's.
const MAX_FPS = 240;
export function clipFps(traced: number, known?: number): number {
  if (!known || !(known > 0)) return traced;
  return traced > MAX_FPS || traced > 1.5 * known ? known : traced;
}

// 4.0, tracking only: the clip's path and body from its trace, with what the native stages still owe it. The lifter
// is the one the phone picked for a standing movement, whatever the clip shows. With opts.plateMark (a frame and a
// point on the plate, x and y as shares of the frame) the plan asks for the follow of that plate, both ways from the
// frame; run it, merge the trace, and call again with the same plateMark.
// opts.fps: the clip's frame rate as the transcoder read it (see clipFps).
export function trackTrace(trace: unknown, opts: Opts & { plateMark?: PlateMark; plateSkipped?: boolean; fps?: number } = {}): { analysis: Analysis; body: Body | null; plan: Plan; misses: string[] } {
  const read = trace as Trace;
  if (!read || typeof read !== 'object' || read.traceVersion !== 1) throw new TraceMissing(`trace version ${(read as Trace | null)?.traceVersion}`);
  const t: Trace = { ...read, meta: { ...read.meta, fps: clipFps(read.meta.fps, opts.fps) } };
  const input = traceInput(t, 'snatch');
  const { analysis, body } = track(input, opts);
  const n = input.lifter.k.length;
  const reps = (analysis.reps ?? []) as { keyFrames: { frame: number; image: string }[] }[];
  const keyframes = reps.flatMap((r) =>
    r.keyFrames.map((kf) => ({ name: kf.image.slice(kf.image.lastIndexOf('/') + 1), frame: Math.min(Math.max(kf.frame, 0), n - 1) })),
  );
  return { analysis, body, plan: { ...input.replayer.plan, keyframes }, misses: input.replayer.misses };
}
