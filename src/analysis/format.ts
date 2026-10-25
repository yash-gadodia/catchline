import type { Analysis, Cue, Measurement, Movement, PhaseName } from './types';
import { formatNumber, t, type Key } from '../i18n';

// English measurement labels the worker sends, matched to a translation; anything new stays as sent.
const MEASUREMENT: Record<string, Key> = {
  'Hips rose early': 'format.measurement.hipsRoseEarly',
  'Bar forward off hips': 'format.measurement.barForwardOffHips',
  'Jumped forward': 'format.measurement.jumpedForward',
  'Jump forward': 'format.measurement.jumpForward',
  'Early arm bend': 'format.measurement.earlyArmBend',
  'Extension short': 'format.measurement.extensionShort',
  'Bar forward in dip': 'format.measurement.barForwardInDip',
  'Press-out': 'format.measurement.pressOut',
  'Press-out: elbows re-bent overhead': 'format.measurement.pressOutOverhead',
  'Drive to lockout': 'format.measurement.driveToLockout',
  'Chest forward in catch': 'format.measurement.chestForwardInCatch',
  'Bar forward overhead': 'format.measurement.barForwardOverhead',
  'Knee bend in the swing': 'format.measurement.kneeBendInSwing',
  'Arms before hips': 'format.measurement.armsBeforeHips',
  'Push-away at the top': 'format.measurement.pushAwayAtTop',
  'Hips under bar at the pull': 'format.measurement.hipsUnderBarAtPull',
  'Hips under bar at transition': 'format.measurement.hipsUnderBarAtTransition',
  'Elbow timing gap': 'format.measurement.elbowTimingGap',
  'Hips off the body line': 'format.measurement.hipsOffBodyLine',
  'Tuck before the kick': 'format.measurement.tuckBeforeKick',
  'Bar peak height': 'format.measurement.barPeakHeight',
  'Average pull speed': 'format.measurement.averagePullSpeed',
  'Bar peak, % of height': 'format.measurement.barPeakPct',
  'Catch depth': 'format.measurement.catchDepth',
  'Extension to rack': 'format.measurement.extensionToRack',
  'Extension to catch': 'format.measurement.extensionToCatch',
  'Dip depth': 'format.measurement.dipDepth',
  'Foot split': 'format.measurement.footSplit',
  'Lockout elbow': 'format.measurement.lockoutElbow',
  'Knee bend in the dip': 'format.measurement.kneeBendInDip',
  'Chin over bar (est.)': 'format.measurement.chinOverBar',
  Swing: 'format.measurement.swing',
  'Lockout in support': 'format.measurement.lockoutInSupport',
  'Shoulders over bar': 'format.measurement.shouldersOverBar',
  Tuck: 'format.measurement.tuck',
  'Drive to press': 'format.measurement.driveToPress',
  'Shoulders above hands at bottom': 'format.measurement.shouldersAboveHands',
  'Missed forward': 'format.measurement.missedForward',
  'Missed behind': 'format.measurement.missedBehind',
  'Peak bar speed': 'format.measurement.peakBarSpeed',
  'Bar drift at hip': 'format.measurement.barDriftAtHip',
  'Pull time': 'format.measurement.pullTime',
  'Turnover time': 'format.measurement.turnoverTime',
};

export function measurementLabel(m: { label: string }): string {
  const key = MEASUREMENT[m.label];
  return key ? t(key) : m.label;
}

export function movementLabel(m: Movement): string {
  return t(`format.movement.${m}`);
}

function spoken(m: Movement): string {
  return t(`format.spoken.${m}`);
}

// One line for when the clip did not look like the lift the lifter chose.
export function movementNote(a: Analysis): string | null {
  const d = a.detectedMovement;
  if (!d || d.movement === 'unknown' || d.movement === a.movement) return null;
  const looks = t('format.note.looksLike', { detected: spoken(d.movement), chosen: spoken(a.movement) });
  if ((a.movementUsed ?? a.movement) === d.movement) return t('format.note.analysedAs', { looks, movement: spoken(d.movement) });
  return t('format.note.keepAs', { looks, movement: t(`format.bare.${a.movement}`) });
}

// One line for a missed lift (the bar came down in front or behind), so a cue below reads as why it was missed.
export function missNote(a: Analysis): string | null {
  const label = a.measurements.find((m) => m.id === 'outcome')?.label;
  if (label === 'Missed forward') return t('format.note.missedForward');
  if (label === 'Missed behind') return t('format.note.missedBehind');
  return null;
}

export function phaseLabel(p: PhaseName): string {
  return t(`format.phase.${p}`);
}

export function fmt(n: number): string {
  const v = Number(n.toFixed(2));
  return formatNumber(v === 0 ? 0 : v);
}

// Bar speed always shows two decimals: 1.80 m/s, like a VBT readout.
export function speedText(v: number): string {
  return `${formatNumber(v, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m/s`;
}

// On since 25-10-2026: the peak is read in the second pull only (the turnover's wrist whip read 3.40 m/s), and every
// speed row needs the scale the cue trusts.
export const SHOW_BAR_SPEED = true;
export const SPEED_IDS = ['bar_speed', 'bar_speed_avg', 'bar_peak_pct'];

// The bar speed rows measured on this lift, in order; none when speed is off.
export function speedRows(a: Analysis, show: boolean = SHOW_BAR_SPEED): Measurement[] {
  if (!show) return [];
  return SPEED_IDS.map((id) => a.measurements.find((m) => m.id === id)).filter((m): m is Measurement => !!m && m.status !== 'not_seen');
}

export function valueText(m: Pick<Measurement, 'unit' | 'value'>): string {
  if (m.unit === 'm/s') return speedText(m.value);
  if (m.unit === '%') return `${fmt(Math.round(m.value))}%`;
  return `${fmt(m.value)} ${m.unit}`;
}


export function seconds(s: number): string {
  return formatNumber(s, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function liftTitle(a: Analysis, rep?: number | 'miss'): string {
  const parts = [movementLabel(a.movement)];
  if (a.loadKg != null) parts.push(`${fmt(a.loadKg)} kg`);
  if (rep === 'miss') parts.push(t('format.title.miss'));
  else if (rep != null) parts.push(t('format.title.rep', { rep }));
  return parts.join(' · ');
}

export function heroValue(cue: Cue): string {
  return `${fmt(cue.evidence.value)} ${cue.evidence.unit}`;
}

export function evidenceReadout(cue: Cue): string {
  return `${t('format.frame', { frame: cue.evidence.frame })} · ${cue.evidence.caption}`;
}

const STATUS_TEXT: Partial<Record<Measurement['status'], Key>> = {
  cue: 'format.status.cue',
  follows: 'format.status.follows',
  normal: 'format.status.normal',
  best: 'format.status.best',
};

export function measurementReadout(m: Measurement): string {
  if (m.status === 'not_seen') return t('format.status.notSeen');
  const parts = [valueText(m)];
  if (m.note) parts.push(m.note);
  const showBest = m.status === 'normal' && m.best != null;
  if (showBest) parts.push(t('format.status.bestValue', { value: fmt(m.best!) }));
  const status = STATUS_TEXT[m.status];
  if (status && !showBest) parts.push(t(status));
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
      label: measurementLabel(a),
      value: `${fmt(a.value)} ${a.unit}`,
      delta: same ? t(word === 'best' ? 'format.compare.sameAsBest' : 'format.compare.sameAsLast') : t(word === 'best' ? 'format.compare.vsBest' : 'format.compare.vsLast', { delta: signed(diff) }),
    });
  }
  return rows;
}

export type StepState = 'done' | 'active' | 'todo';

// With no analysis yet (a live lift) the first step is the upload and the rep
// count is still unknown.
export function processingSteps(a: Analysis | null, step: number, firstLabel = t('format.steps.uploading')): { label: string; state: StepState }[] {
  const labels = a
    ? [
        a.traceKind === 'bar' ? t('format.steps.foundBar') : t('format.steps.foundHips'),
        t('format.reps', { count: a.reps.length }),
        t('format.steps.findingPhases'),
        t('format.steps.comparing'),
        t('format.steps.choosingCue'),
      ]
    : [firstLabel, t('format.steps.findingBar'), t('format.steps.countingReps'), t('format.steps.findingPhases'), t('format.steps.choosingCue')];
  return labels.map((label, i) => ({
    label,
    state: i < step ? 'done' : i === step ? 'active' : 'todo',
  }));
}

export function formatWait(seconds: number): string {
  return seconds >= 60 ? t('format.wait.minutes', { n: Math.floor(seconds / 60) }) : t('format.wait.seconds', { n: seconds });
}

export function doneTitle(a: Analysis): string {
  const reps = t('format.reps', { count: a.reps.length });
  return a.cue ? t('format.done.withCue', { reps }) : t('format.done.noCue', { reps });
}

const SHORT: Partial<Record<PhaseName, Key>> = {
  transition: 'format.short.transition',
  second_pull: 'format.short.second_pull',
  turnover: 'format.short.turnover',
  recovery: 'format.short.recovery',
};

export function shortPhase(p: PhaseName): string {
  const key = SHORT[p];
  return key ? t(key) : phaseLabel(p).toLowerCase();
}

const SYNC: Partial<Record<PhaseName, Key>> = {
  first_pull: 'format.sync.first_pull',
  transition: 'format.sync.transition',
  second_pull: 'format.sync.second_pull',
  turnover: 'format.sync.turnover',
  catch: 'format.sync.catch',
};

export function syncCaption(p: PhaseName, today: number, other: number): string {
  const key = SYNC[p];
  return t('format.syncCaption', { at: key ? t(key) : phaseLabel(p).toLowerCase(), today, other });
}

export function signedCm(cm: number): string {
  const r = Math.round(cm);
  return `${r > 0 ? '+' : ''}${r} cm`;
}

export const CONFIDENCE_BAND: Record<Cue['confidence'], 'high' | 'medium' | 'low'> = {
  clear: 'high',
  worth_checking: 'medium',
  low: 'low',
};

export function filmedAtAngle(cue: Cue): boolean {
  return /off side-on/.test(cue.confidenceText);
}

// "Confidence: high", or the band plus why it is not high (read from the CV's confidenceText).
export function confidenceLine(cue: Cue): string {
  const band = CONFIDENCE_BAND[cue.confidence];
  if (band === 'high') return t('format.confidence.line', { band: t('format.confidence.high') });
  const text = cue.confidenceText;
  const seen = /Seen on (\d+) of (\d+) reps/.exec(text);
  const reasons = new Set<string>();
  if (filmedAtAngle(cue)) reasons.add(t('format.confidence.angle'));
  if (/behind a plate|hidden/.test(text)) reasons.add(t('format.confidence.hidden'));
  if (seen && seen[2] === '1') reasons.add(t('format.confidence.oneRep'));
  else if (seen && seen[1] !== seen[2]) reasons.add(t('format.confidence.seenOn', { seen: Number(seen[1]), count: Number(seen[2]) }));
  if (/One missed rep/.test(text)) reasons.add(t('format.confidence.oneRep'));
  const line = t('format.confidence.line', { band: t(`format.confidence.${band}`) });
  return reasons.size ? `${line} · ${[...reasons].join(', ')}` : line;
}
