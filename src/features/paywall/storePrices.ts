import type { PurchasesOfferings } from 'react-native-purchases';
import { planPrice } from './copy';
import { offeringFor, packageIdFor, type Plan } from './products';

export type PriceFor = (plan: Plan) => string;

// The store's localised price string for a plan once offerings load; the USD table before.
export function makePriceFor(offerings: PurchasesOfferings | null): PriceFor {
  return (plan) => {
    const pkg = offerings?.all[offeringFor(plan)]?.availablePackages.find((p) => p.identifier === packageIdFor(plan));
    return pkg?.product.priceString ?? planPrice(plan);
  };
}
