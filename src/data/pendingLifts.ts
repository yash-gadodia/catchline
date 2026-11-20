import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClipSubmission } from '../features/capture/submit';

// Every lift the lifter pressed Track on that has not ended yet, oldest first: the one tracking, the ones waiting
// behind it (one lift tracks at a time, #252) and the ones held by the weekly cap until a purchase or Monday (#247).
// Kept on disk so a lift the app was killed in the middle of is tracked again on the next launch (#250), from the
// prepared clip when it is still there, with the lifter's mark either way.
export type PendingLift = {
  liftId: string;
  sub: ClipSubmission & { uri: string };
  at: string;
  held?: boolean;
  prepared?: { uri: string; fps: number };
};

type PendingState = {
  items: PendingLift[];
  add: (item: PendingLift) => void;
  update: (liftId: string, patch: Partial<PendingLift>) => void;
  remove: (liftId: string) => void;
};

export const usePendingLifts = create<PendingState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items.filter((i) => i.liftId !== item.liftId), item] })),
      update: (liftId, patch) => set((s) => ({ items: s.items.map((i) => (i.liftId === liftId ? { ...i, ...patch } : i)) })),
      remove: (liftId) => set((s) => ({ items: s.items.filter((i) => i.liftId !== liftId) })),
    }),
    { name: 'catchline-pending-lifts', storage: createJSONStorage(() => AsyncStorage) }
  )
);

type Persisted = { persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } };

// Resolves once a persisted store is back from disk.
export function whenHydrated(store: Persisted): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = store.persist.onFinishHydration(() => {
      stop();
      resolve();
    });
  });
}
