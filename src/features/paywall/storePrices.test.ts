import type { PurchasesOfferings, PurchasesPackage } from 'react-native-purchases';
import { annualSavingFor, makePriceFor } from './storePrices';

function pkg(identifier: string, price: number, priceString: string) {
  return { identifier, product: { price, priceString } } as PurchasesPackage;
}

function offerings(packages: PurchasesPackage[]) {
  return { current: null, all: { default: { availablePackages: packages } } } as unknown as PurchasesOfferings;
}

const PULL_ANNUAL = { kind: 'sub', tier: 'pull', period: 'annual' } as const;

describe('store prices', () => {
  it('uses the localised price string once offerings load, the USD table before', () => {
    expect(makePriceFor(null)(PULL_ANNUAL)).toBe('$19.99');
    expect(makePriceFor(offerings([pkg('pull_annual', 78.98, 'S$78.98')]))(PULL_ANNUAL)).toBe('S$78.98');
  });

  it('computes the annual saving from the store prices of Pull', () => {
    const sgd = offerings([pkg('pull_monthly', 13.98, 'S$13.98'), pkg('pull_annual', 78.98, 'S$78.98')]);
    expect(annualSavingFor(sgd)).toBe(53);
  });

  it('ignores Hook and Platform packages still in the offering', () => {
    const withLegacy = offerings([
      pkg('hook_monthly', 4.99, '$4.99'),
      pkg('hook_annual', 29.99, '$29.99'),
      pkg('pull_monthly', 2.99, '$2.99'),
      pkg('pull_annual', 19.99, '$19.99'),
      pkg('platform_annual', 99.99, '$99.99'),
    ]);
    expect(annualSavingFor(withLegacy)).toBe(44);
  });

  it('falls back to the USD table without both Pull prices', () => {
    expect(annualSavingFor(null)).toBe(44);
    expect(annualSavingFor(offerings([pkg('pull_annual', 78.98, 'S$78.98')]))).toBe(44);
  });
});
