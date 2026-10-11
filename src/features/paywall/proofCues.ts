export type CueStatus = 'stuck' | 'trying' | 'didnt' | 'dropped';
export type ProofCue = { text: string; status: CueStatus; tries?: number; of?: number };

// The lifter's own cues, shown as proof on the paywall. Local stand-in for the
// cue-memory store until Phase 3; the order is the order they were earned.
const LOCAL: ProofCue[] = [
  { text: 'Finish the pull before you drop', status: 'stuck' },
  { text: 'Stay over the bar longer', status: 'trying', tries: 3, of: 6 },
  { text: 'Hips to the bar on the MU', status: 'trying', tries: 1, of: 6 },
];

export function getProofCues(): ProofCue[] {
  return LOCAL;
}

export function cueStatusLabel(cue: ProofCue): string {
  if (cue.status === 'stuck') return 'Stuck';
  if (cue.status === 'didnt') return "Didn't stick";
  if (cue.status === 'dropped') return 'Dropped';
  return cue.tries !== undefined && cue.of !== undefined ? `Trying · ${cue.tries} of ${cue.of}` : 'Trying';
}
