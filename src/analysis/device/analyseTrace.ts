// The Analysis JSON for a lift from its trace (cv/catchline_cv/trace.py TRACE_VERSION 1), as Python's pipeline.run
// gives it under trace.replaying. The phone records the same trace natively; this is the step after pose.
import { analyse } from './analyse';
import { AnalysisJson } from './pipeline';
import { Plan, Trace, TraceMissing, traceInput } from './trace';

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
