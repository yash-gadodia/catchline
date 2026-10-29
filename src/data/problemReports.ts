import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { randomUUID } from 'expo-crypto';
import { ensureSession, sendProblemReport, uploadProblemShot, type ProblemReport } from '../lib/api';
import { backendEnabled } from './backend';
import { readClip } from './readClip';

// A queued report may carry the screenshot it was started from (a file on this phone);
// it goes up under the report's id just before the row.
export type QueuedReport = ProblemReport & { shot?: string };

// Reports wait here until the phone is online: 3.1 works offline, so Send never needs a network.
export const useProblemReports = create<{ items: QueuedReport[] }>()(
  persist(() => ({ items: [] as QueuedReport[] }), {
    name: 'catchline-problem-reports',
    storage: createJSONStorage(() => AsyncStorage),
  })
);

export function reportDetails(): Pick<ProblemReport, 'appVersion' | 'updateId' | 'device'> {
  return {
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    updateId: Updates.updateId ?? 'embedded',
    device: [Device.modelId ?? Device.modelName ?? 'unknown', Device.osName, Device.osVersion].filter(Boolean).join(' '),
  };
}

let flushing: Promise<number> | null = null;

// Sends what is waiting, oldest first; stops at the first failure and keeps the rest for next time.
export function flushProblemReports(): Promise<number> {
  if (!backendEnabled()) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      if (useProblemReports.getState().items.length === 0) return 0;
      await ensureSession();
      for (const item of useProblemReports.getState().items) {
        if (item.shot) await uploadProblemShot(item.id, readClip(item.shot));
        await sendProblemReport(item);
        useProblemReports.setState((s) => ({ items: s.items.filter((i) => i.id !== item.id) }));
        sent++;
      }
    } catch {
      // offline or not deployed yet: the rest stay queued
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}

export function queueProblemReport(input: { body: string; liftId?: string; context?: string; shot?: string }): Promise<number> {
  const item: QueuedReport = {
    id: randomUUID(),
    body: input.body.trim(),
    ...reportDetails(),
    liftId: input.liftId ?? null,
    context: input.context ?? null,
    reportedAt: new Date().toISOString(),
    ...(input.shot ? { shot: input.shot } : {}),
  };
  useProblemReports.setState((s) => ({ items: [...s.items, item] }));
  return flushProblemReports();
}
