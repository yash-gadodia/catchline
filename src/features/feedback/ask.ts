import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';

// The feedback ask: once per install, a lifter who has tracked two lifts is asked how Catchline is working, in a sheet
// on the first screen. A lifter who does not come back gets the same question once as a quiet local notification,
// three days after a tracked lift. Either one opens the report screen; whichever comes first spends the ask.
const DAY = 86400;
export const FEEDBACK_AFTER_S = 3 * DAY;
export const FEEDBACK_MIN_LIFTS = 2;
export const FEEDBACK_ID = 'catchline-feedback-ask';
export const FEEDBACK_CONTEXT = 'feedback';
export const isFeedbackAsk = (id: string | undefined | null) => id === FEEDBACK_ID;

// asked: the sheet was shown or the notification was tapped. notified: the notification is set (or was refused).
type AskState = { asked: boolean; notified: boolean; open: boolean };
export const useFeedbackAsk = create<AskState>()(
  persist((): AskState => ({ asked: false, notified: false, open: false }), {
    name: 'catchline-feedback-ask',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ asked, notified }) => ({ asked, notified }) as AskState,
  }),
);

const cancelNotification = () => Notifications.cancelScheduledNotificationAsync(FEEDBACK_ID).catch(() => undefined);

// At launch, with the number of lifts on the phone.
export function offerFeedback(lifts: number): boolean {
  if (useFeedbackAsk.getState().asked || lifts < FEEDBACK_MIN_LIFTS) return false;
  useFeedbackAsk.setState({ asked: true, open: true });
  void cancelNotification();
  track(EVENTS.FEEDBACK_ASK_SHOWN, { lifts });
  return true;
}

export function closeFeedback(gave: boolean): void {
  useFeedbackAsk.setState({ open: false });
  track(gave ? EVENTS.FEEDBACK_ASK_GIVE : EVENTS.FEEDBACK_ASK_LATER, {});
}

// The notification was tapped: the report screen opens, and the sheet is not shown on top of it later.
export function feedbackNotificationOpened(): void {
  useFeedbackAsk.setState({ asked: true, open: false });
  track(EVENTS.FEEDBACK_NOTIFICATION_OPENED, {});
}

// After a tracked lift: once per install, and not for a lifter the sheet already asked.
export async function scheduleFeedbackNotification(): Promise<'scheduled' | 'skipped' | 'refused'> {
  const s = useFeedbackAsk.getState();
  if (s.asked || s.notified) return 'skipped';
  useFeedbackAsk.setState({ notified: true });
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowProvisional: true } });
    if (!p.granted) return 'refused';
    await Notifications.scheduleNotificationAsync({
      identifier: FEEDBACK_ID,
      content: { title: t('notifications.feedback.title'), body: t('notifications.feedback.body') },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: FEEDBACK_AFTER_S },
    });
    return 'scheduled';
  } catch {
    return 'refused';
  }
}
