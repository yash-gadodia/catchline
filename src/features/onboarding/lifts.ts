import type { Movement } from '../../analysis/types';

export type LiftGroup = 'barbell' | 'gymnastics';

export type Lift = { id: Movement; name: string; sub: string; group: LiftGroup; spoken: string };

export const LIFTS: Lift[] = [
  { id: 'snatch', name: 'Snatch', sub: 'bar path', group: 'barbell', spoken: 'a snatch' },
  { id: 'clean', name: 'Clean', sub: 'bar path', group: 'barbell', spoken: 'a clean' },
  { id: 'jerk', name: 'Jerk', sub: 'bar path', group: 'barbell', spoken: 'a jerk' },
  { id: 'kipping_pull_up', name: 'Kipping pull-up', sub: 'hip path', group: 'gymnastics', spoken: 'a kipping pull-up' },
  { id: 'bar_muscle_up', name: 'Bar muscle-up', sub: 'hip path', group: 'gymnastics', spoken: 'a bar muscle-up' },
  { id: 'kipping_hspu', name: 'Kipping HSPU', sub: 'head + hip', group: 'gymnastics', spoken: 'a handstand push-up' },
];

export const SOON = ['Toes-to-bar', 'Chest-to-bar', 'Ring muscle-up'];

export const GROUPS: { id: LiftGroup; label: string }[] = [
  { id: 'barbell', label: 'Barbell' },
  { id: 'gymnastics', label: 'Gymnastics' },
];

export const FOCUS = ['Bar swings forward', 'Missing behind', "Can't link reps", 'First muscle-up'];

export function liftById(id: Movement): Lift {
  return LIFTS.find((l) => l.id === id)!;
}

export function groupOf(id: Movement): LiftGroup {
  return liftById(id).group;
}

export function liftsIn(group: LiftGroup): Lift[] {
  return LIFTS.filter((l) => l.group === group);
}

export function isMovement(v: string | undefined): v is Movement {
  return LIFTS.some((l) => l.id === v);
}
