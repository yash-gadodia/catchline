import type { PurchasesOfferings } from 'react-native-purchases';
import { planPrice } from './copy';
import { annualSavingPct, type Period } from './entitlements';
import { offeringFor, packageIdFor, type Plan } from './products';

export type PriceFor = (plan: Plan) => string;

function storeProduct(offerings: PurchasesOfferings | null, plan: Plan) {
  return offerings?.all[offeringFor(plan)]?.availablePackages.find((p) => p.identifier === packageIdFor(plan))?.product;
}

// The store's localised price string for a plan once offerings load; the USD table before.
export function makePriceFor(offerings: PurchasesOfferings | null): PriceFor {
  return (plan) => storeProduct(offerings, plan)?.priceString ?? planPrice(plan);
}

// Pull annual against twelve months of Pull monthly, in the store's own currency.
export function annualSavingFor(offerings: PurchasesOfferings | null): number {
  const price = (period: Period) => storeProduct(offerings, { kind: 'sub', tier: 'pull', period })?.price;
  const monthly = price('monthly');
  const annual = price('annual');
  if (!monthly || !annual) return annualSavingPct('pull');
  return Math.round((1 - annual / (monthly * 12)) * 100);
}
