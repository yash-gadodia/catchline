import type { Analysis, KeyFrame, Measurement, Phase, PhaseName, Point, Rep, TracePoint } from './types';

export function repByIndex(analysis: Analysis, index: number): Rep {
  return analysis.reps.find((r) => r.index === index) ?? analysis.reps[0];
}

export function clampFrame(rep: Rep, frame: number): number {
  return Math.min(rep.endFrame, Math.max(rep.startFrame, Math.round(frame)));
}

// Start inclusive, end exclusive; the final phase also owns its end frame.
export function phaseAt(rep: Rep, frame: number): Phase | null {
  const last = rep.phases[rep.phases.length - 1];
  for (const p of rep.phases) {
    if (frame >= p.startFrame && frame < p.endFrame) return p;
  }
  if (last && frame === last.endFrame) return last;
  return null;
}

export function phaseSeconds(phase: Phase, fps: number): number {
  return (phase.endFrame - phase.startFrame) / fps;
}

export function pointAt(path: TracePoint[], frame: number): Point | null {
  if (path.length === 0) return null;
  if (frame <= path[0].frame) return { x: path[0].x, y: path[0].y };
  const last = path[path.length - 1];
  if (frame >= last.frame) return { x: last.x, y: last.y };
  for (let i = 1; i < path.length; i++) {
    const b = path[i];
    if (frame <= b.frame) {
      const a = path[i - 1];
      const t = (frame - a.frame) / (b.frame - a.frame);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return { x: last.x, y: last.y };
}

export function pathUpTo(path: TracePoint[], frame: number): TracePoint[] {
  const head = path.filter((p) => p.frame < frame);
  const end = pointAt(path, frame);
  if (!end || frame < (path[0]?.frame ?? 0)) return head;
  return [...head, { frame, ...end }];
}

export function pathFrom(path: TracePoint[], frame: number): TracePoint[] {
  const tail = path.filter((p) => p.frame > frame);
  const start = pointAt(path, frame);
  if (!start) return tail;
  return [{ frame, ...start }, ...tail];
}

export function keyFrameAt(rep: Rep, frame: number): KeyFrame {
  let current = rep.keyFrames[0];
  for (const k of rep.keyFrames) {
    if (k.frame <= frame) current = k;
  }
  return current;
}

export function keyFrameForPhase(rep: Rep, phase: string): KeyFrame | undefined {
  return rep.keyFrames.find((k) => k.phase === phase);
}

export function stepKeyFrame(rep: Rep, frame: number, dir: 1 | -1): number {
  const frames = rep.keyFrames.map((k) => k.frame);
  if (dir === 1) {
    const next = frames.find((f) => f > frame);
    return next ?? frame;
  }
  const prev = [...frames].reverse().find((f) => f < frame);
  return prev ?? frame;
}

export function progressOf(rep: Rep, frame: number): number {
  const span = rep.endFrame - rep.startFrame;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (frame - rep.startFrame) / span));
}

export function frameAtProgress(rep: Rep, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(rep.startFrame + p * (rep.endFrame - rep.startFrame));
}

// Scrubber ticks: one per phase boundary (phase starts after the first).
export function phaseTicks(rep: Rep): number[] {
  return rep.phases.slice(1).map((p) => progressOf(rep, p.startFrame));
}

// True when moving from `a` to `b` crosses into a different phase.
export function crossesPhase(rep: Rep, a: number, b: number): boolean {
  return phaseAt(rep, a)?.name !== phaseAt(rep, b)?.name;
}

export function phaseRail(rep: Rep): { name: Phase['name']; weight: number }[] {
  return rep.phases.map((p) => ({ name: p.name, weight: p.endFrame - p.startFrame }));
}

// Floor to the catch: the drop into the catch and the stand-up retrace the
// same column and turn a whole-rep path into a scribble.
export function liftPath(rep: Rep): TracePoint[] {
  const end = rep.keyFrames.find((k) => k.phase === 'catch')?.frame ?? rep.endFrame;
  return pathUpTo(rep.path, end);
}

// A keyframe can sit on the last frame of the phase before it (the catch keyframe ends the
// turnover), so a keyframe names its own phase before the frame ranges do.
export function phaseOfFrame(rep: Rep, frame: number): PhaseName | null {
  return rep.keyFrames.find((k) => k.frame === frame)?.phase ?? phaseAt(rep, frame)?.name ?? null;
}

export function phaseFrame(rep: Rep, name: PhaseName): number {
  return keyFrameForPhase(rep, name)?.frame ?? rep.phases.find((p) => p.name === name)?.startFrame ?? rep.startFrame;
}

// A measure the analysis could not take is stamped with the rep's start frame, which is no phase of its own (#88).
export function measurementsByPhase(rep: Rep, measurements: Measurement[]): Partial<Record<PhaseName, Measurement[]>> {
  const out: Partial<Record<PhaseName, Measurement[]>> = {};
  for (const m of measurements) {
    if (m.frame < rep.startFrame || m.frame > rep.endFrame) continue;
    if (m.status === 'not_seen' && m.frame === rep.startFrame) continue;
    const name = phaseOfFrame(rep, m.frame);
    if (name) (out[name] ??= []).push(m);
  }
  for (const list of Object.values(out)) list?.sort((a, b) => Number(b.status === 'cue') - Number(a.status === 'cue'));
  return out;
}
