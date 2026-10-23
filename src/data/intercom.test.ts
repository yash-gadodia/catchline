jest.mock('expo-device', () => ({ modelId: 'iPhone16,1', modelName: 'iPhone 15 Pro', osName: 'iOS', osVersion: '26.1' }));
jest.mock('expo-updates', () => ({ updateId: 'ota-42' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '3.1' } } }));

type IntercomModule = typeof import('./intercom');
type Sdk = Record<'initialize' | 'loginUnidentifiedUser' | 'loginUserWithUserAttributes' | 'updateUser' | 'logout' | 'present' | 'presentMessageComposer', jest.Mock>;

const ATTRIBUTES = { app_version: '3.1', ota_update_id: 'ota-42', device_model: 'iPhone16,1 iOS 26.1', plan_tier: 'free' };
const env = process.env;
const fetchMock = jest.fn();
global.fetch = fetchMock;

function load(keys: boolean): { intercom: IntercomModule; sdk: Sdk; setUser: (userId: string | null, anonymous: boolean) => void } {
  jest.resetModules();
  process.env = { ...env };
  if (keys) {
    process.env.EXPO_PUBLIC_INTERCOM_APP_ID = 'app-id';
    process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY = 'ios-key';
  } else {
    delete process.env.EXPO_PUBLIC_INTERCOM_APP_ID;
    delete process.env.EXPO_PUBLIC_INTERCOM_IOS_API_KEY;
  }
  const intercom = require('./intercom') as IntercomModule;
  const sdk = (jest.requireMock('@intercom/intercom-react-native') as { default: Sdk }).default;
  const { useAuthUser } = require('../features/auth/authUser') as typeof import('../features/auth/authUser');
  return { intercom, sdk, setUser: (userId, anonymous) => useAuthUser.setState({ userId, anonymous, displayName: null }) };
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ status: 404 });
});

afterAll(() => {
  process.env = env;
});

describe('intercom unconfigured', () => {
  it('never starts, never touches the network, and hands back to the local queue', async () => {
    const { intercom, sdk } = load(false);
    expect(intercom.intercomConfigured()).toBe(false);
    expect(await intercom.openReportInIntercom('lift-9')).toBe(false);
    expect(await intercom.openIntercomMessenger()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.presentMessageComposer).not.toHaveBeenCalled();
  });
});

describe('intercom configured', () => {
  it('opens the composer for an anonymous lifter with the version and lift prefilled', async () => {
    const { intercom, sdk, setUser } = load(true);
    setUser('anon-1', true);
    expect(intercom.intercomConfigured()).toBe(true);
    expect(await intercom.openReportInIntercom('lift-9')).toBe(true);
    expect(sdk.initialize).toHaveBeenCalledWith('ios-key', 'app-id');
    expect(sdk.loginUnidentifiedUser).toHaveBeenCalledTimes(1);
    expect(sdk.loginUserWithUserAttributes).not.toHaveBeenCalled();
    expect(sdk.updateUser).toHaveBeenCalledWith({ customAttributes: ATTRIBUTES });
    expect(sdk.presentMessageComposer).toHaveBeenCalledWith('\n\nCatchline 3.1 (ota-42)\nLift lift-9');
  });

  it('counts an SDK call that resolves without a value as opened, so the local form never stacks under it', async () => {
    const { intercom, sdk, setUser } = load(true);
    setUser('anon-1', true);
    sdk.presentMessageComposer.mockResolvedValueOnce(undefined);
    sdk.present.mockResolvedValueOnce(undefined);
    expect(await intercom.openReportInIntercom('lift-9')).toBe(true);
    expect(await intercom.openIntercomMessenger()).toBe(true);
  });

  it('logs a signed-in lifter in by their Supabase id and sends only the four attributes', async () => {
    const { intercom, sdk, setUser } = load(true);
    setUser('user-7', false);
    expect(await intercom.openIntercomMessenger()).toBe(true);
    expect(sdk.loginUserWithUserAttributes).toHaveBeenCalledWith({ userId: 'user-7', customAttributes: ATTRIBUTES });
    expect(sdk.loginUnidentifiedUser).not.toHaveBeenCalled();
    expect(sdk.present).toHaveBeenCalledTimes(1);
  });

  it('starts once and logs in once across opens, and logs out on sign-out', async () => {
    const { intercom, sdk, setUser } = load(true);
    setUser('user-7', false);
    await intercom.openIntercomMessenger();
    await intercom.openReportInIntercom();
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
    expect(sdk.loginUserWithUserAttributes).toHaveBeenCalledTimes(1);
    expect(sdk.presentMessageComposer).toHaveBeenCalledWith('\n\nCatchline 3.1 (ota-42)');

    await intercom.logoutIntercom();
    expect(sdk.logout).toHaveBeenCalledTimes(1);
    setUser('anon-2', true);
    await intercom.openIntercomMessenger();
    expect(sdk.loginUnidentifiedUser).toHaveBeenCalledTimes(1);
    expect(sdk.logout).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local queue offline without starting Intercom', async () => {
    const { intercom, sdk } = load(true);
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await intercom.openReportInIntercom('lift-9')).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('https://api-iam.intercom.io/', expect.objectContaining({ method: 'HEAD' }));
    expect(sdk.initialize).not.toHaveBeenCalled();
    expect(sdk.presentMessageComposer).not.toHaveBeenCalled();
  });

  it('falls back when Intercom fails to start', async () => {
    const { intercom, sdk } = load(true);
    sdk.initialize.mockRejectedValueOnce(new Error('bad key'));
    expect(await intercom.openReportInIntercom()).toBe(false);
    expect(sdk.presentMessageComposer).not.toHaveBeenCalled();
  });

  it('does not log out a lifter who never opened Intercom', async () => {
    const { intercom, sdk } = load(true);
    await intercom.logoutIntercom();
    expect(sdk.logout).not.toHaveBeenCalled();
  });
});
