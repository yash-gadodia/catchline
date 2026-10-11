import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { classifyPurchaseError, planFromInfo, presentCustomerCenter, usePurchases } from './usePurchases';

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

import { loadPurchases } from './client';

const mockLoadPurchases = loadPurchases as jest.Mock;

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
    STORE_REPLACEMENT_MODE: { CHARGE_PRORATED_PRICE: 'CHARGE_PRORATED_PRICE', DEFERRED: 'DEFERRED' },
  };
}

beforeEach(() => {
  usePurchases.setState({
    ready: false,
    demo: true,
    tier: 'free',
    period: null,
    expiresAt: null,
    offerings: null,
    customerInfo: null,
    demoOutcome: 'success',
  });
  mockPlatform.OS = 'ios';
  jest.clearAllMocks();
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
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'test-ios-key' });
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
