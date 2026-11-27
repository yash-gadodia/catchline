import * as Notifications from 'expo-notifications';
import { act, fireEvent, render } from '@testing-library/react-native';
import FeedbackSheet, { FEEDBACK_ROUTE } from './FeedbackSheet';
import { FEEDBACK_AFTER_S, FEEDBACK_ID, answerFeedback, closeFeedback, feedbackNotificationOpened, offerFeedback, offerQueuedFeedback, queueFeedback, scheduleFeedbackNotification, useFeedbackAsk } from './ask';
import { claimSessionAsk, resetSessionAsk } from './sessionAsk';
import { track } from '../../lib/analytics';
import { queueProblemReport } from '../../data/problemReports';

let mockPath = FEEDBACK_ROUTE;
jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return { __esModule: true, router: r, useRouter: () => r, usePathname: () => mockPath };
});
jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));
jest.mock('../../data/problemReports', () => ({ queueProblemReport: jest.fn(async () => 1) }));
const perms = Notifications.getPermissionsAsync as jest.Mock;
const request = Notifications.requestPermissionsAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const queued = queueProblemReport as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = FEEDBACK_ROUTE;
  resetSessionAsk();
  useFeedbackAsk.setState({ asked: false, offers: 0, notified: false, open: false, openedAt: 0, liftId: null, answer: null });
  perms.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });
  request.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: false });
  cancel.mockResolvedValue(undefined);
});

describe('the feedback ask', () => {
  it('is not offered on the first lift', () => {
    expect(offerFeedback(1, 'l1')).toBe(false);
    expect(useFeedbackAsk.getState().open).toBe(false);
  });

  it('is offered on the second lift; the notification stays until an answer, which ends both', () => {
    expect(offerFeedback(2, 'l2')).toBe(true);
    expect(track).toHaveBeenCalledWith('feedback_ask_shown', { lifts: 2, offer: 1 });
    expect(cancel).not.toHaveBeenCalled();
    answerFeedback('up');
    expect(cancel).toHaveBeenCalledWith(FEEDBACK_ID);
    closeFeedback();
    expect(offerFeedback(3, 'l3')).toBe(false);
  });

  it('leaving the result unanswered does not spend the ask: it is offered again, three times at most', () => {
    for (const offer of [1, 2, 3]) {
      expect(offerFeedback(2, 'l2')).toBe(true);
      expect(track).toHaveBeenLastCalledWith('feedback_ask_shown', { lifts: 2, offer });
      closeFeedback('/share');
      expect(track).toHaveBeenLastCalledWith('feedback_ask_later', { how: 'left', to: '/share', open_ms: expect.any(Number) });
      expect(useFeedbackAsk.getState()).toMatchObject({ asked: false, open: false, offers: offer });
    }
    expect(offerFeedback(2, 'l2')).toBe(false);
  });

  it('a lifter the old sheet spent its ask on is asked again', async () => {
    const migrate = useFeedbackAsk.persist.getOptions().migrate!;
    expect(await migrate({ asked: true, notified: true }, 0)).toEqual({ asked: false, offers: 0, notified: false });
  });

  it('a phone marked notified while nothing was ever scheduled gets its notification, and keeps its answer', async () => {
    const migrate = useFeedbackAsk.persist.getOptions().migrate!;
    expect(await migrate({ asked: true, offers: 1, notified: true }, 1)).toEqual({ asked: true, offers: 1, notified: false });
    expect(await migrate({ asked: false, offers: 2, notified: true }, 1)).toEqual({ asked: false, offers: 2, notified: false });
  });

  it('quiet permission is enough: expo reports it as undetermined and not granted', async () => {
    request.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true, ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL } });
    expect(await scheduleFeedbackNotification()).toBe('scheduled');
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(useFeedbackAsk.getState().notified).toBe(true);
  });

  it('a request that fails does not spend the notification: the next lift tries again', async () => {
    request.mockRejectedValueOnce(new Error('no'));
    expect(await scheduleFeedbackNotification()).toBe('refused');
    expect(useFeedbackAsk.getState().notified).toBe(false);
    expect(await scheduleFeedbackNotification()).toBe('scheduled');
  });

  it('a sheet the lifter walked away from leaves the notification in place', async () => {
    expect(await scheduleFeedbackNotification()).toBe('scheduled');
    offerFeedback(2, 'l2');
    closeFeedback('/share');
    expect(cancel).not.toHaveBeenCalled();
    offerFeedback(3, 'l3');
    closeFeedback();
    expect(cancel).toHaveBeenCalledWith(FEEDBACK_ID);
  });

  it('waits for the next run when the rating ask had this one, and then shows on the third lift', () => {
    expect(claimSessionAsk('rating')).toBe(true);
    expect(offerFeedback(2, 'l2')).toBe(false);
    expect(useFeedbackAsk.getState().asked).toBe(false);
    resetSessionAsk();
    expect(offerFeedback(3, 'l3')).toBe(true);
  });

  it('takes the run from the rating ask once it shows', () => {
    offerFeedback(2, 'l2');
    expect(claimSessionAsk('rating')).toBe(false);
  });

  it('one tap answers: the thumb lands in problem_reports with the lift', async () => {
    offerFeedback(2, 'l2');
    const { getByTestId, getByText } = await render(<FeedbackSheet />);
    expect(getByText("How's Catchline so far?")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('feedback-up'));
    });
    expect(queued.mock.calls).toEqual([[{ body: '👍', context: 'feedback_ask up', liftId: 'l2' }]]);
    expect(track).toHaveBeenCalledWith('feedback_ask_answered', { answer: 'up' });
    expect(getByText('Thanks. Anything to add?')).toBeTruthy();
  });

  it('the optional line goes as a second report, then the sheet closes', async () => {
    offerFeedback(2, 'l2');
    const { getByTestId, queryByTestId } = await render(<FeedbackSheet />);
    await act(async () => {
      fireEvent.press(getByTestId('feedback-down'));
    });
    await act(async () => {
      fireEvent.changeText(getByTestId('feedback-note'), '  the plate box jumps  ');
    });
    await act(async () => {
      fireEvent.press(getByTestId('feedback-send'));
    });
    expect(queued.mock.calls).toEqual([
      [{ body: '👎', context: 'feedback_ask down', liftId: 'l2' }],
      [{ body: '👎 the plate box jumps', context: 'feedback_ask down', liftId: 'l2' }],
    ]);
    expect(track).toHaveBeenCalledWith('feedback_sent', { chars: 19, via: 'ask' });
    expect(track).not.toHaveBeenCalledWith('feedback_ask_later', {});
    expect(queryByTestId('feedback-sheet')).toBeNull();
  });

  it('"Done" after an answer closes it without a second report and without a "later"', async () => {
    offerFeedback(2, 'l2');
    const { getByTestId, queryByTestId } = await render(<FeedbackSheet />);
    await act(async () => {
      fireEvent.press(getByTestId('feedback-up'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('feedback-done'));
    });
    expect(queued).toHaveBeenCalledTimes(1);
    expect(track).not.toHaveBeenCalledWith('feedback_ask_later', {});
    expect(queryByTestId('feedback-sheet')).toBeNull();
  });

  it('"Not now" closes it for good, with nothing sent', async () => {
    offerFeedback(3, 'l3');
    const { getByTestId, queryByTestId } = await render(<FeedbackSheet />);
    await act(async () => {
      fireEvent.press(getByTestId('feedback-later'));
    });
    expect(track).toHaveBeenCalledWith('feedback_ask_later', { how: 'not_now', to: '', open_ms: expect.any(Number) });
    expect(queryByTestId('feedback-sheet')).toBeNull();
    expect(queued).not.toHaveBeenCalled();
    expect(useFeedbackAsk.getState().asked).toBe(true);
  });

  it('waits for the lifter to be back on Lifts: seeing the result only queues it, once', () => {
    queueFeedback(2, 'l2');
    expect(useFeedbackAsk.getState().open).toBe(false);
    expect(offerQueuedFeedback()).toBe(true);
    expect(useFeedbackAsk.getState()).toMatchObject({ open: true, liftId: 'l2' });
    expect(offerQueuedFeedback()).toBe(false);
  });

  it('shows on Lifts only, and leaving it closes the sheet (never over the paywall)', async () => {
    offerFeedback(2, 'l2');
    mockPath = '/paywall';
    const { queryByTestId } = await render(<FeedbackSheet />);
    expect(queryByTestId('feedback-sheet')).toBeNull();
    expect(useFeedbackAsk.getState()).toMatchObject({ open: false, asked: false });
    expect(track).toHaveBeenCalledWith('feedback_ask_later', { how: 'left', to: '/paywall', open_ms: expect.any(Number) });
  });

  it('one quiet notification three days after a tracked lift, once', async () => {
    expect(await scheduleFeedbackNotification()).toBe('scheduled');
    expect(request).toHaveBeenCalledWith({ ios: { allowProvisional: true } });
    expect(schedule.mock.calls.map(([c]) => [c.identifier, c.trigger.seconds, c.content.title])).toEqual([[FEEDBACK_ID, FEEDBACK_AFTER_S, 'How is Catchline working for you?']]);
    expect(await scheduleFeedbackNotification()).toBe('skipped');
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('no notification for a lifter who answered, and no sheet after a tapped notification', async () => {
    offerFeedback(2, 'l2');
    answerFeedback('down');
    expect(await scheduleFeedbackNotification()).toBe('skipped');
    useFeedbackAsk.setState({ asked: false, notified: false, open: false });
    resetSessionAsk();
    feedbackNotificationOpened();
    expect(offerFeedback(4, 'l4')).toBe(false);
    expect(track).toHaveBeenCalledWith('feedback_notification_opened', {});
  });
});
