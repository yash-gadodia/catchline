import { t } from '../../i18n';

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
  if (cue.status === 'stuck') return t('paywall.status.stuck');
  if (cue.status === 'didnt') return t('paywall.status.didnt');
  if (cue.status === 'dropped') return t('paywall.status.dropped');
  return cue.tries !== undefined && cue.of !== undefined
    ? t('paywall.status.tryingOf', { tries: cue.tries, of: cue.of })
    : t('paywall.status.trying');
}
