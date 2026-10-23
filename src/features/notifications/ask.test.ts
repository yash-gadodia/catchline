import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { askForPush, maybeReaskForPush, noteAnalysisFinished, pushStatus, usePushAsk } from './ask';
import { registerPushToken } from './index';

jest.mock('./index', () => ({ registerPushToken: jest.fn(async () => undefined) }));

const perms = Notifications.getPermissionsAsync as jest.Mock;
const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
const allowed = () => perms.mockResolvedValue({ status: 'granted', canAskAgain: true });
const unasked = () => perms.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
const refused = () => perms.mockResolvedValue({ status: 'denied', canAskAgain: false });

beforeEach(() => {
  jest.clearAllMocks();
  usePushAsk.setState({ onboarded: false, reasked: false });
});

describe('push ask', () => {
  it('reads granted, askable and refused from the OS', async () => {
    allowed();
    expect(await pushStatus()).toBe('granted');
    unasked();
    expect(await pushStatus()).toBe('undetermined');
    refused();
    expect(await pushStatus()).toBe('denied');
  });

  it('uses the system prompt while iOS still allows it, Settings after', async () => {
    unasked();
    await askForPush();
    expect(registerPushToken).toHaveBeenCalledWith(true);
    expect(openSettings).not.toHaveBeenCalled();
    refused();
    expect(await askForPush()).toBe('denied');
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('re-asks once after the first finished analysis, with a Settings link when refused', async () => {
    refused();
    const alert = jest.fn();
    expect(await maybeReaskForPush(alert)).toBe(false);
    noteAnalysisFinished();
    expect(await maybeReaskForPush(alert)).toBe(true);
    expect(alert.mock.calls[0][0]).toBe('Get a nudge to retest your cue?');
    expect(alert.mock.calls[0][2].map((b: { text: string }) => b.text)).toEqual(['Not now', 'Open Settings']);
    alert.mock.calls[0][2][1].onPress();
    noteAnalysisFinished();
    expect(await maybeReaskForPush(alert)).toBe(false);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(usePushAsk.getState().reasked).toBe(true);
  });

  it('offers the system prompt on the re-ask if it was never shown', async () => {
    unasked();
    const alert = jest.fn();
    noteAnalysisFinished();
    await maybeReaskForPush(alert);
    expect(alert.mock.calls[0][2][1].text).toBe('Turn on notifications');
  });

  it('never re-asks someone who already allowed notifications', async () => {
    allowed();
    const alert = jest.fn();
    noteAnalysisFinished();
    expect(await maybeReaskForPush(alert)).toBe(false);
    expect(alert).not.toHaveBeenCalled();
    expect(usePushAsk.getState().reasked).toBe(false);
  });
});
