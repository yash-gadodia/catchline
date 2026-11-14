import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, type Key } from '../../i18n';
import { liftShape, type TrackedLift } from '../analysis/compare';

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

export function forgetLiftName(liftId: string): void {
  useLiftNames.setState((s) => {
    const { [liftId]: _gone, ...shapes } = s.shapes;
    return { shapes };
  });
}

export function liftKind(shapes: Record<string, string>, liftId: string): string | null {
  const key = NAMES[shapes[liftId] ?? ''];
  return key ? t(key) : null;
}
