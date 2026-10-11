import type { Movement } from '../../analysis/types';
import type { CueRecord, LibraryState, Lift, Session } from './types';
import { useLibraryStore } from './store';
import { emptyLibrary, seededLibrary } from './seed';

// The only door screens use into lifts, sessions and cues. Phase 3 swaps the
// bodies for Supabase queries (react-query) without touching the screens.

export function useLibrary(): LibraryState {
  const today = useLibraryStore((s) => s.today);
  const plan = useLibraryStore((s) => s.plan);
  const freeVideosUsed = useLibraryStore((s) => s.freeVideosUsed);
  const lifts = useLibraryStore((s) => s.lifts);
  const sessions = useLibraryStore((s) => s.sessions);
  const cues = useLibraryStore((s) => s.cues);
  return { today, plan, freeVideosUsed, lifts, sessions, cues };
}

export function useLift(id: string | undefined): Lift | undefined {
  return useLibraryStore((s) => s.lifts.find((l) => l.id === id));
}

export function useCue(id: string | undefined): CueRecord | undefined {
  return useLibraryStore((s) => s.cues.find((c) => c.id === id));
}

export function useSessions(movement: Movement): Session[] {
  const sessions = useLibraryStore((s) => s.sessions);
  return sessions.filter((s) => s.movement === movement);
}

export function markStuck(id: string): void {
  const { today, setCue } = useLibraryStore.getState();
  setCue(id, { status: 'stuck', endedAt: today });
}

export function dropCue(id: string): void {
  const { today, setCue } = useLibraryStore.getState();
  setCue(id, { status: 'dropped', endedAt: today });
}

export function keepTrying(id: string): void {
  const { cues, setCue } = useLibraryStore.getState();
  const cue = cues.find((c) => c.id === id);
  if (!cue) return;
  setCue(id, { status: 'trying', endedAt: undefined, sessionsTarget: cue.sessionsTarget + 3 });
}

export function tryNewCue(id: string): string | null {
  const { cues, today, addCue } = useLibraryStore.getState();
  const cue = cues.find((c) => c.id === id);
  if (!cue?.suggestion) return null;
  const next: CueRecord = {
    id: `${cue.id}-next`,
    movement: cue.movement,
    text: cue.suggestion.text,
    metricId: cue.metricId,
    givenAt: today,
    status: 'trying',
    sessionsTarget: 6,
    before: cue.after,
    after: cue.after,
  };
  addCue(next);
  return next.id;
}

export function loadLibrary(which: 'seeded' | 'empty'): void {
  useLibraryStore.getState().load(which === 'seeded' ? seededLibrary() : emptyLibrary());
}
