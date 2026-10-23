import Constants from 'expo-constants';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHANGELOG } from './changelog';

type WhatsNew = { seen: string | null };

export const useWhatsNew = create<WhatsNew>()(
  persist((): WhatsNew => ({ seen: null }), { name: 'catchline-whats-new', storage: createJSONStorage(() => AsyncStorage) })
);

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '';
}

// Once per version that has an entry, and only for someone updating: a fresh install
// (onboarding not done) has nothing to compare against, so it is marked seen silently.
export function takeWhatsNew(onboarded: boolean, version: string = appVersion()): boolean {
  if (!CHANGELOG.some((e) => e.version === version)) return false;
  if (useWhatsNew.getState().seen === version) return false;
  useWhatsNew.setState({ seen: version });
  return onboarded;
}

export function whenWhatsNewHydrated(run: () => void): () => void {
  if (useWhatsNew.persist.hasHydrated()) {
    run();
    return () => undefined;
  }
  return useWhatsNew.persist.onFinishHydration(run);
}
