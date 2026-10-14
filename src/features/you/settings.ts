import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Movement } from '../../analysis/types';
import { movementLabel } from '../../analysis/format';
import { setHapticsEnabled } from '../../lib/haptics';

export type Units = 'kg' | 'lb';
export type FrameRate = 'auto' | '60' | '120' | '240';
export type AutoDelete = '24h' | '7d' | '30d' | 'never';
export type CueReminder = { days: number[]; time: string };

export type Settings = {
  units: Units;
  defaultMovement: Movement;
  frameRate: FrameRate;
  voiceCountdown: boolean;
  haptics: boolean;
  cueReminder: CueReminder;
  autoDelete: AutoDelete;
  improveAccuracy: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  defaultMovement: 'snatch',
  frameRate: 'auto',
  voiceCountdown: true,
  haptics: true,
  cueReminder: { days: [2, 4], time: '17:30' },
  autoDelete: '24h',
  improveAccuracy: false,
};

export const MOVEMENTS: Movement[] = ['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu'];
export const UNIT_LABELS: Record<Units, string> = { kg: 'kg', lb: 'lb' };
export const FRAME_RATE_LABELS: Record<FrameRate, string> = {
  auto: '60 fps, 240 for snatch',
  '60': '60 fps',
  '120': '120 fps',
  '240': '240 fps',
};
export const AUTO_DELETE_LABELS: Record<AutoDelete, string> = {
  '24h': '24 h',
  '7d': '7 days',
  '30d': '30 days',
  never: 'Never',
};
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const REMINDER_TIMES = ['06:30', '07:30', '12:00', '17:30', '19:00'];

export function reminderLabel(r: CueReminder): string {
  if (r.days.length === 0) return 'Off';
  const days = [...new Set(r.days)].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
  return `${days.length === DAY_NAMES.length ? 'Every day' : days.join(', ')} · ${r.time}`;
}

export function settingLabels(s: Settings) {
  return {
    units: UNIT_LABELS[s.units],
    defaultMovement: movementLabel(s.defaultMovement),
    frameRate: FRAME_RATE_LABELS[s.frameRate],
    cueReminder: reminderLabel(s.cueReminder),
    autoDelete: AUTO_DELETE_LABELS[s.autoDelete],
  };
}

export function settingsOf(s: Settings): Settings {
  return {
    units: s.units,
    defaultMovement: s.defaultMovement,
    frameRate: s.frameRate,
    voiceCountdown: s.voiceCountdown,
    haptics: s.haptics,
    cueReminder: s.cueReminder,
    autoDelete: s.autoDelete,
    improveAccuracy: s.improveAccuracy,
  };
}

type Store = Settings & {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
};

export const useSettings = create<Store>()(
  persist<Store, [], [], Settings>(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => {
        if (key === 'haptics') setHapticsEnabled(value as boolean);
        set({ [key]: value } as Partial<Settings>);
      },
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'catchline-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: settingsOf,
    }
  )
);
