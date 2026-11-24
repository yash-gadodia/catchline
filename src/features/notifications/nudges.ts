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

// Quiet (provisional) permission is what these reminders ask for, and expo-notifications reports it as status
// 'undetermined' with `granted: false`: only a full "Allow" is granted. Reading `granted` alone took every quiet
// permission for a refusal, so until 24-11-2026 none of the app's local reminders was ever set.
export const canNotify = (p: Notifications.NotificationPermissionsStatus) => p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

// scheduled: the three are set, or notifications are turned off (nothing to set, and not asked again). lifted: a
// lift was tracked.
type NudgeState = { scheduled: boolean; lifted: boolean };
export const useNudges = create<NudgeState>()(
  persist((): NudgeState => ({ scheduled: false, lifted: false }), {
    name: 'catchline-first-lift-nudges',
    storage: createJSONStorage(() => AsyncStorage),
    version: 1,
    // before version 1 `scheduled` was set with nothing scheduled (see canNotify): those phones get their reminders
    migrate: (saved) => ({ scheduled: false, lifted: !!(saved as Partial<NudgeState> | null)?.lifted }),
  }),
);

// What the phone saved is read before deciding: at launch the store may not have loaded yet.
const loaded = () => (useNudges.persist.hasHydrated() ? Promise.resolve() : new Promise<void>((done) => useNudges.persist.onFinishHydration(() => done())));

// At launch: once per install, and never for a phone that has tracked a lift (`hasLift`).
export async function scheduleFirstLiftNudges(hasLift: boolean): Promise<'scheduled' | 'skipped' | 'refused'> {
  await loaded();
  const s = useNudges.getState();
  if (s.scheduled || s.lifted) return 'skipped';
  if (hasLift) {
    useNudges.setState({ lifted: true });
    return 'skipped';
  }
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!canNotify(p) && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowProvisional: true } });
    if (!canNotify(p)) {
      // turned off in Settings: nothing to set, now or later. Anything else (a dialog left unanswered) is tried again.
      if (p.status === 'denied') useNudges.setState({ scheduled: true });
      return 'refused';
    }
    await Promise.all(
      NUDGE_AFTER_S.map((seconds, i) =>
        Notifications.scheduleNotificationAsync({
          identifier: nudgeId(i + 1),
          content: { title: t(`notifications.nudge${i + 1}.title` as 'notifications.nudge1.title'), body: t(`notifications.nudge${i + 1}.body` as 'notifications.nudge1.body'), data: { nudge: i + 1 } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
        }),
      ),
    );
    useNudges.setState({ scheduled: true });
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

// The week's free video is used: one quiet reminder on the Monday it comes back, at nine in the morning. It is about
// the lifter's own allowance, not an offer. Replaced each time, and cancelled by a purchase.
export const FREE_BACK_ID = 'catchline-free-video-back';
export async function scheduleFreeVideoBack(monday: Date): Promise<'scheduled' | 'refused'> {
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!canNotify(p) && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowProvisional: true } });
    if (!canNotify(p)) return 'refused';
    const at = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 9, 0, 0);
    await Notifications.scheduleNotificationAsync({
      identifier: FREE_BACK_ID,
      content: { title: t('notifications.freeBack.title'), body: t('notifications.freeBack.body') },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    track(EVENTS.FREE_BACK_SCHEDULED, {});
    return 'scheduled';
  } catch {
    return 'refused';
  }
}

export async function cancelFreeVideoBack(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(FREE_BACK_ID).catch(() => undefined);
}
