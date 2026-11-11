import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ClipTranscoder from '../../../modules/clip-transcoder';
import { backendEnabled } from '../../data/backend';
import { ensureSession, recordConsent } from '../../lib/api';

// "Help Catchline find plates better": off until the lifter says yes, asked once after their first result and
// changeable in the You tab. The server keeps its own record (consents, kind 'plate_frames') and refuses every
// crop without it, so this store only decides what the phone tries to send.
// Bump when the words the lifter agreed to change, so everyone is asked again.
export const PLATE_FRAMES_CONSENT_VERSION = 1;

export type PlateFramesChoice = { granted: boolean; version: number; at: string; synced: boolean };

type State = { choice: PlateFramesChoice | null; asked: boolean };

export const usePlateFramesConsent = create<State>()(
  persist(() => ({ choice: null, asked: false }) as State, {
    name: 'catchline-plate-frames-consent',
    storage: createJSONStorage(() => AsyncStorage),
  })
);

// Crops are cut by the native side (ClipTranscoder.cropFrames, the build after 41); without it nothing is asked or sent.
export function plateFramesSupported(): boolean {
  return backendEnabled() && typeof ClipTranscoder?.cropFrames === 'function';
}

export function plateFramesGranted(): boolean {
  const { choice } = usePlateFramesConsent.getState();
  return plateFramesSupported() && choice?.granted === true && choice.version === PLATE_FRAMES_CONSENT_VERSION;
}

export function shouldAskPlateFrames(): boolean {
  const { choice, asked } = usePlateFramesConsent.getState();
  return plateFramesSupported() && !asked && choice === null;
}

export function markPlateFramesAsked(): void {
  usePlateFramesConsent.setState({ asked: true });
}

let syncing: Promise<boolean> | null = null;

// Writes the latest choice to the server's consent log; a choice made offline goes up on the next flush.
export function syncPlateFramesConsent(): Promise<boolean> {
  const { choice } = usePlateFramesConsent.getState();
  if (!choice || choice.synced || !backendEnabled()) return Promise.resolve(choice?.synced ?? false);
  syncing ??= (async () => {
    try {
      await ensureSession();
      await recordConsent('plate_frames', String(choice.version), choice.granted);
      if (usePlateFramesConsent.getState().choice?.at === choice.at) usePlateFramesConsent.setState({ choice: { ...choice, synced: true } });
      return true;
    } catch {
      return false;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export function setPlateFramesChoice(granted: boolean, now = new Date()): Promise<boolean> {
  usePlateFramesConsent.setState({ asked: true, choice: { granted, version: PLATE_FRAMES_CONSENT_VERSION, at: now.toISOString(), synced: false } });
  return syncPlateFramesConsent();
}
