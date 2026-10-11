import { create } from 'zustand';
import type { CueRecord, LibraryState } from './types';
import { seededLibrary } from './seed';

type Actions = {
  load: (state: LibraryState) => void;
  setCue: (id: string, patch: Partial<CueRecord>) => void;
  addCue: (cue: CueRecord) => void;
};

export const useLibraryStore = create<LibraryState & Actions>((set) => ({
  ...seededLibrary(),
  load: (state) => set(state),
  setCue: (id, patch) => set((s) => ({ cues: s.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  addCue: (cue) => set((s) => ({ cues: [cue, ...s.cues] })),
}));
