import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { CustomerInfo } from 'react-native-purchases';
import ManageSubScreen from '../manageSub';
import { purchasesAvailable } from '../../src/features/purchases/client';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../src/lib/nav', () => ({
  safeBack: jest.fn(),
}));

interface MockStore {
  isPro: boolean;
  customerInfo: CustomerInfo | null;
  setDemoPro: jest.Mock;
}

const mockStore: MockStore = {
  isPro: false,
  customerInfo: null,
  setDemoPro: jest.fn(),
};

jest.mock('../../src/features/purchases/usePurchases', () => ({
  usePurchases: jest.fn((selector: (s: MockStore) => unknown) => selector(mockStore)),
  presentCustomerCenter: jest.fn(),
}));

jest.mock('../../src/features/purchases/client', () => ({
  purchasesAvailable: jest.fn(() => false),
  ENTITLEMENT_ID: 'Parallax Pro',
}));

const mockPurchasesAvailable = purchasesAvailable as jest.Mock;

function customerInfoWith(entitlement: Record<string, unknown>): CustomerInfo {
  return {
    entitlements: { active: { 'Parallax Pro': entitlement } },
  } as unknown as CustomerInfo;
}

describe('ManageSubScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockStore.isPro = false;
    mockStore.customerInfo = null;
    mockPurchasesAvailable.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the no-active-plan state for a free user, never a fake plan card', async () => {
    const { getByText, queryByText } = await render(<ManageSubScreen />);

    expect(getByText('manage plus')).toBeTruthy();
    expect(getByText('No active plan')).toBeTruthy();
    expect(getByText('See Plus plans')).toBeTruthy();
    expect(queryByText('● active · free trial')).toBeNull();
    expect(queryByText('ANNUAL')).toBeNull();
    expect(queryByText('Jun 15, 2026')).toBeNull();
    expect(queryByText('Cancel subscription')).toBeNull();
  });

  it('routes the free-user CTA to the single paywall entry', async () => {
    const { getByText } = await render(<ManageSubScreen />);

    fireEvent.press(getByText('See Plus plans'));
    expect(mockPush).toHaveBeenCalledWith('/(sheets)/plus');
  });

  it('labels a local demo unlock as a demo, with no billing details', async () => {
    mockStore.isPro = true;

    const { getByText, queryByText } = await render(<ManageSubScreen />);

    expect(getByText('● demo unlock')).toBeTruthy();
    expect(getByText('DEMO')).toBeTruthy();
    expect(
      getByText('This is a local demo unlock, not a real subscription — nothing is billed.')
    ).toBeTruthy();
    expect(getByText('Remove demo unlock')).toBeTruthy();
    expect(queryByText('Renews')).toBeNull();
    expect(queryByText('Plan')).toBeNull();
  });

  it('removes the demo unlock when the demo user cancels', async () => {
    mockStore.isPro = true;

    const { getByText } = await render(<ManageSubScreen />);

    fireEvent.press(getByText('Remove demo unlock'));
    expect(mockStore.setDemoPro).toHaveBeenCalledWith(false);
  });

  it('shows only RevenueCat-returned fields for a real trialing entitlement', async () => {
    mockStore.isPro = true;
    mockStore.customerInfo = customerInfoWith({
      productIdentifier: 'parallax_plus_annual',
      periodType: 'TRIAL',
      expirationDate: '2026-07-15T12:00:00Z',
      willRenew: true,
    });
    mockPurchasesAvailable.mockReturnValue(true);

    const { getByText, queryByText } = await render(<ManageSubScreen />);

    expect(getByText('● active · free trial')).toBeTruthy();
    expect(getByText('Plan')).toBeTruthy();
    expect(getByText('Plus · Annual')).toBeTruthy();
    expect(getByText('Renews')).toBeTruthy();
    expect(getByText('Jul 15, 2026')).toBeTruthy();
    expect(getByText('Cancel subscription')).toBeTruthy();
    expect(getByText("You're billed once, through the App Store — never doubled across platforms.")).toBeTruthy();
    expect(queryByText('DEMO')).toBeNull();
  });

  it('shows plan name only when RevenueCat returns no expiration date', async () => {
    mockStore.isPro = true;
    mockStore.customerInfo = customerInfoWith({
      productIdentifier: 'parallax_plus_monthly',
      periodType: 'NORMAL',
      expirationDate: null,
      willRenew: false,
    });
    mockPurchasesAvailable.mockReturnValue(true);

    const { getByText, queryByText } = await render(<ManageSubScreen />);

    expect(getByText('● active')).toBeTruthy();
    expect(getByText('Plus · Monthly')).toBeTruthy();
    expect(queryByText('Renews')).toBeNull();
    expect(queryByText('Expires')).toBeNull();
  });
});
