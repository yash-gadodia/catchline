export type Tier = 'free' | 'hook' | 'pull' | 'platform' | 'founding';
export type Period = 'monthly' | 'annual';
export type StorePlatform = 'ios' | 'android';

// Free: 3 videos a calendar week (Monday start, the phone's local time), every overlay.
export const FREE_PER_WEEK = 3;

// Catchline Pro is sold as the Pull products. Hook and Platform are no longer sold;
// anyone who owns one of them, or a Founding seat, is Pro.
export function isPro(tier: Tier): boolean {
  return tier !== 'free';
}

// app/share still asks by feature name; every paid feature is Pro.
export type Feature = 'watermarkFreeExport';

export function hasFeature(tier: Tier, _feature: Feature): boolean {
  return isPro(tier);
}

// Prices in US cents. Store-localised price strings replace these once offerings load.
export const PRICE_CENTS: Record<Period, number> = { monthly: 299, annual: 1999 };
export const FOUNDING_PRICE_CENTS = 2999;
export const FOUNDING_SEATS_TOTAL = 500;

// Only for comparing the server's plan with RevenueCat's.
export const TIER_RANK: Record<Tier, number> = { free: 0, hook: 1, pull: 2, founding: 2, platform: 3 };

// RevenueCat entitlement ids. Products attach to every entitlement at or below their tier.
export const ENTITLEMENT = { hook: 'hook', pull: 'pull', platform: 'platform', founding: 'founding' } as const;

export function tierFromEntitlements(active: readonly string[]): Tier {
  const has = (id: string) => active.includes(id);
  if (has(ENTITLEMENT.platform)) return 'platform';
  if (has(ENTITLEMENT.founding)) return 'founding';
  if (has(ENTITLEMENT.pull)) return 'pull';
  if (has(ENTITLEMENT.hook)) return 'hook';
  return 'free';
}

// ── usage ────────────────────────────────────────────────────────────────────

// `thisWeek` counts the free videos tracked in the week that starts on `week`
// (that Monday's local date). `lifetime` is every video and gates nothing.
export type Usage = { lifetime: number; week: string; thisWeek: number };
export const EMPTY_USAGE: Usage = { lifetime: 0, week: '', thisWeek: 0 };

export function weekStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

export function weekKey(d: Date): string {
  const m = weekStart(d);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}

// The Monday the free videos come back.
export function nextWeekStart(now: Date): Date {
  const m = weekStart(now);
  return new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7);
}

export function usedThisWeek(usage: Usage, now: Date): number {
  return usage.week === weekKey(now) ? usage.thisWeek : 0;
}

export function freeLeft(usage: Usage, now: Date): number {
  return Math.max(0, FREE_PER_WEEK - usedThisWeek(usage, now));
}

export function canAnalyse(tier: Tier, usage: Usage, now: Date): boolean {
  return isPro(tier) || freeLeft(usage, now) > 0;
}

export function recordAnalysis(usage: Usage, tier: Tier, now: Date): Usage {
  const lifetime = usage.lifetime + 1;
  if (isPro(tier)) return { ...usage, lifetime };
  return { lifetime, week: weekKey(now), thisWeek: usedThisWeek(usage, now) + 1 };
}

// 'paywall' and 'trial' are never returned; capture's submit still names them.
export type Gate = 'ok' | 'paywall' | 'trial' | 'cap';

// What happens when the lifter submits the next clip. The clip is always saved first.
export function gateFor(tier: Tier, usage: Usage, now: Date): Gate {
  return canAnalyse(tier, usage, now) ? 'ok' : 'cap';
}

// ── money ────────────────────────────────────────────────────────────────────

export function formatUsd(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${whole ? String(cents / 100) : (cents / 100).toFixed(2)}`;
}

export function annualSavingPct(): number {
  return Math.round((1 - PRICE_CENTS.annual / (PRICE_CENTS.monthly * 12)) * 100);
}
