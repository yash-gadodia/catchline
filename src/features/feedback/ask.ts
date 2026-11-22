import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';
import { queueProblemReport } from '../../data/problemReports';
import { claimSessionAsk } from './sessionAsk';

// The feedback ask: once per install, on the result of a lifter's second tracked lift (or the next one, when the
// rating ask already had that run), a small sheet asks how Catchline is going. One tap answers (Good / Not great) and
// lands in problem_reports at once; a line of their own words is optional after it. A lifter who does not come back
// gets the question once as a quiet local notification, three days after a tracked lift. Whichever comes first spends
// the ask.
const DAY = 86400;
export const FEEDBACK_AFTER_S = 3 * DAY;
export const FEEDBACK_MIN_LIFTS = 2;
export const FEEDBACK_ID = 'catchline-feedback-ask';
export const FEEDBACK_CONTEXT = 'feedback';
export const isFeedbackAsk = (id: string | undefined | null) => id === FEEDBACK_ID;

export type FeedbackAnswer = 'up' | 'down';
export const ANSWER_BODY: Record<FeedbackAnswer, string> = { up: '👍', down: '👎' };
export const answerContext = (answer: FeedbackAnswer) => `feedback_ask ${answer}`;

// asked: the sheet was shown or the notification was tapped. notified: the notification is set (or was refused).
// open, liftId and answer are this run's sheet only.
type AskState = { asked: boolean; notified: boolean; open: boolean; liftId: string | null; answer: FeedbackAnswer | null };
export const useFeedbackAsk = create<AskState>()(
  persist((): AskState => ({ asked: false, notified: false, open: false, liftId: null, answer: null }), {
    name: 'catchline-feedback-ask',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ asked, notified }) => ({ asked, notified }) as AskState,
  }),
);

const cancelNotification = () => Notifications.cancelScheduledNotificationAsync(FEEDBACK_ID).catch(() => undefined);

// The result card of a tracked lift is up; `lifts` is how many tracked lifts the phone has, this one included.
export function offerFeedback(lifts: number, liftId: string): boolean {
  if (useFeedbackAsk.getState().asked || lifts < FEEDBACK_MIN_LIFTS) return false;
  if (!claimSessionAsk('feedback')) return false;
  useFeedbackAsk.setState({ asked: true, open: true, liftId, answer: null });
  void cancelNotification();
  track(EVENTS.FEEDBACK_ASK_SHOWN, { lifts });
  return true;
}

export function answerFeedback(answer: FeedbackAnswer): void {
  const { liftId } = useFeedbackAsk.getState();
  useFeedbackAsk.setState({ answer });
  track(EVENTS.FEEDBACK_ASK_ANSWERED, { answer });
  void queueProblemReport({ body: ANSWER_BODY[answer], context: answerContext(answer), ...(liftId ? { liftId } : {}) });
}

// The optional line after the answer.
export function sendFeedbackNote(text: string): void {
  const { liftId, answer } = useFeedbackAsk.getState();
  const note = text.trim();
  if (!answer || !note) return;
  track(EVENTS.FEEDBACK_SENT, { chars: note.length, via: 'ask' });
  void queueProblemReport({ body: `${ANSWER_BODY[answer]} ${note}`, context: answerContext(answer), ...(liftId ? { liftId } : {}) });
  closeFeedback();
}

// Closed by "Not now", by "Done" after an answer, or by leaving the result. Only a close with no answer is a "later".
export function closeFeedback(): void {
  const { open, answer } = useFeedbackAsk.getState();
  if (!open) return;
  useFeedbackAsk.setState({ open: false, liftId: null, answer: null });
  if (!answer) track(EVENTS.FEEDBACK_ASK_LATER, {});
}

// The notification was tapped: the report screen opens, and the sheet is not shown later.
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
