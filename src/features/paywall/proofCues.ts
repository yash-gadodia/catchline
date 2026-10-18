import { useMemo } from 'react';
import { t } from '../../i18n';
import { sessionsDone } from '../library/derive';
import { useLibrary } from '../library/repository';
import type { CueRecord, Session } from '../library/types';

export type CueStatus = 'stuck' | 'trying' | 'didnt' | 'dropped';
export type ProofCue = { text: string; status: CueStatus; tries?: number; of?: number };

// The lifter's own cues, newest first, shown as proof on the paywall. A lifter with no
// cues yet gets no rows: the sheet never shows someone else's cues as theirs.
export function proofCuesFrom(cues: CueRecord[], sessions: Session[]): ProofCue[] {
  return [...cues]
    .sort((a, b) => (a.givenAt < b.givenAt ? 1 : a.givenAt > b.givenAt ? -1 : 0))
    .slice(0, 3)
    .map((c) =>
      c.status === 'trying'
        ? { text: c.text, status: 'trying', tries: sessionsDone(c, sessions), of: c.sessionsTarget }
        : { text: c.text, status: c.status === 'didnt_stick' ? 'didnt' : c.status }
    );
}

export function useProofCues(): ProofCue[] {
  const { cues, sessions } = useLibrary();
  return useMemo(() => proofCuesFrom(cues, sessions), [cues, sessions]);
}

export function cueStatusLabel(cue: ProofCue): string {
  if (cue.status === 'stuck') return t('paywall.status.stuck');
  if (cue.status === 'didnt') return t('paywall.status.didnt');
  if (cue.status === 'dropped') return t('paywall.status.dropped');
  return cue.tries !== undefined && cue.of !== undefined
    ? t('paywall.status.tryingOf', { tries: cue.tries, of: cue.of })
    : t('paywall.status.trying');
}
