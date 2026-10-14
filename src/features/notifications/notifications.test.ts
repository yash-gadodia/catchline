import * as Notifications from 'expo-notifications';
import { liveAnalysis } from '../../analysis/live';
import { snatchMock } from '../../analysis/fixtures';
import { liftIdFromResponse, requestPermissions, registerPushToken, routeForLift } from './index';

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
