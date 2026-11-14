import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, type Key } from '../../i18n';
import { liftShape, type TrackedLift } from '../analysis/compare';
import { forgetLiftDetails } from './liftDetails';

// What kind of lift each tracked lift is, read from the bar's path against the body (compare.ts liftShape) when the
// lift is tracked, or the first time an older one is opened. Kept on the phone only, beside the lift it names.
export const useLiftNames = create<{ shapes: Record<string, string> }>()(
  persist(() => ({ shapes: {} as Record<string, string> }), { name: 'catchline-lift-names', storage: createJSONStorage(() => AsyncStorage) })
);

// Only the shapes that name one kind of lift; a bar taken from a rack to the shoulders or the hips could be several.
const NAMES: Record<string, Key> = {
  'floor-overhead': 'library.kind.snatch',
  'floor-overhead-jerk': 'library.kind.cleanJerk',
  'floor-shoulders': 'library.kind.clean',
  'floor-hips': 'library.kind.pull',
  'rack-overhead': 'library.kind.overhead',
};

export function rememberLiftShape(liftId: string, lift: TrackedLift): void {
  if (useLiftNames.getState().shapes[liftId] !== undefined) return;
  const shape = liftShape(lift);
  if (shape) useLiftNames.setState((s) => ({ shapes: { ...s.shapes, [liftId]: shape } }));
}

// Called when a lift is deleted: its kind goes, and so does what the lifter wrote about it.
export function forgetLiftName(liftId: string): void {
  useLiftNames.setState((s) => {
    const { [liftId]: _gone, ...shapes } = s.shapes;
    return { shapes };
  });
  forgetLiftDetails(liftId);
}

export function liftKind(shapes: Record<string, string>, liftId: string): string | null {
  const key = NAMES[shapes[liftId] ?? ''];
  return key ? t(key) : null;
}

// The kinds among these lifts, most lifts first: the Lifts list filters by them once there is more than one.
export function kindsOf(shapes: Record<string, string>, liftIds: string[]): string[] {
  const count = new Map<string, number>();
  for (const id of liftIds) {
    const kind = liftKind(shapes, id);
    if (kind) count.set(kind, (count.get(kind) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
}
