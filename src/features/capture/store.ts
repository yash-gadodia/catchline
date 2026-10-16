import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Movement } from '../../analysis/types';
import type { CheckId } from './checks';
import { fullTrim, type Trim } from './trim';

export type ClipSource = 'camera' | 'library' | 'share';

export type ClipSet = { start: number; end: number; reps: number | null };

export type Clip = {
  // null = the bundled sample lift (dev and design QA without a camera).
  uri: string | null;
  durationS: number;
  fps: number | null;
  source: ClipSource;
  from?: string;
  movement: Movement;
  movementGuessed?: boolean;
  trim: Trim;
  overridden: CheckId[];
  cutOffFrame: number | null;
  repsFound: number | null;
  sets: ClipSet[];
  setIndex: number;
  rep: number | 'all';
  // Filmed to test this cue (its movement is the clip's movement when it was started).
  retest?: { cueId: string; movement: Movement };
};

export function newClip(fields: Pick<Clip, 'uri' | 'durationS' | 'fps' | 'source' | 'movement'> & Partial<Clip>): Clip {
  return {
    overridden: [],
    cutOffFrame: null,
    repsFound: null,
    sets: [],
    setIndex: 0,
    rep: 'all',
    trim: fullTrim(fields.durationS),
    ...fields,
  };
}

// With sets (a long import), the picked set is the trim.
export function activeTrim(clip: Clip): Trim {
  const set = clip.sets[clip.setIndex];
  return set ? { start: set.start, end: set.end } : clip.trim;
}

export function withTrim(clip: Clip, trim: Trim): Clip {
  if (!clip.sets[clip.setIndex]) return { ...clip, trim };
  return { ...clip, sets: clip.sets.map((s, i) => (i === clip.setIndex ? { ...s, ...trim } : s)) };
}

type CaptureState = {
  draft: Clip | null;
  movement: Movement;
  lastWeight: string;
  originals: string[];
  setDraft: (clip: Clip | null) => void;
  updateDraft: (patch: Partial<Clip>) => void;
  setMovement: (m: Movement) => void;
  setLastWeight: (w: string) => void;
  addOriginal: (uri: string) => void;
  setOriginals: (uris: string[]) => void;
};

export const useCapture = create<CaptureState>()(
  persist(
    (set) => ({
      draft: null,
      movement: 'snatch',
      lastWeight: '',
      originals: [],
      setDraft: (draft) => set({ draft }),
      updateDraft: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : {})),
      setMovement: (movement) => set({ movement }),
      setLastWeight: (lastWeight) => set({ lastWeight }),
      addOriginal: (uri) => set((s) => ({ originals: [...s.originals, uri] })),
      setOriginals: (originals) => set({ originals }),
    }),
    {
      name: 'catchline.capture',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ movement: s.movement, lastWeight: s.lastWeight, originals: s.originals }),
    }
  )
);

// True once the last movement and weight are back from disk. Reading `movement` before this gives the default
// (snatch), which is how a clean got uploaded as a snatch.
export function useCaptureHydrated(): boolean {
  const [hydrated, setHydrated] = useState(useCapture.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    return useCapture.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);
  return hydrated;
}
