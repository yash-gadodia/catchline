import type { Movement } from '../../analysis/types';
import { movementLabel } from '../../analysis/format';
import { t, type Key } from '../../i18n';

export type LiftGroup = 'barbell' | 'gymnastics';

export type Lift = { id: Movement; name: string; sub: string; group: LiftGroup; spoken: string };

// name, sub and spoken read the current language each time they are used.
function lift(id: Movement, group: LiftGroup, sub: Key, spoken: Key): Lift {
  return {
    id,
    group,
    get name() {
      return movementLabel(id);
    },
    get sub() {
      return t(sub);
    },
    get spoken() {
      return t(spoken);
    },
  };
}

export const LIFTS: Lift[] = [
  lift('snatch', 'barbell', 'onboarding.lifts.sub.barPath', 'onboarding.lifts.spoken.snatch'),
  lift('clean', 'barbell', 'onboarding.lifts.sub.barPath', 'onboarding.lifts.spoken.clean'),
  lift('jerk', 'barbell', 'onboarding.lifts.sub.barPath', 'onboarding.lifts.spoken.jerk'),
  lift('kipping_pull_up', 'gymnastics', 'onboarding.lifts.sub.hipPath', 'onboarding.lifts.spoken.kippingPullUp'),
  lift('bar_muscle_up', 'gymnastics', 'onboarding.lifts.sub.hipPath', 'onboarding.lifts.spoken.barMuscleUp'),
  lift('kipping_hspu', 'gymnastics', 'onboarding.lifts.sub.headHip', 'onboarding.lifts.spoken.kippingHspu'),
];

// Kept in LIFTS so their analyses still open, left out of every picker: the standalone jerk and the kipping pull-up
// (3.1 analyses a jerk only after its clean), and the kipping HSPU, which ships after 3.1.
export const LATER: Movement[] = ['jerk', 'kipping_pull_up', 'kipping_hspu'];

export function pickable(id: Movement): boolean {
  return !LATER.includes(id);
}

export function soonLifts(): string[] {
  return [t('onboarding.lifts.soon.toesToBar'), t('onboarding.lifts.soon.chestToBar'), t('onboarding.lifts.soon.ringMuscleUp')];
}

export function groups(): { id: LiftGroup; label: string }[] {
  return [
    { id: 'barbell', label: t('onboarding.lifts.group.barbell') },
    { id: 'gymnastics', label: t('onboarding.lifts.group.gymnastics') },
  ];
}

// The stored values stay English; focusLabel shows them in the current language.
export const FOCUS = ['Bar swings forward', 'Missing behind', "Can't link reps", 'First muscle-up'];

const FOCUS_KEYS: Record<string, Key> = {
  'Bar swings forward': 'onboarding.lifts.focus.barSwingsForward',
  'Missing behind': 'onboarding.lifts.focus.missingBehind',
  "Can't link reps": 'onboarding.lifts.focus.cantLinkReps',
  'First muscle-up': 'onboarding.lifts.focus.firstMuscleUp',
};

export function focusLabel(f: string): string {
  const key = FOCUS_KEYS[f];
  return key ? t(key) : f;
}

export function liftById(id: Movement): Lift {
  return LIFTS.find((l) => l.id === id)!;
}

export function groupOf(id: Movement): LiftGroup {
  return liftById(id).group;
}

export function liftsIn(group: LiftGroup): Lift[] {
  return LIFTS.filter((l) => l.group === group && pickable(l.id));
}

export function isMovement(v: string | undefined): v is Movement {
  return LIFTS.some((l) => l.id === v && pickable(l.id));
}
