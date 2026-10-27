import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Analysis } from '../../analysis/types';
import { repByIndex } from '../../analysis/timeline';
import type { Lift } from './types';

// The lifter's own made/missed call per lift, keyed by analysis id. Kept on this phone only: sync_lift sends the
// detected outcome once and the server has no way to change it.
type MadeLog = { made: Record<string, boolean> };

export const useMadeLog = create<MadeLog>()(
  persist((): MadeLog => ({ made: {} }), { name: 'catchline-made-log', storage: createJSONStorage(() => AsyncStorage) })
);

// A path-only result has no catch to judge, so no made/missed call.
export function detectedMade(a: Analysis): boolean | null {
  return a.failure || a.reps.length === 0 || a.noCueReason?.code === 'path_only' ? null : repByIndex(a, a.bestRepIndex).made;
}

export function setMade(analysisId: string, made: boolean): void {
  useMadeLog.setState((s) => ({ made: { ...s.made, [analysisId]: made } }));
}

export function useMade(a: Analysis): boolean | null {
  const own = useMadeLog((s) => s.made[a.id]);
  return own ?? detectedMade(a);
}

export function madeCounts(lifts: Lift[], own: Record<string, boolean>): { made: number; missed: number } {
  let made = 0;
  let missed = 0;
  for (const l of lifts) {
    const m = (l.analysisId ? own[l.analysisId] : undefined) ?? l.made;
    if (m === true) made++;
    if (m === false) missed++;
  }
  return { made, missed };
}
