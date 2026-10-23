import { Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../i18n';
import { registerPushToken } from './index';

export type PushStatus = 'granted' | 'undetermined' | 'denied';

// iOS shows its own prompt once. After that the only way to turn notifications on is Settings,
// so every ask past the first is a Settings link, never a fake second prompt.
export async function pushStatus(): Promise<PushStatus> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function askForPush(): Promise<PushStatus> {
  const status = await pushStatus();
  if (status === 'undetermined') {
    await registerPushToken(true);
    return pushStatus();
  }
  if (status === 'denied') await Linking.openSettings().catch(() => undefined);
  return status;
}

// onboarded: the onboarding step was answered. reasked: the one re-ask after a first real analysis was used.
type PushAsk = { onboarded: boolean; reasked: boolean };

export const usePushAsk = create<PushAsk>()(
  persist((): PushAsk => ({ onboarded: false, reasked: false }), {
    name: 'catchline-push-ask',
    storage: createJSONStorage(() => AsyncStorage),
  })
);

let analysisFinished = false;

export function noteAnalysisFinished(): void {
  analysisFinished = true;
}

// Once, after the first lift this phone analysed, if notifications are still off.
export async function maybeReaskForPush(alert: typeof Alert.alert = Alert.alert): Promise<boolean> {
  if (!analysisFinished || usePushAsk.getState().reasked) return false;
  analysisFinished = false;
  const status = await pushStatus();
  if (status === 'granted') return false;
  usePushAsk.setState({ reasked: true });
  alert(t('notifications.reask.title'), t('notifications.reask.body'), [
    { text: t('notifications.reask.notNow'), style: 'cancel' },
    {
      text: status === 'denied' ? t('notifications.openSettings') : t('notifications.turnOn'),
      onPress: () => void askForPush(),
    },
  ]);
  return true;
}
