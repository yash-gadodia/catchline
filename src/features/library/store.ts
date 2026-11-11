import { create } from 'zustand';
import { supabaseConfigured } from '../../lib/supabase';
import type { LibraryState } from './types';
import { emptyLibrary, seededLibrary } from './seed';

type Actions = { load: (state: LibraryState) => void };

// The hosted path starts empty and unsynced (never the design fixtures); syncLibrary() fills it.
export const useLibraryStore = create<LibraryState & Actions>((set) => ({
  ...(supabaseConfigured ? emptyLibrary(false) : seededLibrary()),
  load: (state) => set(state),
}));
