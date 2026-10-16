import type { Movement } from '../../analysis/types';
import { isKey, t } from '../../i18n';

export type Metric = {
  id: string;
  label: string;
  short: string;
  unit: 'cm' | 's' | 'deg' | 'm/s';
  lowerIsBetter: boolean;
  caption: string;
  still?: string;
};

export type MetricSpec = Pick<Metric, 'id' | 'unit' | 'lowerIsBetter'>;

export const METRICS: Record<string, MetricSpec> = {
  bar_drift_hip: { id: 'bar_drift_hip', unit: 'cm', lowerIsBetter: true },
  pull_time: { id: 'pull_time', unit: 's', lowerIsBetter: true },
  catch_depth: { id: 'catch_depth', unit: 'cm', lowerIsBetter: false },
  turnover_time: { id: 'turnover_time', unit: 's', lowerIsBetter: true },
  bar_height: { id: 'bar_height', unit: 'cm', lowerIsBetter: false },
  elbow_turn: { id: 'elbow_turn', unit: 's', lowerIsBetter: true },
  kip_height: { id: 'kip_height', unit: 'cm', lowerIsBetter: false },
  hip_to_bar: { id: 'hip_to_bar', unit: 'cm', lowerIsBetter: true },
  body_line: { id: 'body_line', unit: 'deg', lowerIsBetter: false },
  cycle_time: { id: 'cycle_time', unit: 's', lowerIsBetter: true },
  dip_depth: { id: 'dip_depth', unit: 'cm', lowerIsBetter: false },
  bar_path_jerk: { id: 'bar_path_jerk', unit: 'cm', lowerIsBetter: true },
  // The CV's own measurement ids (cv/catchline_cv/rules.py FAULTS + lifts.py LABELS). A cue's
  // metricId is its fault_id, so every fault the worker can cue needs an entry here.
  hips_rise_early: { id: 'hips_rise_early', unit: 'cm', lowerIsBetter: true },
  bar_forward_off_hips: { id: 'bar_forward_off_hips', unit: 'cm', lowerIsBetter: true },
  jump_forward: { id: 'jump_forward', unit: 'cm', lowerIsBetter: true },
  early_arm_bend: { id: 'early_arm_bend', unit: 's', lowerIsBetter: true },
  incomplete_extension: { id: 'incomplete_extension', unit: 'deg', lowerIsBetter: true },
  forward_dip: { id: 'forward_dip', unit: 'cm', lowerIsBetter: true },
  press_out: { id: 'press_out', unit: 'deg', lowerIsBetter: true },
  chest_dive: { id: 'chest_dive', unit: 'deg', lowerIsBetter: true },
  bar_forward_overhead: { id: 'bar_forward_overhead', unit: 'cm', lowerIsBetter: true },
  leg_kip: { id: 'leg_kip', unit: 'deg', lowerIsBetter: true },
  early_arm_pull: { id: 'early_arm_pull', unit: 's', lowerIsBetter: true },
  no_push_away: { id: 'no_push_away', unit: 'cm', lowerIsBetter: false },
  bmu_early_pull: { id: 'bmu_early_pull', unit: 'cm', lowerIsBetter: true },
  hips_low_transition: { id: 'hips_low_transition', unit: 'cm', lowerIsBetter: true },
  chicken_wing: { id: 'chicken_wing', unit: 's', lowerIsBetter: true },
  hspu_banana: { id: 'hspu_banana', unit: 'cm', lowerIsBetter: true },
  hspu_kip_timing: { id: 'hspu_kip_timing', unit: 'cm', lowerIsBetter: true },
  bar_speed: { id: 'bar_speed', unit: 'm/s', lowerIsBetter: false },
  bar_peak_height: { id: 'bar_peak_height', unit: 'cm', lowerIsBetter: false },
};

function text(id: string, field: 'label' | 'short' | 'caption' | 'still'): string | undefined {
  const key = `library.metric.${id}.${field}`;
  return isKey(key) ? t(key) : undefined;
}

// Any id the CV sends that has no entry still renders (label from the id, cm, lower is better).
export function metricFor(id: string): Metric {
  const known = METRICS[id];
  if (known) {
    const still = text(id, 'still');
    return { ...known, label: text(id, 'label') ?? id, short: text(id, 'short') ?? id, caption: text(id, 'caption') ?? '', ...(still ? { still } : {}) };
  }
  const label = id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return { id, label, short: label.toLowerCase(), unit: 'cm', lowerIsBetter: true, caption: t('library.metric.unknownCaption', { label }) };
}

// Preferred chip order per movement: the CV's faults in lift order, then its extras, then the
// design-era ids the dev fixtures use. Trends shows only the ones a session actually measured.
export const MOVEMENT_METRICS: Record<Movement, string[]> = {
  snatch: ['hips_rise_early', 'bar_forward_off_hips', 'jump_forward', 'catch_depth', 'turnover_time', 'bar_peak_height', 'bar_drift_hip', 'pull_time'],
  clean: ['hips_rise_early', 'early_arm_bend', 'incomplete_extension', 'bar_forward_off_hips', 'jump_forward', 'catch_depth', 'turnover_time', 'bar_peak_height', 'bar_drift_hip', 'pull_time', 'elbow_turn'],
  jerk: ['forward_dip', 'press_out', 'chest_dive', 'bar_forward_overhead', 'dip_depth', 'bar_path_jerk'],
  kipping_pull_up: ['leg_kip', 'early_arm_pull', 'no_push_away', 'kip_height', 'body_line', 'cycle_time'],
  bar_muscle_up: ['bmu_early_pull', 'hips_low_transition', 'chicken_wing', 'kip_height', 'hip_to_bar', 'body_line', 'cycle_time'],
  kipping_hspu: ['hspu_banana', 'hspu_kip_timing', 'kip_height', 'body_line', 'cycle_time'],
};

type Measured = { movement: Movement; values: Record<string, number> };

export function measuredMetrics(sessions: Measured[], movement: Movement): string[] {
  const seen = new Set<string>();
  for (const s of sessions) if (s.movement === movement) for (const id of Object.keys(s.values)) seen.add(id);
  const preferred = MOVEMENT_METRICS[movement].filter((id) => seen.has(id));
  const rest = [...seen].filter((id) => !preferred.includes(id)).sort();
  return [...preferred, ...rest];
}

export function measuredMovements(sessions: Measured[]): Movement[] {
  const seen = new Set(sessions.map((s) => s.movement));
  return [...BARBELL, ...GYMNASTICS].filter((m) => seen.has(m));
}

// The movement with the most analysed lifts; ties go to the most recent session.
export function defaultMovement(sessions: (Measured & { date: string })[], fallback: Movement = 'snatch'): Movement {
  let best: { movement: Movement; count: number; latest: string } | null = null;
  for (const m of measuredMovements(sessions)) {
    const mine = sessions.filter((s) => s.movement === m);
    const latest = mine.reduce((d, s) => (s.date > d ? s.date : d), '');
    if (!best || mine.length > best.count || (mine.length === best.count && latest > best.latest)) best = { movement: m, count: mine.length, latest };
  }
  return best?.movement ?? fallback;
}

export const PRIMARY_METRIC: Record<Movement, string> = {
  snatch: 'bar_drift_hip',
  clean: 'bar_drift_hip',
  jerk: 'bar_path_jerk',
  kipping_pull_up: 'kip_height',
  bar_muscle_up: 'hip_to_bar',
  kipping_hspu: 'kip_height',
};

export const BARBELL: Movement[] = ['snatch', 'clean', 'jerk'];
export const GYMNASTICS: Movement[] = ['kipping_pull_up', 'bar_muscle_up', 'kipping_hspu'];

export function shortMovement(m: Movement): string {
  return t(`library.movement.short.${m}` as const);
}

export function singularMovement(m: Movement): string {
  return t(`library.movement.singular.${m}` as const);
}
