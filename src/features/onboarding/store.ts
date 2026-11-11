import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Units = 'kg' | 'lb';

// Bump when the privacy copy changes so everyone re-consents.
export const CONSENT_VERSION = 1;

export type Consent = {
  version: number;
  acceptedAt: string;
};

export type OnboardingState = {
  units: Units;
  consent: Consent | null;
  completed: boolean;
  setUnits: (units: Units) => void;
  acceptConsent: (now?: Date) => void;
  complete: () => void;
  reset: () => void;
};

const initial = {
  units: 'kg' as Units,
  consent: null as Consent | null,
  completed: false,
};

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initial,
      setUnits: (units) => set({ units }),
      acceptConsent: (now = new Date()) => set({ consent: { version: CONSENT_VERSION, acceptedAt: now.toISOString() } }),
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
