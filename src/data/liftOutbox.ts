import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { syncLift, type SyncLiftInput } from '../lib/api';
import type { CueRow } from '../types/db';
import { backendEnabled } from './backend';

// Every lift analysed on this phone, with the slim record the server gets: the
// unsynced ones wait here until the phone is online with a session, and the
// library lists them all offline. sync_lift is idempotent per id, so a send that
// timed out after the server wrote it is safe to repeat.
export type OutboxItem = { id: string; lift: SyncLiftInput; synced?: boolean };

type OutboxState = {
  items: OutboxItem[];
  add: (item: OutboxItem) => void;
  markSynced: (id: string) => void;
  forget: (id: string) => void;
  // The last cue memory the server sent, so the cue tab and retests work offline.
  cues: CueRow[];
  setCues: (cues: CueRow[]) => void;
};

export const useLiftOutbox = create<OutboxState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) => {
        if (get().items.some((i) => i.id === item.id)) return;
        set({ items: [...get().items, item] });
      },
      markSynced: (id) => set({ items: get().items.map((i) => (i.id === id ? { ...i, synced: true } : i)) }),
      forget: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
      cues: [],
      setCues: (cues) => set({ cues }),
    }),
    { name: 'catchline-lift-outbox', storage: createJSONStorage(() => AsyncStorage) }
  )
);

// A server answer that will never change on retry: drop the item rather than resend it forever.
const PERMANENT = ['lift_conflict', 'bad_cue', 'bad_lift', 'unsupported_movement'];

let flushing: Promise<number> | null = null;

// Sends what is waiting, oldest first; stops at the first network failure.
// Only with a session: the app analyses without an account, and the first
// backend call of a signed-out phone makes none. Returns how many were sent.
export function flushLiftOutbox(): Promise<number> {
  if (!backendEnabled()) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return 0;
      for (const item of useLiftOutbox.getState().items.filter((i) => !i.synced)) {
        try {
          await syncLift(item.id, item.lift);
        } catch (e) {
          const message = e instanceof Error ? e.message : '';
          if (!PERMANENT.includes(message)) break;
        }
        useLiftOutbox.getState().markSynced(item.id);
        sent++;
      }
    } catch {
      // offline: the items stay for the next flush
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}

export function queueLiftSync(item: OutboxItem): Promise<number> {
  useLiftOutbox.getState().add(item);
  return flushLiftOutbox();
}
