import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import {
  classifyPurchaseError,
  isAlreadyPurchased,
  planFromInfo,
  presentCustomerCenter,
  reconcileServerPlan,
  settleServerPlan,
  usePurchases,
  waitForServerPlan,
} from './usePurchases';

jest.mock('./client', () => ({
  loadPurchases: jest.fn(),
  RC_IOS_KEY: 'test-ios-key',
  RC_ANDROID_KEY: 'test-android-key',
}));

const mockPlatform = { OS: 'ios' };
jest.mock('react-native', () => ({
  get Platform() {
    return mockPlatform;
  },
}));

jest.mock('../../data/backend', () => ({ backendEnabled: jest.fn(() => false) }));
jest.mock('../../lib/api', () => ({ ensureSession: jest.fn(), getAllowance: jest.fn(), syncPlan: jest.fn() }));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), onAuthStateChange: jest.fn() } },
}));

import { loadPurchases } from './client';
import { backendEnabled } from '../../data/backend';
import { ensureSession, getAllowance, syncPlan } from '../../lib/api';
import { supabase } from '../../lib/supabase';

const mockLoadPurchases = loadPurchases as jest.Mock;
const mockBackendEnabled = backendEnabled as jest.Mock;
const mockEnsureSession = ensureSession as jest.Mock;
const mockGetAllowance = getAllowance as jest.Mock;
const mockSyncPlan = syncPlan as jest.Mock;
const flush = () => new Promise((r) => setImmediate(r));
const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;

function info(entitlements: Record<string, { productIdentifier: string; expirationDate: string | null }>) {
  return { entitlements: { active: entitlements } } as unknown as CustomerInfo;
}

const PULL_ANNUAL = info({
  hook: { productIdentifier: 'catchline_pull_annual', expirationDate: '2027-10-11T00:00:00Z' },
  pull: { productIdentifier: 'catchline_pull_annual', expirationDate: '2027-10-11T00:00:00Z' },
});

function pkg(identifier: string) {
  return { identifier } as PurchasesPackage;
}

function offerings() {
  return {
    current: null,
    all: {
      default: { availablePackages: [pkg('hook_annual'), pkg('pull_annual'), pkg('pull_monthly'), pkg('founding')] },
      ad_trial: { availablePackages: [pkg('$rc_annual'), pkg('$rc_monthly')] },
    },
  };
}

function sdk() {
  return {
    configure: jest.fn(),
    setLogHandler: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(() => Promise.resolve(offerings())),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    logIn: jest.fn(),
    STORE_REPLACEMENT_MODE: { CHARGE_PRORATED_PRICE: 'CHARGE_PRORATED_PRICE', DEFERRED: 'DEFERRED' },
  };
}

beforeEach(() => {
  usePurchases.setState({
    ready: false,
    demo: true,
    appUserId: null,
    tier: 'free',
    period: null,
    expiresAt: null,
    offerings: null,
    customerInfo: null,
    demoOutcome: 'success',
  });
  mockPlatform.OS = 'ios';
  jest.clearAllMocks();
  mockBackendEnabled.mockReturnValue(false);
});

describe('planFromInfo', () => {
  it('reads the top tier, its period and expiry', () => {
    expect(planFromInfo(PULL_ANNUAL)).toEqual({ tier: 'pull', period: 'annual', expiresAt: '2027-10-11T00:00:00Z' });
  });

  it('reads a founding seat as founding with no period', () => {
    const founding = info({
      pull: { productIdentifier: 'catchline_founding_lifetime', expirationDate: null },
      founding: { productIdentifier: 'catchline_founding_lifetime', expirationDate: null },
    });
    expect(planFromInfo(founding)).toEqual({ tier: 'founding', period: null, expiresAt: null });
  });

  it('is free with no entitlements or no info', () => {
    expect(planFromInfo(info({}))).toEqual({ tier: 'free', period: null, expiresAt: null });
    expect(planFromInfo(null)).toEqual({ tier: 'free', period: null, expiresAt: null });
  });
});

describe('classifyPurchaseError', () => {
  it('maps RevenueCat errors to paywall states', () => {
    expect(classifyPurchaseError({ userCancelled: true })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '1' })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '10' })).toBe('offline');
    expect(classifyPurchaseError({ code: '35' })).toBe('offline');
    expect(classifyPurchaseError({ code: '2' })).toBe('failed');
    expect(classifyPurchaseError(new Error('boom'))).toBe('failed');
    expect(classifyPurchaseError(undefined)).toBe('failed');
  });

  it('spots a product the Apple ID already holds', () => {
    expect(isAlreadyPurchased({ code: '6', message: 'This product is already active for the user.' })).toBe(true);
    expect(isAlreadyPurchased(new Error('You are already subscribed to this product'))).toBe(true);
    expect(isAlreadyPurchased({ code: '1' })).toBe(false);
    expect(isAlreadyPurchased(undefined)).toBe(false);
  });
});

describe('demo mode (no SDK)', () => {
  beforeEach(() => mockLoadPurchases.mockReturnValue({ Purchases: null, RevenueCatUI: null }));

  it('configure marks ready and demo', async () => {
    await usePurchases.getState().configure();
    expect(usePurchases.getState().ready).toBe(true);
    expect(usePurchases.getState().demo).toBe(true);
    expect(usePurchases.getState().tier).toBe('free');
  });

  it('a successful demo purchase unlocks the plan locally', async () => {
    const status = await usePurchases.getState().purchase({ kind: 'sub', tier: 'pull', period: 'annual' });
    expect(status).toBe('success');
    expect(usePurchases.getState().tier).toBe('pull');
    expect(usePurchases.getState().period).toBe('annual');
  });

  it('a founding demo purchase sets founding', async () => {
    await usePurchases.getState().purchase({ kind: 'founding' });
    expect(usePurchases.getState().tier).toBe('founding');
    expect(usePurchases.getState().period).toBeNull();
  });

  it('a failing demo outcome leaves the tier alone', async () => {
    usePurchases.getState().setDemoOutcome('offline');
    const status = await usePurchases.getState().purchase({ kind: 'sub', tier: 'hook', period: 'monthly' });
    expect(status).toBe('offline');
    expect(usePurchases.getState().tier).toBe('free');
  });

  it('restore returns the current tier', async () => {
    usePurchases.getState().setDemoPlan('hook', 'annual');
    expect(await usePurchases.getState().restore()).toBe('hook');
  });

  it('customer center is unavailable', async () => {
    expect(await presentCustomerCenter()).toBe(false);
  });
});

describe('with the SDK', () => {
  it('configure sets the plan and offerings from RevenueCat', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockResolvedValue(PULL_ANNUAL);
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test-ios-key', appUserID: null });
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
    const s = usePurchases.getState();
    expect(s.ready).toBe(true);
    expect(s.demo).toBe(false);
    expect(s.tier).toBe('pull');
    expect(s.offerings).toEqual(offerings());
  });

  it('configure survives an SDK failure', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockRejectedValue(new Error('SDK error'));
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    expect(usePurchases.getState().ready).toBe(true);
    expect(usePurchases.getState().tier).toBe('free');
  });

  it('does not reconfigure once ready', async () => {
    const Purchases = sdk();
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ ready: true });
    await usePurchases.getState().configure();
    expect(Purchases.configure).not.toHaveBeenCalled();
  });

  it('the customer-info listener updates the plan', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockResolvedValue(info({}));
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    const listener = Purchases.addCustomerInfoUpdateListener.mock.calls[0][0] as (i: CustomerInfo) => void;
    listener(PULL_ANNUAL);
    expect(usePurchases.getState().tier).toBe('pull');
  });

  it('buys the package for the plan from the default offering', async () => {
    const Purchases = sdk();
    Purchases.purchasePackage.mockResolvedValue({ customerInfo: PULL_ANNUAL });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    const status = await usePurchases.getState().purchase({ kind: 'sub', tier: 'pull', period: 'annual' });
    expect(status).toBe('success');
    expect(Purchases.purchasePackage).toHaveBeenCalledWith(pkg('pull_annual'), null, null);
    expect(usePurchases.getState().tier).toBe('pull');
  });

  it('buys the trial package from the ad_trial offering', async () => {
    const Purchases = sdk();
    Purchases.purchasePackage.mockResolvedValue({ customerInfo: PULL_ANNUAL });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().purchase({ kind: 'sub', tier: 'pull', period: 'annual', trial: true });
    expect(Purchases.purchasePackage).toHaveBeenCalledWith(pkg('$rc_annual'), null, null);
  });

  it('fails when the offering has no such package', async () => {
    const Purchases = sdk();
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    const status = await usePurchases.getState().purchase({ kind: 'sub', tier: 'platform', period: 'annual' });
    expect(status).toBe('failed');
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  });

  it('returns cancelled and offline from SDK errors', async () => {
    const Purchases = sdk();
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    Purchases.purchasePackage.mockRejectedValueOnce({ userCancelled: true, code: '1' });
    expect(await usePurchases.getState().purchase({ kind: 'founding' })).toBe('cancelled');
    Purchases.purchasePackage.mockRejectedValueOnce({ code: '35' });
    expect(await usePurchases.getState().purchase({ kind: 'founding' })).toBe('offline');
    expect(usePurchases.getState().tier).toBe('free');
  });

  it('on Play, an upgrade charges the prorated price against the old subscription', async () => {
    mockPlatform.OS = 'android';
    const Purchases = sdk();
    Purchases.purchasePackage.mockResolvedValue({ customerInfo: PULL_ANNUAL });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ tier: 'hook', period: 'annual' });
    await usePurchases.getState().purchase({ kind: 'sub', tier: 'pull', period: 'annual' });
    expect(Purchases.purchasePackage).toHaveBeenCalledWith(pkg('pull_annual'), null, {
      oldProductIdentifier: 'catchline_hook',
      replacementMode: 'CHARGE_PRORATED_PRICE',
    });
  });

  it('restore reads the restored plan', async () => {
    const Purchases = sdk();
    Purchases.restorePurchases.mockResolvedValue(PULL_ANNUAL);
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    expect(await usePurchases.getState().restore()).toBe('pull');
  });

  it('a failed restore keeps the current tier', async () => {
    const Purchases = sdk();
    Purchases.restorePurchases.mockRejectedValue(new Error('Restore failed'));
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ tier: 'hook' });
    expect(await usePurchases.getState().restore()).toBe('hook');
  });

  it('presents the customer center and refreshes', async () => {
    const Purchases = sdk();
    Purchases.restorePurchases.mockResolvedValue(PULL_ANNUAL);
    const RevenueCatUI = { presentCustomerCenter: jest.fn(() => Promise.resolve()) };
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI });
    expect(await presentCustomerCenter()).toBe(true);
    expect(RevenueCatUI.presentCustomerCenter).toHaveBeenCalledTimes(1);
    expect(usePurchases.getState().tier).toBe('pull');
  });
});

describe('with the SDK and the backend on', () => {
  const UID = '4541fa15-7a51-4cf5-9402-ea669eb6b51f';
  const session = (id: string) => ({ data: { session: { user: { id } } } });

  beforeEach(() => mockBackendEnabled.mockReturnValue(true));

  it('configures RevenueCat with the Supabase user id when a session exists', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockResolvedValue(info({}));
    mockGetSession.mockResolvedValue(session(UID));
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test-ios-key', appUserID: UID });
    expect(usePurchases.getState().appUserId).toBe(UID);
    const onAuth = mockOnAuthStateChange.mock.calls[0][0] as (e: string, s: unknown) => void;
    onAuth('INITIAL_SESSION', session(UID).data.session);
    expect(Purchases.logIn).not.toHaveBeenCalled();
  });

  it('starts anonymous, then logs in when the session appears', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockResolvedValue(info({}));
    Purchases.logIn.mockResolvedValue({ customerInfo: PULL_ANNUAL, created: false });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test-ios-key', appUserID: null });
    const onAuth = mockOnAuthStateChange.mock.calls[0][0] as (e: string, s: unknown) => void;
    onAuth('SIGNED_IN', session(UID).data.session);
    await Promise.resolve();
    await Promise.resolve();
    expect(Purchases.logIn).toHaveBeenCalledWith(UID);
    expect(usePurchases.getState().appUserId).toBe(UID);
    expect(usePurchases.getState().tier).toBe('pull');
  });

  it('identifies before buying, then waits for the server plan', async () => {
    const Purchases = sdk();
    const order: string[] = [];
    Purchases.logIn.mockImplementation(async () => {
      order.push('logIn');
      return { customerInfo: info({}), created: true };
    });
    Purchases.purchasePackage.mockImplementation(async () => {
      order.push('purchase');
      return { customerInfo: PULL_ANNUAL };
    });
    mockEnsureSession.mockResolvedValue(UID);
    mockGetAllowance.mockResolvedValue({ plan: 'pull' });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ ready: true, demo: false });
    const status = await usePurchases.getState().purchase({ kind: 'sub', tier: 'pull', period: 'annual' });
    expect(status).toBe('success');
    expect(order).toEqual(['logIn', 'purchase']);
    expect(Purchases.logIn).toHaveBeenCalledWith(UID);
    expect(mockGetAllowance).toHaveBeenCalledTimes(1);
    expect(usePurchases.getState().tier).toBe('pull');
  });

  it('does not buy when no Supabase session can be made', async () => {
    const Purchases = sdk();
    mockEnsureSession.mockRejectedValue(new Error('not_authenticated'));
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    const status = await usePurchases.getState().purchase({ kind: 'founding' });
    expect(status).toBe('failed');
    expect(Purchases.purchasePackage).not.toHaveBeenCalled();
  });

  it('on launch, RevenueCat above the server plan triggers a sync', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockResolvedValue(PULL_ANNUAL);
    mockGetSession.mockResolvedValue(session(UID));
    mockGetAllowance.mockResolvedValue({ plan: 'free' });
    mockSyncPlan.mockResolvedValue({ plan: 'pull', founding: false, result: 'applied' });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    await flush();
    expect(mockGetAllowance).toHaveBeenCalledTimes(1);
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
  });

  it('on launch, a server plan already at the tier is left alone', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockResolvedValue(PULL_ANNUAL);
    mockGetSession.mockResolvedValue(session(UID));
    mockGetAllowance.mockResolvedValue({ plan: 'founding' });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    await flush();
    expect(mockSyncPlan).not.toHaveBeenCalled();
  });

  it('on launch, a free RevenueCat tier or no session never asks the server', async () => {
    const Purchases = sdk();
    Purchases.getCustomerInfo.mockResolvedValue(PULL_ANNUAL);
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    await usePurchases.getState().configure();
    await flush();
    expect(mockGetAllowance).not.toHaveBeenCalled();
    await reconcileServerPlan('free');
    expect(mockGetAllowance).not.toHaveBeenCalled();
  });

  it('a purchase the Apple ID already holds becomes a restore', async () => {
    const Purchases = sdk();
    Purchases.purchasePackage.mockRejectedValueOnce({ code: '6', message: 'This product is already active for the user.' });
    Purchases.restorePurchases.mockResolvedValue(PULL_ANNUAL);
    mockEnsureSession.mockResolvedValue(UID);
    mockGetAllowance.mockResolvedValue({ plan: 'pull' });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ appUserId: UID });
    const status = await usePurchases.getState().purchase({ kind: 'sub', tier: 'pull', period: 'annual' });
    expect(status).toBe('success');
    expect(Purchases.restorePurchases).toHaveBeenCalledTimes(1);
    expect(usePurchases.getState().tier).toBe('pull');
  });

  it('an already-held product that restores nothing fails', async () => {
    const Purchases = sdk();
    Purchases.purchasePackage.mockRejectedValueOnce({ code: '6' });
    Purchases.restorePurchases.mockResolvedValue(info({}));
    mockEnsureSession.mockResolvedValue(UID);
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ appUserId: UID });
    expect(await usePurchases.getState().purchase({ kind: 'sub', tier: 'pull', period: 'annual' })).toBe('failed');
    expect(mockGetAllowance).not.toHaveBeenCalled();
  });

  it('skips logIn when already identified as that user', async () => {
    const Purchases = sdk();
    Purchases.restorePurchases.mockResolvedValue(PULL_ANNUAL);
    mockEnsureSession.mockResolvedValue(UID);
    mockGetAllowance.mockResolvedValue({ plan: 'pull' });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ appUserId: UID });
    expect(await usePurchases.getState().restore()).toBe('pull');
    expect(Purchases.logIn).not.toHaveBeenCalled();
    expect(mockGetAllowance).toHaveBeenCalledTimes(1);
  });
});

describe('waitForServerPlan', () => {
  it('polls until the server plan reaches the tier', async () => {
    mockGetAllowance
      .mockResolvedValueOnce({ plan: 'free' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ plan: 'pull' });
    expect(await waitForServerPlan('pull', 5, 0)).toBe(true);
    expect(mockGetAllowance).toHaveBeenCalledTimes(3);
  });

  it('counts founding as reaching pull', async () => {
    mockGetAllowance.mockResolvedValue({ plan: 'founding' });
    expect(await waitForServerPlan('pull', 5, 0)).toBe(true);
    expect(mockGetAllowance).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last try', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockGetAllowance.mockResolvedValue({ plan: 'free' });
    expect(await waitForServerPlan('platform', 3, 0)).toBe(false);
    expect(mockGetAllowance).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith('[RevenueCat] server plan has not reached platform yet');
    log.mockRestore();
  });
});

describe('settleServerPlan', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it('is done once the webhook has landed, without a sync', async () => {
    mockGetAllowance.mockResolvedValue({ plan: 'pull' });
    expect(await settleServerPlan('pull', 3, 0)).toBe(true);
    expect(mockSyncPlan).not.toHaveBeenCalled();
  });

  it('syncs from RevenueCat when the webhook never arrives', async () => {
    mockGetAllowance.mockResolvedValue({ plan: 'free' });
    mockSyncPlan.mockResolvedValue({ plan: 'pull', founding: false, result: 'applied' });
    expect(await settleServerPlan('pull', 2, 0)).toBe(true);
    expect(mockGetAllowance).toHaveBeenCalledTimes(2);
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
  });

  it('is false when the sync fails or still ranks below the tier', async () => {
    mockGetAllowance.mockResolvedValue({ plan: 'free' });
    mockSyncPlan.mockRejectedValueOnce(new Error('offline'));
    expect(await settleServerPlan('pull', 1, 0)).toBe(false);
    mockSyncPlan.mockResolvedValueOnce({ plan: 'hook', founding: false, result: 'applied' });
    expect(await settleServerPlan('pull', 1, 0)).toBe(false);
  });

  it('restore syncs when the TRANSFER webhook is slow', async () => {
    const Purchases = sdk();
    Purchases.restorePurchases.mockResolvedValue(PULL_ANNUAL);
    mockBackendEnabled.mockReturnValue(true);
    mockEnsureSession.mockResolvedValue('4541fa15-7a51-4cf5-9402-ea669eb6b51f');
    mockGetAllowance.mockResolvedValue({ plan: 'free' });
    mockSyncPlan.mockResolvedValue({ plan: 'pull', founding: false, result: 'applied' });
    mockLoadPurchases.mockReturnValue({ Purchases, RevenueCatUI: null });
    usePurchases.setState({ appUserId: '4541fa15-7a51-4cf5-9402-ea669eb6b51f' });
    expect(await usePurchases.getState().restore()).toBe('pull');
    expect(mockGetAllowance).toHaveBeenCalledTimes(8);
    expect(mockSyncPlan).toHaveBeenCalledTimes(1);
  }, 20000);
});
