import * as Notifications from 'expo-notifications';
import { fireEvent, render } from '@testing-library/react-native';
import FeedbackSheet from './FeedbackSheet';
import { FEEDBACK_AFTER_S, FEEDBACK_ID, feedbackNotificationOpened, offerFeedback, scheduleFeedbackNotification, useFeedbackAsk } from './ask';
import { track } from '../../lib/analytics';

let mockPath = '/';
jest.mock('expo-router', () => {
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
  return { __esModule: true, router: r, useRouter: () => r, usePathname: () => mockPath };
});
jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));
const router = jest.requireMock('expo-router') as { router: { push: jest.Mock } };
const perms = Notifications.getPermissionsAsync as jest.Mock;
const request = Notifications.requestPermissionsAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/';
  useFeedbackAsk.setState({ asked: false, notified: false, open: false });
  perms.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });
  request.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: false });
  cancel.mockResolvedValue(undefined);
});

describe('the feedback ask', () => {
  it('is not offered before two lifts', () => {
    expect(offerFeedback(1)).toBe(false);
    expect(useFeedbackAsk.getState().open).toBe(false);
  });

  it('is offered once at two lifts, and cancels the notification', () => {
    expect(offerFeedback(2)).toBe(true);
    expect(track).toHaveBeenCalledWith('feedback_ask_shown', { lifts: 2 });
    expect(cancel).toHaveBeenCalledWith(FEEDBACK_ID);
    useFeedbackAsk.setState({ open: false });
    expect(offerFeedback(5)).toBe(false);
  });

  it('the sheet opens the report screen as feedback', () => {
    offerFeedback(2);
    const { getByTestId, queryByTestId } = render(<FeedbackSheet />);
    fireEvent.press(getByTestId('feedback-give'));
    expect(router.router.push).toHaveBeenCalledWith({ pathname: '/report', params: { context: 'feedback' } });
    expect(track).toHaveBeenCalledWith('feedback_ask_give', {});
    expect(queryByTestId('feedback-sheet')).toBeNull();
  });

  it('"Not now" closes it for good', () => {
    offerFeedback(3);
    const { getByTestId, queryByTestId } = render(<FeedbackSheet />);
    fireEvent.press(getByTestId('feedback-later'));
    expect(track).toHaveBeenCalledWith('feedback_ask_later', {});
    expect(queryByTestId('feedback-sheet')).toBeNull();
    expect(router.router.push).not.toHaveBeenCalled();
  });

  it('shows on the first screen only', () => {
    mockPath = '/analysis/player';
    offerFeedback(2);
    expect(render(<FeedbackSheet />).queryByTestId('feedback-sheet')).toBeNull();
  });

  it('one quiet notification three days after a tracked lift, once', async () => {
    expect(await scheduleFeedbackNotification()).toBe('scheduled');
    expect(request).toHaveBeenCalledWith({ ios: { allowProvisional: true } });
    expect(schedule.mock.calls.map(([c]) => [c.identifier, c.trigger.seconds, c.content.title])).toEqual([[FEEDBACK_ID, FEEDBACK_AFTER_S, 'How is Catchline working for you?']]);
    expect(await scheduleFeedbackNotification()).toBe('skipped');
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('no notification for a lifter the sheet already asked, and no sheet after a tapped notification', async () => {
    offerFeedback(2);
    expect(await scheduleFeedbackNotification()).toBe('skipped');
    useFeedbackAsk.setState({ asked: false, notified: false, open: false });
    feedbackNotificationOpened();
    expect(offerFeedback(4)).toBe(false);
    expect(track).toHaveBeenCalledWith('feedback_notification_opened', {});
  });
});
