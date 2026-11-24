import * as Notifications from 'expo-notifications';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';
import { queueProblemReport } from '../../data/problemReports';
import { canNotify } from '../notifications/nudges';
import { claimSessionAsk } from './sessionAsk';

// The feedback ask: on the result of a lifter's second tracked lift (or the next one, when the rating ask already had
// that run), a small sheet asks how Catchline is going. One tap answers (Good / Not great) and lands in problem_reports
// at once; a line of their own words is optional after it. An answer or "Not now" spends the ask for good. Leaving
// the result with the sheet unanswered does not: 6 of the first 7 sheets closed that way within about a second
// (24-11-2026), so the lifter is asked again on a later result, FEEDBACK_MAX_OFFERS times at most. A lifter who does
// not come back gets the question once as a quiet local notification, three days after a tracked lift.
const DAY = 86400;
export const FEEDBACK_AFTER_S = 3 * DAY;
export const FEEDBACK_MIN_LIFTS = 2;
export const FEEDBACK_MAX_OFFERS = 3;
export const FEEDBACK_ID = 'catchline-feedback-ask';
export const FEEDBACK_CONTEXT = 'feedback';
export const isFeedbackAsk = (id: string | undefined | null) => id === FEEDBACK_ID;

export type FeedbackAnswer = 'up' | 'down';
export const ANSWER_BODY: Record<FeedbackAnswer, string> = { up: '👍', down: '👎' };
export const answerContext = (answer: FeedbackAnswer) => `feedback_ask ${answer}`;

// asked: the lifter answered, said "Not now", or tapped the notification. offers: times the sheet has opened.
// notified: the notification is set (or was refused). open, openedAt, liftId and answer are this run's sheet only.
type AskState = { asked: boolean; offers: number; notified: boolean; open: boolean; openedAt: number; liftId: string | null; answer: FeedbackAnswer | null };
export const useFeedbackAsk = create<AskState>()(
  persist((): AskState => ({ asked: false, offers: 0, notified: false, open: false, openedAt: 0, liftId: null, answer: null }), {
    name: 'catchline-feedback-ask',
    storage: createJSONStorage(() => AsyncStorage),
    version: 2,
    // before version 1 the sheet opening spent the ask, seen or not: those lifters are asked again. Before version 2
    // `notified` was set with no notification scheduled (nudges.ts canNotify): it is set again.
    migrate: (saved, version) => {
      const was = (saved ?? {}) as Partial<AskState>;
      return (version < 1 ? { asked: false, offers: 0, notified: false } : { asked: !!was.asked, offers: was.offers ?? 0, notified: false }) as AskState;
    },
    partialize: ({ asked, offers, notified }) => ({ asked, offers, notified }) as AskState,
  }),
);

const cancelNotification = () => Notifications.cancelScheduledNotificationAsync(FEEDBACK_ID).catch(() => undefined);

// The result card of a tracked lift is up; `lifts` is how many tracked lifts the phone has, this one included.
export function offerFeedback(lifts: number, liftId: string): boolean {
  const { asked, offers } = useFeedbackAsk.getState();
  if (asked || offers >= FEEDBACK_MAX_OFFERS || lifts < FEEDBACK_MIN_LIFTS) return false;
  if (!claimSessionAsk('feedback')) return false;
  useFeedbackAsk.setState({ offers: offers + 1, open: true, openedAt: Date.now(), liftId, answer: null });
  track(EVENTS.FEEDBACK_ASK_SHOWN, { lifts, offer: offers + 1 });
  return true;
}

export function answerFeedback(answer: FeedbackAnswer): void {
  const { liftId } = useFeedbackAsk.getState();
  useFeedbackAsk.setState({ asked: true, answer });
  void cancelNotification();
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

// Closed by "Not now", by "Done" after an answer, or (left: the screen the lifter went to) by leaving the result.
// Only a close with no answer is a "later", and only "Not now" spends the ask.
export function closeFeedback(left?: string): void {
  const { open, answer, openedAt } = useFeedbackAsk.getState();
  if (!open) return;
  useFeedbackAsk.setState({ open: false, liftId: null, answer: null, ...(left === undefined ? { asked: true } : {}) });
  // answered or "Not now": the notification has nothing left to ask. A sheet the lifter walked away from keeps it.
  if (left === undefined) void cancelNotification();
  if (!answer) track(EVENTS.FEEDBACK_ASK_LATER, { how: left === undefined ? 'not_now' : 'left', to: left ?? '', open_ms: Date.now() - openedAt });
}

// The notification was tapped: the report screen opens, and the sheet is not shown later.
export function feedbackNotificationOpened(): void {
  useFeedbackAsk.setState({ asked: true, open: false });
  track(EVENTS.FEEDBACK_NOTIFICATION_OPENED, {});
}

// After a tracked lift: once per install, and not for a lifter who has answered the sheet or said "Not now".
export async function scheduleFeedbackNotification(): Promise<'scheduled' | 'skipped' | 'refused'> {
  const s = useFeedbackAsk.getState();
  if (s.asked || s.notified) return 'skipped';
  try {
    let p = await Notifications.getPermissionsAsync();
    if (!canNotify(p) && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowProvisional: true } });
    if (!canNotify(p)) {
      // turned off in Settings: not tried again. Anything else is, after the next lift.
      if (p.status === 'denied') useFeedbackAsk.setState({ notified: true });
      return 'refused';
    }
    await Notifications.scheduleNotificationAsync({
      identifier: FEEDBACK_ID,
      content: { title: t('notifications.feedback.title'), body: t('notifications.feedback.body') },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: FEEDBACK_AFTER_S },
    });
    useFeedbackAsk.setState({ notified: true });
    return 'scheduled';
  } catch {
    return 'refused';
  }
}
