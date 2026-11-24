import * as Notifications from 'expo-notifications';
import { NUDGE_AFTER_S, cancelFirstLiftNudges, isNudge, nudgeId, scheduleFirstLiftNudges, useNudges } from './nudges';
import { track } from '../../lib/analytics';

jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));
const perms = Notifications.getPermissionsAsync as jest.Mock;
const request = Notifications.requestPermissionsAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const cancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useNudges.setState({ scheduled: false, lifted: false });
  perms.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });
  request.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: false });
});

describe('first-lift reminders', () => {
  it('a phone with no lift gets three, a day, three days and a week out, on quiet permission, once', async () => {
    expect(await scheduleFirstLiftNudges(false)).toBe('scheduled');
    expect(request).toHaveBeenCalledWith({ ios: { allowProvisional: true } });
    expect(schedule.mock.calls.map(([c]) => [c.identifier, c.trigger.seconds, c.content.title])).toEqual([
      ['catchline-first-lift-1', 86400, 'Your first bar path takes about a minute'],
      ['catchline-first-lift-2', 259200, 'Got a lift on video?'],
      ['catchline-first-lift-3', 604800, 'One video is all it takes'],
    ]);
    expect(track).toHaveBeenCalledWith('nudges_scheduled', {});
    expect(await scheduleFirstLiftNudges(false)).toBe('skipped');
    expect(schedule).toHaveBeenCalledTimes(3);
  });

  it('quiet permission is enough: expo reports it as undetermined and not granted', async () => {
    request.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true, ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL } });
    expect(await scheduleFirstLiftNudges(false)).toBe('scheduled');
    expect(schedule).toHaveBeenCalledTimes(3);
    expect(useNudges.getState().scheduled).toBe(true);
  });

  it('a request that fails does not spend the reminders: the next launch tries again', async () => {
    request.mockRejectedValueOnce(new Error('no'));
    expect(await scheduleFirstLiftNudges(false)).toBe('refused');
    expect(useNudges.getState().scheduled).toBe(false);
    expect(await scheduleFirstLiftNudges(false)).toBe('scheduled');
  });

  it('a phone marked scheduled while nothing was ever set gets its reminders', async () => {
    const migrate = useNudges.persist.getOptions().migrate!;
    expect(await migrate({ scheduled: true, lifted: false }, 0)).toEqual({ scheduled: false, lifted: false });
    expect(await migrate({ scheduled: true, lifted: true }, 0)).toEqual({ scheduled: false, lifted: true });
  });

  it('a phone that already has a lift gets none and is never asked', async () => {
    expect(await scheduleFirstLiftNudges(true)).toBe('skipped');
    expect(request).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(useNudges.getState().lifted).toBe(true);
  });

  it('someone who turned notifications off gets none, and is not asked again', async () => {
    perms.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false });
    expect(await scheduleFirstLiftNudges(false)).toBe('refused');
    expect(request).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(await scheduleFirstLiftNudges(false)).toBe('skipped');
  });

  it('the first tracked lift cancels all three, once', async () => {
    await cancelFirstLiftNudges();
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(NUDGE_AFTER_S.map((_, i) => nudgeId(i + 1)));
    await cancelFirstLiftNudges();
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(await scheduleFirstLiftNudges(false)).toBe('skipped');
  });

  it('knows its own notifications from a lift-ready one', () => {
    expect(isNudge('catchline-first-lift-2')).toBe(true);
    expect(isNudge('catchline-nudge')).toBe(false);
    expect(isNudge(undefined)).toBe(false);
  });
});
