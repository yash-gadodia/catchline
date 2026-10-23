import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Movement } from '../../analysis/types';
import { movementLabel } from '../../analysis/format';
import { setHapticsEnabled } from '../../lib/haptics';
import { setLanguage, t, type Language } from '../../i18n';

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
  language: Language;
};

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  defaultMovement: 'snatch',
  frameRate: 'auto',
  voiceCountdown: true,
  haptics: true,
  cueReminder: { days: [2, 4], time: '17:30' },
  autoDelete: '24h',
  language: 'system',
};

export const MOVEMENTS: Movement[] = ['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up', 'kipping_hspu'];
export const UNIT_LABELS: Record<Units, string> = { kg: 'kg', lb: 'lb' };
export function frameRateLabels(): Record<FrameRate, string> {
  return {
    auto: t('you.frameRate.auto'),
    '60': '60 fps',
    '120': '120 fps',
    '240': '240 fps',
  };
}
export function autoDeleteLabels(): Record<AutoDelete, string> {
  return {
    '24h': '24 h',
    '7d': t('you.autoDelete.days', { count: 7 }),
    '30d': t('you.autoDelete.days', { count: 30 }),
    never: t('you.autoDelete.never'),
  };
}
// English short names, used only as stable testIDs; the shown name is dayName(d).
export const DAY_IDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_KEYS = ['you.day.0', 'you.day.1', 'you.day.2', 'you.day.3', 'you.day.4', 'you.day.5', 'you.day.6'] as const;
export function dayName(d: number): string {
  return t(DAY_KEYS[d]);
}
export const REMINDER_TIMES = ['06:30', '07:30', '12:00', '17:30', '19:00'];

export function reminderLabel(r: CueReminder): string {
  if (r.days.length === 0) return t('you.reminder.off');
  const days = [...new Set(r.days)].sort((a, b) => a - b).map(dayName);
  return `${days.length === DAY_IDS.length ? t('you.reminder.everyDay') : days.join(', ')} · ${r.time}`;
}

export function settingLabels(s: Settings) {
  return {
    units: UNIT_LABELS[s.units],
    defaultMovement: movementLabel(s.defaultMovement),
    frameRate: frameRateLabels()[s.frameRate],
    cueReminder: reminderLabel(s.cueReminder),
    autoDelete: autoDeleteLabels()[s.autoDelete],
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
    language: s.language,
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
        if (key === 'language') setLanguage(value as Language);
        set({ [key]: value } as Partial<Settings>);
      },
      reset: () => {
        setLanguage(DEFAULT_SETTINGS.language);
        set(DEFAULT_SETTINGS);
      },
    }),
    {
      name: 'catchline-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: settingsOf,
      onRehydrateStorage: () => (state) => {
        if (state?.language) setLanguage(state.language);
      },
    }
  )
);
