import * as Notifications from 'expo-notifications';
import { liveAnalysis } from '../../analysis/live';
import { snatchMock } from '../../analysis/fixtures';
import { AppState } from 'react-native';
import { foregroundBehavior, installForegroundHandler, liftIdFromResponse, notifyLiftReady, requestPermissions, registerPushToken, routeForLift } from './index';

jest.mock('expo-notifications');
const mockProfileEq = jest.fn(() => Promise.resolve({ data: null, error: null }));
const mockProfileUpdate = jest.fn(() => ({ eq: mockProfileEq }));
// Stub supabase so push-token tests control the profile write.
jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn(() => Promise.resolve({ data: null, error: null })) },
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: null } })),
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
    },
    from: jest.fn(() => ({ update: mockProfileUpdate })),
  },
}));
jest.mock('../../lib/api', () => ({ getLift: jest.fn(), getAnalysis: jest.fn() }));
jest.mock('../../data/library', () => ({ syncLibrary: jest.fn(() => Promise.resolve()) }));
jest.mock('../../data/localLifts', () => ({ readLocalAnalysis: jest.fn(async () => null) }));
import { readLocalAnalysis } from '../../data/localLifts';
import { supabase } from '../../lib/supabase';
import * as api from '../../lib/api';
import { syncLibrary } from '../../data/library';

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requestPermissions', () => {
  it('returns true when permission is already granted', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      expires: 'never',
      granted: true,
      canAskAgain: true,
      ios: undefined,
    } as any);

    const result = await requestPermissions();
    expect(result).toBe(true);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permissions when not yet granted and returns true on grant', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
      expires: 'never',
      granted: false,
      canAskAgain: true,
    } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'granted',
      expires: 'never',
      granted: true,
      canAskAgain: false,
    } as any);

    const result = await requestPermissions();
    expect(result).toBe(true);
  });

  it('returns false when permission is denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'denied',
      expires: 'never',
      granted: false,
      canAskAgain: false,
    } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
      expires: 'never',
      granted: false,
      canAskAgain: false,
    } as any);

    const result = await requestPermissions();
    expect(result).toBe(false);
  });

  it('returns false when the module throws', async () => {
    mockNotifications.getPermissionsAsync.mockRejectedValue(new Error('unavailable'));

    const result = await requestPermissions();
    expect(result).toBe(false);
  });
});

describe('registerPushToken', () => {
  it('does not mint a token when permission is not granted', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as never);
    await registerPushToken();
    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(0);
  });

  it('writes the minted token to the signed-in profile', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted', granted: true, canAskAgain: false, expires: 'never' } as never);
    mockNotifications.getExpoPushTokenAsync.mockResolvedValueOnce({ data: 'ExponentPushToken[abc]', type: 'expo' });
    (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({ data: { user: { id: 'user-1' } } });

    await registerPushToken(true);

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(mockProfileUpdate).toHaveBeenCalledWith({ push_token: 'ExponentPushToken[abc]' });
    expect(mockProfileEq).toHaveBeenCalledWith('id', 'user-1');
  });
});

describe('liftIdFromResponse', () => {
  const response = (data: Record<string, unknown>) =>
    ({ notification: { request: { content: { data } } } }) as unknown as Notifications.NotificationResponse;

  it('reads the lift id the worker put in the payload', () => {
    expect(liftIdFromResponse(response({ liftId: 'lift-1' }))).toBe('lift-1');
  });

  it('is null for any other notification', () => {
    expect(liftIdFromResponse(response({}))).toBeNull();
    expect(liftIdFromResponse(response({ liftId: 7 }))).toBeNull();
  });
});

describe('routeForLift', () => {
  const lift = (status: string) => ({ id: 'lift-1', status, movement: 'snatch' });

  it('loads the analysis into the live map and opens the reveal', async () => {
    mockApi.getLift.mockResolvedValueOnce(lift('done') as never);
    mockApi.getAnalysis.mockResolvedValueOnce(snatchMock);

    await expect(routeForLift('lift-1')).resolves.toEqual({ pathname: '/analysis/reveal', params: { fixture: snatchMock.id } });
    expect(liveAnalysis(snatchMock.id)).toBe(snatchMock);
    expect(syncLibrary).toHaveBeenCalledTimes(1);
  });

  it('opens the failure screen for a failed lift', async () => {
    mockApi.getLift.mockResolvedValueOnce(lift('failed') as never);

    await expect(routeForLift('lift-1')).resolves.toEqual({ pathname: '/failure/[id]', params: { id: 'lift-1' } });
    expect(mockApi.getAnalysis).not.toHaveBeenCalled();
  });

  it('opens the failure screen when the analysis itself failed', async () => {
    mockApi.getLift.mockResolvedValueOnce(lift('done') as never);
    mockApi.getAnalysis.mockResolvedValueOnce({ ...snatchMock, failure: { reason: 'no_barbell' } } as never);

    await expect(routeForLift('lift-1')).resolves.toEqual({ pathname: '/failure/[id]', params: { id: 'lift-1' } });
  });

  it('routes nowhere when the lift is unknown or has no analysis yet', async () => {
    mockApi.getLift.mockResolvedValueOnce(null);
    await expect(routeForLift('lift-1')).resolves.toBeNull();

    mockApi.getLift.mockResolvedValueOnce(lift('processing') as never);
    mockApi.getAnalysis.mockResolvedValueOnce(null);
    await expect(routeForLift('lift-1')).resolves.toBeNull();
  });
});

// A push that arrives while Catchline is open was dropped by iOS: no handler was set.
describe('routeForLift for a lift analysed on the phone', () => {
  const mockLocal = readLocalAnalysis as jest.Mock;

  it('opens the reveal from Documents without asking the server', async () => {
    mockLocal.mockResolvedValueOnce({ ...snatchMock, id: 'lift-local' });
    const href = await routeForLift('lift-local');
    expect(href).toEqual({ pathname: '/analysis/reveal', params: { fixture: 'lift-local' } });
    expect(liveAnalysis('lift-local')?.id).toBe('lift-local');
    expect(mockApi.getLift).not.toHaveBeenCalled();
  });

  it('opens the failure screen with the stored reason when that lift failed', async () => {
    mockLocal.mockResolvedValueOnce({ ...snatchMock, id: 'lift-local', failure: { reason: 'no_reps', code: 'no_reps' } });
    expect(await routeForLift('lift-local')).toEqual({ pathname: '/failure/[id]', params: { id: 'lift-local', reason: 'no_reps' } });
  });
});

describe('notifyLiftReady', () => {
  const appState = AppState as unknown as { currentState: string };
  const granted = { status: 'granted', expires: 'never', granted: true, canAskAgain: false } as any;

  it('posts the ready notification with the lift id when the app is away and notifications are allowed', async () => {
    appState.currentState = 'background';
    mockNotifications.getPermissionsAsync.mockResolvedValue(granted);
    expect(await notifyLiftReady('lift-1', 'clean', false)).toBe(true);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'Your Clean is ready', body: 'Tap to see your cue.', data: { liftId: 'lift-1' } },
      trigger: null,
    });
  });

  it('names a failed lift as one we could not read', async () => {
    appState.currentState = 'inactive';
    mockNotifications.getPermissionsAsync.mockResolvedValue(granted);
    await notifyLiftReady('lift-1', 'snatch', true);
    expect(mockNotifications.scheduleNotificationAsync.mock.calls[0][0].content.title).toBe("We couldn't read your Snatch");
  });

  it('posts nothing when the app is in front, or when notifications are not allowed', async () => {
    appState.currentState = 'active';
    expect(await notifyLiftReady('lift-1', 'snatch', false)).toBe(false);
    expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    appState.currentState = 'background';
    mockNotifications.getPermissionsAsync.mockResolvedValue({ ...granted, status: 'undetermined' });
    expect(await notifyLiftReady('lift-1', 'snatch', false)).toBe(false);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('foreground pushes', () => {
  it('always show a banner and list entry with sound, never a badge', () => {
    expect(foregroundBehavior()).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
  });

  it('installs the handler that answers every Catchline push the same way', async () => {
    installForegroundHandler();
    expect(Notifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
    const push = { request: { content: { data: { liftId: 'lift-1' } } } } as unknown as Notifications.Notification;
    expect(await handler.handleNotification(push)).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});
