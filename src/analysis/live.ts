import type { Analysis } from './types';

// Analyses the backend returned this session, keyed by Analysis.id, so the
// result routes (reveal, cue, player, compare) can load them by the same
// `fixture` param the bundled fixtures use.
const live = new Map<string, Analysis>();

export function putLiveAnalysis(a: Analysis): void {
  live.set(a.id, a);
}

export function liveAnalysis(id: string): Analysis | undefined {
  return live.get(id);
}
