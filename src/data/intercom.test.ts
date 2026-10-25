jest.mock('expo-device', () => ({ modelId: 'iPhone16,1', modelName: 'iPhone 15 Pro', osName: 'iOS', osVersion: '26.1' }));
jest.mock('expo-updates', () => ({ updateId: 'ota-42' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '3.1' } } }));

type IntercomModule = typeof import('./intercom');
type Sdk = Record<'initialize' | 'loginUnidentifiedUser' | 'loginUserWithUserAttributes' | 'setUserHash' | 'updateUser' | 'logout' | 'present' | 'presentMessageComposer', jest.Mock>;

const ATTRIBUTES = { app_version: '3.1', ota_update_id: 'ota-42', device_model: 'iPhone16,1 iOS 26.1', plan_tier: 'free' };
const env = process.env;
const fetchMock = jest.fn();
global.fetch = fetchMock;

function load(keys: boolean): { intercom: IntercomModule; sdk: Sdk; invoke: jest.Mock; setUser: (userId: string | null, anonymous: boolean) => void } {
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
  const { supabase } = require('../lib/supabase') as typeof import('../lib/supabase');
  const invoke = jest.fn(() => Promise.resolve({ data: { hash: 'hash-7' }, error: null }));
  (supabase.functions as unknown as { invoke: jest.Mock }).invoke = invoke;
  return { intercom, sdk, invoke, setUser: (userId, anonymous) => useAuthUser.setState({ userId, anonymous, displayName: null }) };
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

  it('sets the identity-verification hash from intercom-hash before logging the lifter in', async () => {
    const { intercom, sdk, invoke, setUser } = load(true);
    setUser('user-7', false);
    await intercom.openIntercomMessenger();
    expect(invoke).toHaveBeenCalledWith('intercom-hash');
    expect(sdk.setUserHash).toHaveBeenCalledWith('hash-7');
    expect(sdk.setUserHash.mock.invocationCallOrder[0]).toBeLessThan(sdk.loginUserWithUserAttributes.mock.invocationCallOrder[0]);
  });

  it('never asks for a hash for an anonymous lifter', async () => {
    const { intercom, sdk, invoke, setUser } = load(true);
    setUser('anon-1', true);
    await intercom.openIntercomMessenger();
    expect(invoke).not.toHaveBeenCalled();
    expect(sdk.setUserHash).not.toHaveBeenCalled();
  });

  it('stays anonymous in Intercom when the hash call fails, and still opens without retrying', async () => {
    const { intercom, sdk, invoke, setUser } = load(true);
    invoke.mockResolvedValue({ data: null, error: new Error('not deployed') });
    setUser('user-7', false);
    expect(await intercom.openIntercomMessenger()).toBe(true);
    expect(sdk.setUserHash).not.toHaveBeenCalled();
    expect(sdk.loginUserWithUserAttributes).not.toHaveBeenCalled();
    expect(sdk.loginUnidentifiedUser).toHaveBeenCalledTimes(1);
    expect(sdk.updateUser).toHaveBeenCalledWith({ customAttributes: ATTRIBUTES });
    expect(await intercom.openIntercomMessenger()).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sdk.logout).not.toHaveBeenCalled();
  });

  it('stays anonymous when the hash call throws offline', async () => {
    const { intercom, sdk, invoke, setUser } = load(true);
    invoke.mockRejectedValue(new TypeError('Network request failed'));
    setUser('user-7', false);
    expect(await intercom.openReportInIntercom()).toBe(true);
    expect(sdk.loginUnidentifiedUser).toHaveBeenCalledTimes(1);
    expect(sdk.presentMessageComposer).toHaveBeenCalledTimes(1);
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

describe('help messages', () => {
  it('prefills a failure with the code, movement, lift and app ids', () => {
    const { intercom } = load(true);
    expect(intercom.failureHelp('no_reps', 'snatch', 'lift-9')).toBe('\n\nAnalysis failed: no_reps\nMovement: snatch\nLift lift-9\nCatchline 3.1 (ota-42)');
  });

  it('prefills Ask why with the angle and confidence of a partial result', () => {
    const { intercom } = load(true);
    const { snatchMockPartial } = require('../analysis/fixtures') as typeof import('../analysis/fixtures');
    expect(intercom.askWhyHelp({ ...snatchMockPartial, detectedMovement: { movement: 'snatch', confidence: 0.82 } })).toBe(
      '\n\nAsk why: no cue (off_side_on)\nMovement: snatch\nAngle: 34° off side-on\nConfidence: movement 82%\nLift snatch-mock-partial\nCatchline 3.1 (ota-42)'
    );
  });

  it('reads the angle of an off-angle cue from its confidence line', () => {
    const { intercom } = load(true);
    const { snatchMockLow } = require('../analysis/fixtures') as typeof import('../analysis/fixtures');
    const angled = { ...snatchMockLow, cue: { ...snatchMockLow.cue!, confidence: 'low' as const, confidenceText: 'Seen on 1 of 2 reps, filmed ~36° off side-on' } };
    expect(intercom.askWhyHelp(angled)).toBe('\n\nAsk why: cue bar_drift_knee\nMovement: snatch\nAngle: 36° off side-on\nConfidence: low\nLift snatch-mock-low\nCatchline 3.1 (ota-42)');
  });

  it('prefills a purchase problem with the plan tier and opens the composer with it', async () => {
    const { intercom, sdk, setUser } = load(true);
    setUser('anon-1', true);
    expect(intercom.purchaseHelp()).toBe('\n\nPurchase problem\nPlan: free\nCatchline 3.1 (ota-42)');
    expect(await intercom.openHelpInIntercom(intercom.purchaseHelp())).toBe(true);
    expect(sdk.presentMessageComposer).toHaveBeenCalledWith('\n\nPurchase problem\nPlan: free\nCatchline 3.1 (ota-42)');
  });
});
