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

export function signed(n: number): string {
  const v = Number(n.toFixed(2));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;
}

export type StepState = 'done' | 'active' | 'todo';

// With no analysis yet (a live lift) the first step is the upload and the rep
// count is still unknown.
// The tracking run as the lifter sees it: every clip goes through the same five steps.
export function processingSteps(step: number, firstLabel = t('analysis.processing.preparingClip')): { label: string; state: StepState }[] {
  const labels = [
    firstLabel,
    t('analysis.processing.step.person'),
    t('analysis.processing.step.bar'),
    t('analysis.processing.step.body'),
    t('analysis.processing.step.lines'),
  ];
  return labels.map((label, i) => ({
    label,
    state: i < step ? 'done' : i === step ? 'active' : 'todo',
  }));
}

export function formatWait(seconds: number): string {
  return seconds >= 60 ? t('format.wait.minutes', { n: Math.floor(seconds / 60) }) : t('format.wait.seconds', { n: seconds });
}
