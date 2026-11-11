import type { Period } from './entitlements';

// What the app sells: Catchline Pro (the Pull subscriptions) and the Founding seat.
// Mirrors docs/catchline/PRODUCTS.md; change both together.
//   pro monthly  package `pull_monthly`  App Store `catchline_pull_monthly`  Play `catchline_pull:monthly`
//   pro annual   package `pull_annual`   App Store `catchline_pull_annual`   Play `catchline_pull:annual`
//   founding     package `founding`      `catchline_founding_lifetime` on both stores
export type Plan = { kind: 'pro'; period: Period } | { kind: 'founding' };

export const OFFERING = 'default';

// The package identifier inside the offering; also the plan's name in analytics.
export function packageIdFor(plan: Plan): string {
  return plan.kind === 'founding' ? 'founding' : `pull_${plan.period}`;
}

export function periodFromProductId(id: string): Period | null {
  if (id.includes('annual')) return 'annual';
  if (id.includes('monthly')) return 'monthly';
  return null;
}
