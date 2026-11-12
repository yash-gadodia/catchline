import type { PlateMark } from './plateMark';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CheckId } from './checks';
import { fullTrim, type Trim } from './trim';

export type ClipSource = 'camera' | 'library' | 'share';

export type Clip = {
  // null = the bundled sample lift (dev and design QA without a camera).
  uri: string | null;
  durationS: number;
  fps: number | null;
  source: ClipSource;
  from?: string;
  trim: Trim;
  overridden: CheckId[];
  // the lifter's mark on the plate, on the first frame of the trimmed clip; null or absent when skipped
  plateMark?: PlateMark | null;
};

export function newClip(fields: Pick<Clip, 'uri' | 'durationS' | 'fps' | 'source'> & Partial<Clip>): Clip {
  return {
    overridden: [],
    trim: fullTrim(fields.durationS),
    ...fields,
  };
}

type CaptureState = {
  draft: Clip | null;
  lastWeight: string;
  originals: string[];
  setDraft: (clip: Clip | null) => void;
  updateDraft: (patch: Partial<Clip>) => void;
  setLastWeight: (w: string) => void;
  addOriginal: (uri: string) => void;
  setOriginals: (uris: string[]) => void;
};

export const useCapture = create<CaptureState>()(
  persist(
    (set) => ({
      draft: null,
      lastWeight: '',
      originals: [],
      setDraft: (draft) => set({ draft }),
      updateDraft: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : {})),
      setLastWeight: (lastWeight) => set({ lastWeight }),
      addOriginal: (uri) => set((s) => ({ originals: [...s.originals, uri] })),
      setOriginals: (originals) => set({ originals }),
    }),
    {
      name: 'catchline.capture',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lastWeight: s.lastWeight, originals: s.originals }),
    }
  )
);

// True once the last weight and the kept originals are back from disk.
export function useCaptureHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useCapture.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    return useCapture.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}
