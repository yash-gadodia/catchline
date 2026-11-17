import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';

// A phone that opened Catchline and never tracked a lift gets three reminders, a day, three days and a week after its
// first open, and then nothing more. They are local (no server, no token) and go out quietly: iOS "provisional"
// permission needs no prompt and puts them in Notification Centre with Keep / Turn Off on the first one. The first
// tracked lift cancels whatever is left.
const HOUR = 3600;
export const NUDGE_AFTER_S = [24 * HOUR, 72 * HOUR, 168 * HOUR];
export const nudgeId = (n: number) => `catchline-first-lift-${n}`;
export const isNudge = (id: string | undefined | null) => !!id && id.startsWith('catchline-first-lift-');

// scheduled: the three are set (or permission was refused, so there is nothing to set). lifted: a lift was tracked.
type NudgeState = { scheduled: boolean; lifted: boolean };
export const useNudges = create<NudgeState>()(
  persist((): NudgeState => ({ scheduled: false, lifted: false }), { name: 'catchline-first-lift-nudges', storage: createJSONStorage(() => AsyncStorage) }),
);

// At launch: once per install, and never for a phone that has tracked a lift (`hasLift`).
export async function scheduleFirstLiftNudges(hasLift: boolean): Promise<'scheduled' | 'skipped' | 'refused'> {
  const s = useNudges.getState();
  if (s.scheduled || s.lifted) return 'skipped';
  if (hasLift) {
    useNudges.setState({ lifted: true });
    return 'skipped';
  }
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowProvisional: true } });
    useNudges.setState({ scheduled: true });
    if (!p.granted) return 'refused';
    await Promise.all(
      NUDGE_AFTER_S.map((seconds, i) =>
        Notifications.scheduleNotificationAsync({
          identifier: nudgeId(i + 1),
          content: { title: t(`notifications.nudge${i + 1}.title` as 'notifications.nudge1.title'), body: t(`notifications.nudge${i + 1}.body` as 'notifications.nudge1.body'), data: { nudge: i + 1 } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
        }),
      ),
    );
    track(EVENTS.NUDGES_SCHEDULED, {});
    return 'scheduled';
  } catch {
    return 'refused';
  }
}

// A lift was tracked: the reminders have done their job, or were never needed.
export async function cancelFirstLiftNudges(): Promise<void> {
  if (useNudges.getState().lifted) return;
  useNudges.setState({ lifted: true });
  await Promise.all(NUDGE_AFTER_S.map((_, i) => Notifications.cancelScheduledNotificationAsync(nudgeId(i + 1)).catch(() => undefined)));
}
