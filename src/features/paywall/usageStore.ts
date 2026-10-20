import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_USAGE, monthKey, recordAnalysis, type Tier, type Usage, type Variant } from './entitlements';
import type { Allowance } from '../../lib/api';

export type QueuedClip = { id: string; movement: string };

// Local usage + queue. 3.1: the phone is the source of truth (design section 6.1),
// backed by the Keychain count in src/data/freeLifts; the server mirrors it.
type UsageState = {
  usage: Usage;
  variant: Variant;
  queue: QueuedClip[];
  warnedAt: number | null;
  warnLastFree: () => void;
  record: (tier: Tier, now: Date) => void;
  adopt: (allowance: Allowance, now: Date) => void;
  adoptFreeUsed: (count: number) => void;
  queueClip: (clip: QueuedClip) => void;
  takeQueued: () => QueuedClip | null;
  setVariant: (variant: Variant) => void;
  reset: () => void;
};

export const useUsage = create<UsageState>()(
  persist(
    (set, get) => ({
      usage: EMPTY_USAGE,
      variant: 'organic',
      queue: [],
      warnedAt: null,
      warnLastFree: () => set({ warnedAt: get().usage.lifetime }),
      record: (tier, now) => set({ usage: recordAnalysis(get().usage, tier, now) }),
      // 3.1: the phone decides and the server only mirrors, so a count never goes
      // down: the server's is adopted when higher (a new phone after sign-in), as is
      // the Keychain's (a reinstall on the same phone).
      adopt: (allowance, now) => {
        const used = Math.max(0, allowance.used - allowance.bonus);
        const usage = get().usage;
        if (allowance.period === 'lifetime') {
          set({ usage: { ...usage, lifetime: Math.max(usage.lifetime, used) } });
          return;
        }
        const month = monthKey(now);
        const thisMonth = usage.month === month ? Math.max(usage.thisMonth, used) : used;
        set({ usage: { lifetime: Math.max(usage.lifetime, used), month, thisMonth } });
      },
      adoptFreeUsed: (count) => {
        const usage = get().usage;
        if (count > usage.lifetime) set({ usage: { ...usage, lifetime: count } });
      },
      queueClip: (clip) => {
        if (get().queue.some((c) => c.id === clip.id)) return;
        set({ queue: [...get().queue, clip] });
      },
      takeQueued: () => {
        const [first, ...rest] = get().queue;
        if (!first) return null;
        set({ queue: rest });
        return first;
      },
      setVariant: (variant) => set({ variant }),
      reset: () => set({ usage: EMPTY_USAGE, variant: 'organic', queue: [], warnedAt: null }),
    }),
    {
      name: 'catchline-usage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ usage: s.usage, variant: s.variant, queue: s.queue, warnedAt: s.warnedAt }),
    }
  )
);
