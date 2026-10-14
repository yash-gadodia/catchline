import type { Analysis, Cue, Measurement, Movement, PhaseName } from './types';

const MOVEMENT: Record<Movement, string> = {
  snatch: 'Snatch',
  clean: 'Clean',
  jerk: 'Jerk',
  kipping_pull_up: 'Kipping pull-up',
  bar_muscle_up: 'Bar muscle-up',
  kipping_hspu: 'Kipping HSPU',
};

const PHASE: Record<PhaseName, string> = {
  setup: 'Setup',
  first_pull: '1st pull',
  transition: 'Transition',
  second_pull: '2nd pull',
  turnover: 'Turnover',
  catch: 'Catch',
  recovery: 'Recovery',
  hang: 'Hang',
  arch: 'Arch',
  hollow: 'Hollow',
  hip_drive: 'Hip drive',
  support: 'Support',
  lockout: 'Lockout',
  tuck: 'Tuck',
  drive: 'Drive',
  press: 'Press',
};

export function movementLabel(m: Movement): string {
  return MOVEMENT[m];
}

export function phaseLabel(p: PhaseName): string {
  return PHASE[p];
}

export function fmt(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(2)));
}

export function seconds(s: number): string {
  return s.toFixed(2);
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function liftTitle(a: Analysis, rep?: number | 'miss'): string {
  const parts = [movementLabel(a.movement)];
  if (a.loadKg != null) parts.push(`${fmt(a.loadKg)} kg`);
  if (rep === 'miss') parts.push('miss');
  else if (rep != null) parts.push(`rep ${rep}`);
  return parts.join(' · ');
}

export function heroValue(cue: Cue): string {
  return `${fmt(cue.evidence.value)} ${cue.evidence.unit}`;
}

export function evidenceReadout(cue: Cue): string {
  return `frame ${cue.evidence.frame} · ${cue.evidence.caption}`;
}

const STATUS_TEXT: Partial<Record<Measurement['status'], string>> = {
  cue: 'the cue',
  follows: 'follows from above',
  normal: 'within normal',
  best: 'best',
};

export function measurementReadout(m: Measurement): string {
  if (m.status === 'not_seen') return 'not seen';
  const parts = [`${fmt(m.value)} ${m.unit}`];
  if (m.note) parts.push(m.note);
  const showBest = m.status === 'normal' && m.best != null;
  if (showBest) parts.push(`best ${fmt(m.best!)}`);
  const status = STATUS_TEXT[m.status];
  if (status && !showBest) parts.push(status);
  return parts.join(' · ');
}

// No ▲/▼: an up-arrow reads as "better" even when a bigger number is worse.
// The delta is plain signed text against the other lift.
export type CompareRow = { id: string; label: string; value: string; delta: string };

export const COMPARE_IDS = ['bar_drift_hip', 'pull_time', 'catch_depth'];

export function signed(n: number): string {
  const v = Number(n.toFixed(2));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
}

export function compareRows(
  today: Measurement[],
  other: Measurement[],
  word: 'best' | 'last',
  ids: string[] = COMPARE_IDS
): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const id of ids) {
    const a = today.find((m) => m.id === id);
    const b = other.find((m) => m.id === id);
    if (!a || !b || a.status === 'not_seen' || b.status === 'not_seen') continue;
    const diff = a.value - b.value;
    const same = Math.abs(diff) <= Math.max(Math.abs(b.value), 1e-9) * 0.05;
    rows.push({
      id,
      label: a.label,
      value: `${fmt(a.value)} ${a.unit}`,
      delta: same ? `same as ${word}` : `${signed(diff)} vs ${word}`,
    });
  }
  return rows;
}

export type StepState = 'done' | 'active' | 'todo';

// With no analysis yet (a live lift) the first step is the upload and the rep
// count is still unknown.
export function processingSteps(a: Analysis | null, step: number, firstLabel = 'Uploading your clip'): { label: string; state: StepState }[] {
  const labels = a
    ? [
        a.traceKind === 'bar' ? 'Found the bar' : 'Found your hips',
        plural(a.reps.length, 'rep'),
        'Finding your phases',
        'Comparing to your best',
        'Choosing one cue',
      ]
    : [firstLabel, 'Finding the bar', 'Counting your reps', 'Finding your phases', 'Choosing one cue'];
  return labels.map((label, i) => ({
    label,
    state: i < step ? 'done' : i === step ? 'active' : 'todo',
  }));
}

export function formatWait(seconds: number): string {
  return seconds >= 60 ? `about ${Math.floor(seconds / 60)} min` : `about ${seconds} s`;
}

export function doneTitle(a: Analysis): string {
  const reps = plural(a.reps.length, 'rep');
  return a.cue ? `Done. ${reps}, one cue.` : `Done. ${reps}.`;
}

const SHORT: Partial<Record<PhaseName, string>> = {
  transition: 'hip',
  second_pull: '2nd',
  turnover: 'turn',
  recovery: 'rec',
};

export function shortPhase(p: PhaseName): string {
  return SHORT[p] ?? phaseLabel(p).toLowerCase();
}

const SYNC: Partial<Record<PhaseName, string>> = {
  first_pull: 'the knee',
  transition: 'the hip',
  second_pull: 'extension',
  turnover: 'the turnover',
  catch: 'the catch',
};

export function syncCaption(p: PhaseName, today: number, other: number): string {
  return `synced at ${SYNC[p] ?? phaseLabel(p).toLowerCase()} · frame ${today} vs ${other}`;
}

export function signedCm(cm: number): string {
  const r = Math.round(cm);
  return `${r > 0 ? '+' : ''}${r} cm`;
}
