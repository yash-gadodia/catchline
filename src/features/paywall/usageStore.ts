import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_USAGE, isPro, recordAnalysis, type Tier, type Usage } from './entitlements';
import { writeFreeWeek, type FreeWeek } from '../../data/freeLifts';

// The phone is the source of truth for the weekly free videos, backed by the
// Keychain copy in src/data/freeLifts so a reinstall does not hand them back.
type UsageState = {
  usage: Usage;
  record: (tier: Tier, now: Date) => void;
  adoptWeek: (held: FreeWeek) => void;
  reset: () => void;
};

export const useUsage = create<UsageState>()(
  persist(
    (set, get) => ({
      usage: EMPTY_USAGE,
      record: (tier, now) => {
        const usage = recordAnalysis(get().usage, tier, now);
        set({ usage });
        if (!isPro(tier)) void writeFreeWeek({ week: usage.week, used: usage.thisWeek });
      },
      // The Keychain's count wins when it is for a later week, or higher in the same one.
      adoptWeek: ({ week, used }) => {
        const usage = get().usage;
        if (week > usage.week || (week === usage.week && used > usage.thisWeek)) set({ usage: { ...usage, week, thisWeek: used } });
      },
      reset: () => set({ usage: EMPTY_USAGE }),
    }),
    {
      name: 'catchline-usage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ usage: s.usage }),
      // Version 0 counted free videos for life and paid ones by month: keep the lifetime count, start the week fresh.
      version: 1,
      migrate: (stored) => ({ usage: { ...EMPTY_USAGE, lifetime: (stored as { usage?: { lifetime?: number } } | null)?.usage?.lifetime ?? 0 } }),
    }
  )
);
