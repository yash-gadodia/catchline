import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { randomUUID } from 'expo-crypto';
import { ensureSession, sendProblemReport, type ProblemReport } from '../lib/api';
import { backendEnabled } from './backend';

// Reports wait here until the phone is online: 3.1 works offline, so Send never needs a network.
export const useProblemReports = create<{ items: ProblemReport[] }>()(
  persist(() => ({ items: [] as ProblemReport[] }), {
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

export function queueProblemReport(input: { body: string; liftId?: string; context?: string }): Promise<number> {
  const item: ProblemReport = {
    id: randomUUID(),
    body: input.body.trim(),
    ...reportDetails(),
    liftId: input.liftId ?? null,
    context: input.context ?? null,
    reportedAt: new Date().toISOString(),
  };
  useProblemReports.setState((s) => ({ items: [...s.items, item] }));
  return flushProblemReports();
}
