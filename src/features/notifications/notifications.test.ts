import * as Notifications from 'expo-notifications';
import { requestPermissions, registerPushToken } from './index';

jest.mock('expo-notifications');
// Stub supabase so notifyPartner tests control functions.invoke independently.
jest.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn(() => Promise.resolve({ data: null, error: null })) },
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: null } })),
      getSession: jest.fn(() => Promise.resolve({ data: { session: null } })),
    },
    from: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    })),
  },
}));
import { supabase } from '../../lib/supabase';

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

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
});
