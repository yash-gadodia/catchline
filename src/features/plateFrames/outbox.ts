import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { backendEnabled } from '../../data/backend';
import { readClip } from '../../data/readClip';
import { ApiError, recordPlateFrame, uploadPlateFrame, type PlateFrameRecord } from '../../lib/api';
import { plateFramesGranted, syncPlateFramesConsent } from './consent';

// Crops wait here until the phone is online (any network: a crop is about 50 KB). Each is a JPEG on this phone
// plus the record that goes with it; the file is deleted as soon as it is sent or dropped.
export type QueuedFrame = { id: string; file: string; record: PlateFrameRecord };

// About ten lifts' worth. Past that the oldest are dropped: a phone long offline never piles up megabytes.
export const MAX_QUEUED = 50;

export const usePlateFrameOutbox = create<{ items: QueuedFrame[] }>()(
  persist(() => ({ items: [] as QueuedFrame[] }), {
    name: 'catchline-plate-frames',
    storage: createJSONStorage(() => AsyncStorage),
  })
);

function removeFile(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

function drop(ids: string[]): void {
  const { items } = usePlateFrameOutbox.getState();
  items.filter((i) => ids.includes(i.id)).forEach((i) => removeFile(i.file));
  usePlateFrameOutbox.setState({ items: items.filter((i) => !ids.includes(i.id)) });
}

// Everything waiting, with its files: when the lifter turns the setting off or deletes what they sent.
export function clearPlateFrameOutbox(): void {
  drop(usePlateFrameOutbox.getState().items.map((i) => i.id));
}

// The server will never take these on a retry.
const REFUSED = ['consent_required', 'bad_frame', 'rate_limited'];

let flushing: Promise<number> | null = null;

// Sends what is waiting, oldest first; stops at the first network failure. Nothing goes without the consent:
// the choice is written to the server first, and a phone whose setting is off empties the queue instead.
export function flushPlateFrames(): Promise<number> {
  if (!backendEnabled()) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      if (!plateFramesGranted()) {
        await syncPlateFramesConsent();
        clearPlateFrameOutbox();
        return 0;
      }
      // the server must hold the yes before any crop goes; offline, everything waits
      if (!(await syncPlateFramesConsent())) return 0;
      for (const item of [...usePlateFrameOutbox.getState().items]) {
        try {
          await uploadPlateFrame(item.id, readClip(item.file));
          await recordPlateFrame(item.id, item.record);
          sent++;
        } catch (e) {
          const code = e instanceof ApiError ? e.code : 'unknown';
          if (code === 'consent_required') {
            clearPlateFrameOutbox();
            break;
          }
          if (!REFUSED.includes(code)) break;
        }
        drop([item.id]);
      }
    } catch {
      // offline: the rest stay queued
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}

export function queuePlateFrames(frames: QueuedFrame[]): Promise<number> {
  if (!plateFramesGranted()) {
    frames.forEach((f) => removeFile(f.file));
    return Promise.resolve(0);
  }
  const all = [...usePlateFrameOutbox.getState().items, ...frames];
  const over = all.slice(0, Math.max(0, all.length - MAX_QUEUED));
  usePlateFrameOutbox.setState({ items: all });
  if (over.length) drop(over.map((i) => i.id));
  return flushPlateFrames();
}
