import type { Analysis, NoCueCode } from './types';

const MOVEMENTS = ['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu'];
const CONFIDENCE = ['clear', 'worth_checking', 'low'];
const NO_CUE: NoCueCode[] = ['off_side_on', 'plate_hidden', 'rep_cut_off', 'unclear_miss', 'low_confidence', 'bar_lost', 'path_only'];

// A partial result: measured (reps, no failure) with the cue held back for a reason.
export function isPartial(a: Analysis): boolean {
  return !a.failure && !a.cue && !!a.noCueReason && a.reps.length > 0;
}

// The reason a partial has no cue; a code from a newer worker reads as low confidence.
export function noCueCode(a: Analysis): NoCueCode | null {
  if (!isPartial(a)) return null;
  const code = a.noCueReason!.code;
  return NO_CUE.includes(code) ? code : 'low_confidence';
}

function inUnit(n: unknown): boolean {
  return typeof n === 'number' && n >= 0 && n <= 1;
}

// Light structural check on JSON from the CV pipeline before the UI trusts it.
export function parseAnalysis(json: unknown): Analysis {
  const a = json as Analysis;
  const fail = (why: string): never => {
    throw new Error(`Invalid Analysis: ${why}`);
  };
  if (!a || typeof a !== 'object') fail('not an object');
  if (a.version !== 1) fail(`version ${String(a.version)}`);
  if (!MOVEMENTS.includes(a.movement)) fail(`movement ${a.movement}`);
  if (a.movementUsed != null && !MOVEMENTS.includes(a.movementUsed)) fail(`movementUsed ${a.movementUsed}`);
  if (a.detectedMovement && a.detectedMovement.movement !== 'unknown' && !MOVEMENTS.includes(a.detectedMovement.movement)) {
    fail(`detectedMovement ${a.detectedMovement.movement}`);
  }
  if (!a.video || !(a.video.fps > 0)) fail('video.fps');
  if (!Array.isArray(a.reps) || a.reps.length === 0) {
    if (!a.failure) fail('no reps and no failure');
  }
  for (const rep of a.reps ?? []) {
    if (rep.path.some((p) => !inUnit(p.x) || !inUnit(p.y))) fail(`rep ${rep.index} path not normalised`);
    for (const [name, track] of Object.entries(rep.tracks ?? {})) {
      if (!Array.isArray(track) || track.some((p) => !inUnit(p.x) || !inUnit(p.y))) fail(`rep ${rep.index} ${name} track not normalised`);
    }
    if (rep.keyFrames.length === 0) fail(`rep ${rep.index} has no keyFrames`);
  }
  if (a.notes != null && !Array.isArray(a.notes)) fail('notes');
  if (a.analysisVersion != null && (typeof a.analysisVersion !== 'string' || a.analysisVersion === '')) fail('analysisVersion');
  if (a.reanalysedAt != null && (typeof a.reanalysedAt !== 'string' || Number.isNaN(Date.parse(a.reanalysedAt)))) fail('reanalysedAt');
  if (a.cue && !CONFIDENCE.includes(a.cue.confidence)) fail(`confidence ${a.cue.confidence}`);
  if (a.noCueReason != null) {
    if (typeof a.noCueReason !== 'object' || typeof a.noCueReason.code !== 'string') fail('noCueReason');
    if (a.noCueReason.offSideDeg != null && typeof a.noCueReason.offSideDeg !== 'number') fail('noCueReason.offSideDeg');
  }
  return a;
}
