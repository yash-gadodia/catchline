import { create } from 'zustand';
import { supabaseConfigured } from '../../lib/supabase';
import type { CueRecord, LibraryState } from './types';
import { emptyLibrary, seededLibrary } from './seed';

type Actions = {
  load: (state: LibraryState) => void;
  setCue: (id: string, patch: Partial<CueRecord>) => void;
  addCue: (cue: CueRecord) => void;
};

// The hosted path starts empty and unsynced (never the design fixtures); syncLibrary() fills it.
export const useLibraryStore = create<LibraryState & Actions>((set) => ({
  ...(supabaseConfigured ? emptyLibrary(false) : seededLibrary()),
  load: (state) => set(state),
  setCue: (id, patch) => set((s) => ({ cues: s.cues.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  addCue: (cue) => set((s) => ({ cues: [cue, ...s.cues] })),
}));
