import type { Movement } from '../../analysis/types';

export type Metric = {
  id: string;
  label: string;
  short: string;
  unit: 'cm' | 's' | 'deg' | 'm/s';
  lowerIsBetter: boolean;
  caption: string;
  still?: string;
};

export const METRICS: Record<string, Metric> = {
  bar_drift_hip: {
    id: 'bar_drift_hip',
    label: 'Bar drift at hip',
    short: 'drift',
    unit: 'cm',
    lowerIsBetter: true,
    caption: 'Bar drift at hip, cm forward.',
    still: 'the bar still drifts {v} at the hip',
  },
  pull_time: { id: 'pull_time', label: 'Pull timing', short: 'pull', unit: 's', lowerIsBetter: true, caption: 'Pull time, seconds.' },
  catch_depth: { id: 'catch_depth', label: 'Catch depth', short: 'depth', unit: 'cm', lowerIsBetter: false, caption: 'Catch depth below parallel, cm.' },
  turnover_time: { id: 'turnover_time', label: 'Turnover time', short: 'turnover', unit: 's', lowerIsBetter: true, caption: 'Turnover time, seconds.' },
  bar_height: { id: 'bar_height', label: 'Bar height', short: 'height', unit: 'cm', lowerIsBetter: false, caption: 'Peak bar height, cm.' },
  elbow_turn: { id: 'elbow_turn', label: 'Elbow turnover', short: 'elbows', unit: 's', lowerIsBetter: true, caption: 'Elbow turnover time, seconds.' },
  kip_height: { id: 'kip_height', label: 'Kip height', short: 'kip', unit: 'cm', lowerIsBetter: false, caption: 'Kip height, cm.' },
  hip_to_bar: {
    id: 'hip_to_bar',
    label: 'Hip to bar',
    short: 'hip to bar',
    unit: 'cm',
    lowerIsBetter: true,
    caption: 'Hip to bar at transition, cm.',
    still: 'the hips are still {v} off the bar',
  },
  body_line: { id: 'body_line', label: 'Body-line angle', short: 'body line', unit: 'deg', lowerIsBetter: false, caption: 'Body-line angle at the drive, degrees.' },
  cycle_time: { id: 'cycle_time', label: 'Cycle time', short: 'cycle', unit: 's', lowerIsBetter: true, caption: 'Time per rep, seconds.' },
  dip_depth: { id: 'dip_depth', label: 'Dip depth', short: 'dip', unit: 'cm', lowerIsBetter: false, caption: 'Dip depth, cm.' },
  bar_path_jerk: { id: 'bar_path_jerk', label: 'Bar drift overhead', short: 'drift', unit: 'cm', lowerIsBetter: true, caption: 'Bar drift overhead, cm.' },
  // The CV's own measurement ids (cv/catchline_cv/rules.py FAULTS + lifts.py LABELS). A cue's
  // metricId is its fault_id, so every fault the worker can cue needs an entry here.
  hips_rise_early: { id: 'hips_rise_early', label: 'Hips rose early', short: 'hips', unit: 'cm', lowerIsBetter: true, caption: 'Hips vs shoulders, floor to knee, cm.', still: 'the hips still rise {v} early' },
  bar_forward_off_hips: { id: 'bar_forward_off_hips', label: 'Bar forward off hips', short: 'bar fwd', unit: 'cm', lowerIsBetter: true, caption: 'Bar forward after hip contact, cm.', still: 'the bar still goes {v} forward off the hips' },
  jump_forward: { id: 'jump_forward', label: 'Jumped forward', short: 'jump', unit: 'cm', lowerIsBetter: true, caption: 'Feet forward, lift-off to catch, cm.', still: 'the feet still land {v} forward' },
  early_arm_bend: { id: 'early_arm_bend', label: 'Early arm bend', short: 'arm bend', unit: 's', lowerIsBetter: true, caption: 'Elbows bent before the hips finished, seconds.' },
  incomplete_extension: { id: 'incomplete_extension', label: 'Extension short', short: 'extension', unit: 'deg', lowerIsBetter: true, caption: 'Hip angle short of 170° at the top of the pull.' },
  forward_dip: { id: 'forward_dip', label: 'Bar forward in dip', short: 'dip fwd', unit: 'cm', lowerIsBetter: true, caption: 'Bar forward, dip start to dip bottom, cm.' },
  press_out: { id: 'press_out', label: 'Press-out', short: 'press-out', unit: 'deg', lowerIsBetter: true, caption: 'Elbow short of locked at the bar peak, degrees.' },
  chest_dive: { id: 'chest_dive', label: 'Chest forward in catch', short: 'chest', unit: 'deg', lowerIsBetter: true, caption: 'Trunk lean from vertical when landing, degrees.' },
  bar_forward_overhead: { id: 'bar_forward_overhead', label: 'Bar forward overhead', short: 'overhead', unit: 'cm', lowerIsBetter: true, caption: 'Bar vs shoulders at lockout, cm.' },
  leg_kip: { id: 'leg_kip', label: 'Knee bend in the swing', short: 'knees', unit: 'deg', lowerIsBetter: true, caption: 'Knee range, arch to top, degrees.' },
  early_arm_pull: { id: 'early_arm_pull', label: 'Arms before hips', short: 'arms', unit: 's', lowerIsBetter: true, caption: 'Elbow bend before the hip snap, seconds.' },
  no_push_away: { id: 'no_push_away', label: 'Push-away at the top', short: 'push-away', unit: 'cm', lowerIsBetter: false, caption: 'Shoulders back off the bar in 0.4 s, cm.' },
  bmu_early_pull: { id: 'bmu_early_pull', label: 'Hips under bar at the pull', short: 'hips', unit: 'cm', lowerIsBetter: true, caption: 'Hips below the bar when the elbows start to bend, cm.' },
  hips_low_transition: { id: 'hips_low_transition', label: 'Hips under bar at transition', short: 'hips', unit: 'cm', lowerIsBetter: true, caption: 'Hips below the bar before the elbows go over, cm.', still: 'the hips are still {v} under the bar' },
  chicken_wing: { id: 'chicken_wing', label: 'Elbow timing gap', short: 'elbows', unit: 's', lowerIsBetter: true, caption: 'Time between the two elbows crossing the bar, seconds.' },
  hspu_banana: { id: 'hspu_banana', label: 'Hips off the body line', short: 'hips', unit: 'cm', lowerIsBetter: true, caption: 'Hip vs shoulder-ankle line at lockout, cm.' },
  hspu_kip_timing: { id: 'hspu_kip_timing', label: 'Tuck before the kick', short: 'tuck', unit: 'cm', lowerIsBetter: true, caption: 'Knees above the hips at the deepest tuck, cm.' },
  bar_speed: { id: 'bar_speed', label: 'Peak bar speed', short: 'speed', unit: 'm/s', lowerIsBetter: false, caption: 'Peak bar speed in the second pull, m/s.' },
  bar_peak_height: { id: 'bar_peak_height', label: 'Bar peak height', short: 'peak', unit: 'cm', lowerIsBetter: false, caption: 'Bar peak height above lift-off, cm.' },
};

// Any id the CV sends that has no entry still renders (label from the id, cm, lower is better).
export function metricFor(id: string): Metric {
  const known = METRICS[id];
  if (known) return known;
  const label = id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return { id, label, short: label.toLowerCase(), unit: 'cm', lowerIsBetter: true, caption: `${label}, cm.` };
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

export const SHORT_MOVEMENT: Record<Movement, string> = {
  snatch: 'Snatch',
  clean: 'Clean',
  jerk: 'Jerk',
  kipping_pull_up: 'Pull-up',
  bar_muscle_up: 'Bar MU',
  kipping_hspu: 'HSPU',
};

export const PLURAL_MOVEMENT: Record<Movement, string> = {
  snatch: 'snatches',
  clean: 'cleans',
  jerk: 'jerks',
  kipping_pull_up: 'kipping pull-ups',
  bar_muscle_up: 'bar muscle-ups',
  kipping_hspu: 'kipping HSPUs',
};

export const SINGULAR_MOVEMENT: Record<Movement, string> = {
  snatch: 'snatch',
  clean: 'clean',
  jerk: 'jerk',
  kipping_pull_up: 'kipping pull-up',
  bar_muscle_up: 'bar muscle-up',
  kipping_hspu: 'kipping HSPU',
};
