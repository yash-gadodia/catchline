import type { LibraryState, Lift } from './types';
import { useLibraryStore } from './store';
import { emptyLibrary, seededLibrary } from './seed';

// The only door screens use into the library. The store holds the fixture library in dev mode; with a backend,
// syncLibrary() fills it.
export function useLibrary(): LibraryState {
  const today = useLibraryStore((s) => s.today);
  const synced = useLibraryStore((s) => s.synced);
  const plan = useLibraryStore((s) => s.plan);
  const freeVideosUsed = useLibraryStore((s) => s.freeVideosUsed);
  const lifts = useLibraryStore((s) => s.lifts);
  const sessions = useLibraryStore((s) => s.sessions);
  const cues = useLibraryStore((s) => s.cues);
  return { today, synced, plan, freeVideosUsed, lifts, sessions, cues };
}

// By lift id or by the id of its analysis (the two are the same for a lift analysed on this phone).
export function useLift(id: string | undefined): Lift | undefined {
  return useLibraryStore((s) => s.lifts.find((l) => l.id === id || (id != null && l.analysisId === id)));
}

export function loadLibrary(which: 'seeded' | 'empty'): void {
  useLibraryStore.getState().load(which === 'seeded' ? seededLibrary() : emptyLibrary());
}
