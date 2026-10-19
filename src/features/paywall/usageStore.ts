import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_USAGE, monthKey, recordAnalysis, type Tier, type Usage, type Variant } from './entitlements';
import type { Allowance } from '../../lib/api';

export type QueuedClip = { id: string; movement: string };

// Local usage + queue. Phase 3 moves the counter server-side (the analysis job is the
// source of truth); this store is the seam the screens read through.
type UsageState = {
  usage: Usage;
  variant: Variant;
  queue: QueuedClip[];
  warnedAt: number | null;
  warnLastFree: () => void;
  record: (tier: Tier, now: Date) => void;
  adopt: (allowance: Allowance, now: Date) => void;
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
      // The server's count is the truth: the local one drifted (a lift reopened from
      // the library counted twice) and paywalled a lifter with a free video left.
      adopt: (allowance, now) => {
        const used = Math.max(0, allowance.used - allowance.bonus);
        const usage = get().usage;
        set({
          usage:
            allowance.period === 'lifetime'
              ? { ...usage, lifetime: used }
              : { lifetime: Math.max(usage.lifetime, used), month: monthKey(now), thisMonth: used },
        });
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
