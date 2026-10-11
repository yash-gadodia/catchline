import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Movement } from '../../analysis/types';

export type Units = 'kg' | 'lb';

// Bump when the privacy copy changes so everyone re-consents.
export const CONSENT_VERSION = 1;

export type Consent = {
  version: number;
  acceptedAt: string;
  improveAccuracy: boolean;
};

export type OnboardingState = {
  lifts: Movement[];
  focus: string[];
  units: Units;
  consent: Consent | null;
  guideHidden: boolean;
  completed: boolean;
  setLifts: (lifts: Movement[], focus: string[], units: Units) => void;
  setUnits: (units: Units) => void;
  acceptConsent: (improveAccuracy: boolean, now?: Date) => void;
  setImproveAccuracy: (on: boolean) => void;
  hideGuide: () => void;
  complete: () => void;
  reset: () => void;
};

const initial = {
  lifts: [] as Movement[],
  focus: [] as string[],
  units: 'kg' as Units,
  consent: null as Consent | null,
  guideHidden: false,
  completed: false,
};

// Local-only for now. Phase 3 mirrors consent to the account when one exists;
// keep callers on these actions so the swap stays inside this file.
export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initial,
      setLifts: (lifts, focus, units) => set({ lifts, focus, units }),
      setUnits: (units) => set({ units }),
      acceptConsent: (improveAccuracy, now = new Date()) =>
        set({ consent: { version: CONSENT_VERSION, acceptedAt: now.toISOString(), improveAccuracy } }),
      setImproveAccuracy: (on) =>
        set((s) => (s.consent ? { consent: { ...s.consent, improveAccuracy: on } } : {})),
      hideGuide: () => set({ guideHidden: true }),
      complete: () => set({ completed: true }),
      reset: () => set(initial),
    }),
    { name: 'catchline.onboarding', storage: createJSONStorage(() => AsyncStorage) }
  )
);

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useOnboarding.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    return useOnboarding.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}

export function hasConsent(consent: Consent | null): boolean {
  return consent?.version === CONSENT_VERSION;
}
