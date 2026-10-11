import type { Period, StorePlatform, SubTier } from './entitlements';

// The purchasable plans. Mirrors docs/catchline/PRODUCTS.md; change both together.
export type Plan = { kind: 'sub'; tier: SubTier; period: Period; trial?: boolean } | { kind: 'founding' };

export const OFFERING = { default: 'default', adTrial: 'ad_trial' } as const;

export function offeringFor(plan: Plan): string {
  return plan.kind === 'sub' && plan.trial ? OFFERING.adTrial : OFFERING.default;
}

// Package identifiers inside the offering. The trial offering uses RevenueCat's standard
// $rc_annual / $rc_monthly so the hosted paywall can render it too.
export function packageIdFor(plan: Plan): string {
  if (plan.kind === 'founding') return 'founding';
  if (plan.trial) return plan.period === 'annual' ? '$rc_annual' : '$rc_monthly';
  return `${plan.tier}_${plan.period}`;
}

// App Store product ids are flat; Play subscriptions are `subscriptionId:basePlanId`.
export function productIdFor(plan: Plan, platform: StorePlatform): string {
  if (plan.kind === 'founding') return 'catchline_founding_lifetime';
  if (platform === 'ios') return `catchline_${plan.tier}_${plan.period}${plan.trial ? '_trial7' : ''}`;
  return `catchline_${plan.tier}:${plan.period}${plan.trial ? '-trial7' : ''}`;
}

// Play upgrades name the subscription id only (no base plan).
export function playSubscriptionId(tier: SubTier): string {
  return `catchline_${tier}`;
}

export function periodFromProductId(id: string): Period | null {
  if (id.includes('annual')) return 'annual';
  if (id.includes('monthly')) return 'monthly';
  return null;
}

export function planKey(plan: Plan): string {
  return plan.kind === 'founding' ? 'founding' : `${plan.tier}_${plan.period}${plan.trial ? '_trial' : ''}`;
}
