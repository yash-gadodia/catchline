import type { Movement } from '../../analysis/types';

export type Metric = {
  id: string;
  label: string;
  short: string;
  unit: 'cm' | 's' | 'deg';
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
};

export const MOVEMENT_METRICS: Record<Movement, string[]> = {
  snatch: ['bar_drift_hip', 'pull_time', 'catch_depth', 'turnover_time'],
  clean: ['bar_drift_hip', 'pull_time', 'catch_depth', 'elbow_turn'],
  jerk: ['dip_depth', 'bar_path_jerk'],
  kipping_pull_up: ['kip_height', 'body_line', 'cycle_time'],
  bar_muscle_up: ['kip_height', 'hip_to_bar', 'body_line', 'cycle_time'],
  kipping_hspu: ['kip_height', 'body_line', 'cycle_time'],
};

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
