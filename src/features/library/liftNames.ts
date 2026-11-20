import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, type Key } from '../../i18n';
import { liftShape, type TrackedLift } from '../analysis/compare';
import { forgetLiftDetails } from './liftDetails';
import { EVENTS, track } from '../../lib/analytics';

// What kind of lift each tracked lift is. `shapes` is read from the bar's path against the body (compare.ts liftShape)
// when the lift is tracked, or the first time an older one is opened. `chosen` is what the lifter picked on the lift's
// details, and wins: a kind from KINDS, or their own words ("Ring dip"). Kept on the phone only, beside the lift.
type Names = { shapes: Record<string, string>; chosen: Record<string, string> };
export const useLiftNames = create<Names>()(
  persist((): Names => ({ shapes: {}, chosen: {} }), { name: 'catchline-lift-names', storage: createJSONStorage(() => AsyncStorage) })
);

// The kinds a lifter can pick, in the order they are offered.
export const KINDS = ['snatch', 'clean', 'cleanJerk', 'jerk', 'squat', 'deadlift', 'pull', 'overhead', 'pullUp', 'butterflyPullUp', 'muscleUp', 'handstandPushUp'] as const;
export const KIND_MAX = 24;
const isKind = (k: string) => (KINDS as readonly string[]).includes(k);
export const kindLabel = (kind: string): string => (isKind(kind) ? t(`library.kind.${kind}` as Key) : kind);

// Only the shapes that name one kind of lift; a bar taken from a rack to the shoulders or the hips could be several.
const SHAPE_KIND: Record<string, string> = {
  'floor-overhead': 'snatch',
  'floor-overhead-jerk': 'cleanJerk',
  'floor-shoulders': 'clean',
  'floor-hips': 'pull',
  'rack-overhead': 'overhead',
};

// The lift's kind as stored: the lifter's pick, else what the app read, else null.
export function kindIdOf(names: Names, liftId: string): string | null {
  return names.chosen[liftId] ?? SHAPE_KIND[names.shapes[liftId] ?? ''] ?? null;
}

// The lifter picks a kind, or types their own (words that match a listed kind become that kind). Empty clears the
// pick, and the lift goes back to what the app read.
export function setLiftKind(liftId: string, raw: string | null): void {
  const typed = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, KIND_MAX).trim();
  const kind = KINDS.find((k) => k === typed || kindLabel(k).toLowerCase() === typed.toLowerCase()) ?? typed;
  useLiftNames.setState((s) => {
    const { [liftId]: _was, ...chosen } = s.chosen;
    return { chosen: kind ? { ...chosen, [liftId]: kind } : chosen };
  });
}

// A pick on the details or the result card, tracked by kind (never the lifter's own words).
export function pickLiftKind(liftId: string, raw: string | null): void {
  setLiftKind(liftId, raw);
  track(EVENTS.LIFT_KIND_SET, { kind: !raw ? 'cleared' : isKind(raw) ? raw : 'own' });
}

const GYMNASTICS: readonly string[] = ['pullUp', 'butterflyPullUp', 'muscleUp', 'handstandPushUp'];

// The kinds the result card offers, most likely first: the lift's kind as stored, the gymnastics kinds for a hip
// trail or the barbell lifts for a bar, then the lifter's own. The rest are on the details.
export function kindChoices(trace: 'path' | 'trail' | 'none', current: string | null, own: string[]): string[] {
  const likely = KINDS.filter((k) => GYMNASTICS.includes(k) === (trace === 'trail'));
  return [...new Set([...(current ? [current] : []), ...likely, ...own])];
}

// The lifter's own kinds (not in KINDS), most used first: offered again on the next lift.
export function ownKinds(chosen: Record<string, string>): string[] {
  const count = new Map<string, number>();
  for (const k of Object.values(chosen)) if (!isKind(k)) count.set(k, (count.get(k) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

export function rememberLiftShape(liftId: string, lift: TrackedLift): void {
  if (useLiftNames.getState().shapes[liftId] !== undefined) return;
  const shape = liftShape(lift);
  if (shape) useLiftNames.setState((s) => ({ shapes: { ...s.shapes, [liftId]: shape } }));
}

// Called when a lift is deleted: its kind goes, and so does what the lifter wrote about it.
export function forgetLiftName(liftId: string): void {
  useLiftNames.setState((s) => {
    const { [liftId]: _gone, ...shapes } = s.shapes;
    const { [liftId]: _pick, ...chosen } = s.chosen;
    return { shapes, chosen };
  });
  forgetLiftDetails(liftId);
}

export function liftKind(shapes: Record<string, string>, liftId: string, chosen: Record<string, string> = {}): string | null {
  const kind = kindIdOf({ shapes, chosen }, liftId);
  return kind ? kindLabel(kind) : null;
}

// The kinds among these lifts, most lifts first: the Lifts list filters and groups by them.
export function kindsOf(shapes: Record<string, string>, liftIds: string[], chosen: Record<string, string> = {}): string[] {
  const count = new Map<string, number>();
  for (const id of liftIds) {
    const kind = liftKind(shapes, id, chosen);
    if (kind) count.set(kind, (count.get(kind) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
}

// How the Lifts list is laid out: a history by day, or one group per kind of lift.
export const useLiftsView = create<{ by: 'day' | 'kind' }>()(
  persist((): { by: 'day' | 'kind' } => ({ by: 'day' }), { name: 'catchline-lifts-view', storage: createJSONStorage(() => AsyncStorage) })
);
