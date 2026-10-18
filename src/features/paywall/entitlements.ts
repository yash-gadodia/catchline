import { t } from '../../i18n';

export type Tier = 'free' | 'hook' | 'pull' | 'platform' | 'founding';
export type PaidTier = Exclude<Tier, 'free'>;
export type SubTier = 'hook' | 'pull' | 'platform';
export type Period = 'monthly' | 'annual';
export type Variant = 'organic' | 'ad';

export const TIER_NAME: Record<Tier, string> = {
  free: 'Free',
  hook: 'Hook',
  pull: 'Pull',
  platform: 'Platform',
  founding: 'Founding member',
};

// Hook, Pull and Platform are product names and stay as they are in every language.
export function tierName(tier: Tier): string {
  if (tier === 'free') return t('paywall.tier.free');
  if (tier === 'founding') return t('paywall.tier.founding');
  return TIER_NAME[tier];
}

// The organic app gives 3 videos for life; the ad funnel gives one, then the trial paywall.
export const FREE_VIDEOS: Record<Variant, number> = { organic: 3, ad: 1 };
// Paid plans are unlimited; FAIR_USE is only an abuse guard, matched by plan_cap on the server.
export const FAIR_USE = 1000;
export const MONTHLY_CAP: Record<PaidTier, number> = { hook: 12, pull: FAIR_USE, platform: FAIR_USE, founding: FAIR_USE };

// Prices in US cents. Store-localised price strings replace these once offerings load.
export const PRICE_CENTS: Record<SubTier, Record<Period, number>> = {
  hook: { monthly: 499, annual: 2999 },
  pull: { monthly: 299, annual: 1999 },
  platform: { monthly: 1499, annual: 9999 },
};
export const FOUNDING_PRICE_CENTS = 2999;
export const FOUNDING_SEATS_TOTAL = 500;
export const TRIAL_DAYS = 7;

export type Feature =
  | 'cueMemoryFull'
  | 'ghostCompare'
  | 'didItStick'
  | 'fps240'
  | 'watermarkFreeExport'
  | 'coachLink'
  | 'explainer'
  | 'csvExport'
  | 'priorityQueue';

const PULL_FEATURES: readonly Feature[] = ['cueMemoryFull', 'ghostCompare', 'didItStick', 'fps240', 'watermarkFreeExport'];

const FEATURES: Record<Tier, readonly Feature[]> = {
  free: [],
  hook: [],
  pull: PULL_FEATURES,
  founding: PULL_FEATURES,
  platform: [...PULL_FEATURES, 'coachLink', 'explainer', 'csvExport', 'priorityQueue'],
};

export function featuresFor(tier: Tier): readonly Feature[] {
  return FEATURES[tier];
}

export function hasFeature(tier: Tier, feature: Feature): boolean {
  return FEATURES[tier].includes(feature);
}

// Days of cue memory: 0 = none, 'all' = full history.
export function cueMemoryDays(tier: Tier): number | 'all' {
  if (hasFeature(tier, 'cueMemoryFull')) return 'all';
  return tier === 'hook' ? 90 : 0;
}

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

// `thisMonth` counts analyses made on a paid plan in calendar month `month`, so the
// free videos never eat into a new subscriber's first month.
export type Usage = { lifetime: number; month: string; thisMonth: number };
export const EMPTY_USAGE: Usage = { lifetime: 0, month: '', thisMonth: 0 };

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function usedThisMonth(usage: Usage, now: Date): number {
  return usage.month === monthKey(now) ? usage.thisMonth : 0;
}

export function videosRemaining(tier: Tier, usage: Usage, now: Date, variant: Variant = 'organic'): number {
  if (tier === 'free') return Math.max(0, FREE_VIDEOS[variant] - usage.lifetime);
  return Math.max(0, MONTHLY_CAP[tier] - usedThisMonth(usage, now));
}

export function canAnalyse(tier: Tier, usage: Usage, now: Date, variant: Variant = 'organic'): boolean {
  return videosRemaining(tier, usage, now, variant) > 0;
}

export function recordAnalysis(usage: Usage, tier: Tier, now: Date): Usage {
  const lifetime = usage.lifetime + 1;
  if (tier === 'free') return { ...usage, lifetime };
  const month = monthKey(now);
  return { lifetime, month, thisMonth: usedThisMonth(usage, now) + 1 };
}

export type Gate = 'ok' | 'paywall' | 'trial' | 'cap';

// What happens when the lifter submits the next clip. The clip is always saved first.
export function gateFor(tier: Tier, usage: Usage, now: Date, variant: Variant = 'organic'): Gate {
  if (canAnalyse(tier, usage, now, variant)) return 'ok';
  if (tier !== 'free') return 'cap';
  return variant === 'ad' ? 'trial' : 'paywall';
}

// Organic free tier, one video left and not yet warned for it: say so before
// the lifter films, so the paywall at video 4 is never a surprise.
export function lastFreeDue(tier: Tier, usage: Usage, variant: Variant, warnedAt: number | null): boolean {
  if (tier !== 'free' || variant !== 'organic') return false;
  return FREE_VIDEOS.organic - usage.lifetime === 1 && warnedAt !== usage.lifetime;
}

// The ad funnel shows the trial paywall straight after its one free analysis.
export function trialDue(tier: Tier, usage: Usage, variant: Variant): boolean {
  return variant === 'ad' && tier === 'free' && usage.lifetime >= FREE_VIDEOS.ad;
}

export function capResetDate(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

// ── the free-videos chip ─────────────────────────────────────────────────────

export type ChipTone = 'normal' | 'last' | 'used';
export type ChipState = { label: string; tone: ChipTone };

export function chipState(tier: Tier, usage: Usage, now: Date, variant: Variant = 'organic'): ChipState | null {
  const left = videosRemaining(tier, usage, now, variant);
  if (tier === 'free') {
    const total = FREE_VIDEOS[variant];
    if (left === 0) return { label: t('paywall.chip.used'), tone: 'used' };
    if (left === total) return { label: t('paywall.chip.free', { count: total }), tone: 'normal' };
    if (left === 1) return { label: t('paywall.chip.last'), tone: 'last' };
    return { label: t('paywall.chip.left', { count: left }), tone: 'normal' };
  }
  if (left === 0) return { label: t('paywall.chip.allUsed', { count: MONTHLY_CAP[tier] }), tone: 'used' };
  if (left <= 5) return { label: t('paywall.chip.leftMonth', { count: left }), tone: left === 1 ? 'last' : 'normal' };
  return null;
}

// ── comparison ────────────────────────────────────────────

export type Cell = { kind: 'dot' } | { kind: 'none' } | { kind: 'text'; text: string };
// Hook and Platform still resolve from their entitlements but are no longer offered.
export type TableTier = 'free' | 'pull' | 'founding';
export type ComparisonRow = { label: string; cells: Record<TableTier, Cell> };
export const TABLE_TIERS: readonly TableTier[] = ['free', 'pull', 'founding'];

export function comparisonRows(): ComparisonRow[] {
  const each = (fn: (t: TableTier) => Cell) =>
    Object.fromEntries(TABLE_TIERS.map((t) => [t, fn(t)])) as Record<TableTier, Cell>;
  const dot = (f: Feature) => each((t) => (hasFeature(t, f) ? { kind: 'dot' } : { kind: 'none' }));
  return [
    {
      label: t('paywall.compare.videos'),
      cells: each((tier) => ({ kind: 'text', text: tier === 'free' ? String(FREE_VIDEOS.organic) : t('paywall.compare.unlimited') })),
    },
    { label: t('paywall.compare.cuePlayer'), cells: each(() => ({ kind: 'dot' })) },
    {
      label: t('paywall.compare.cueMemory'),
      cells: each((tier) => {
        const d = cueMemoryDays(tier);
        if (d === 0) return { kind: 'none' };
        return { kind: 'text', text: d === 'all' ? t('paywall.compare.all') : t('paywall.compare.days', { count: d }) };
      }),
    },
    { label: t('paywall.compare.ghost'), cells: dot('ghostCompare') },
    { label: t('paywall.compare.didItStick'), cells: dot('didItStick') },
    { label: t('paywall.compare.fps'), cells: dot('fps240') },
    {
      label: t('paywall.compare.watermark'),
      cells: each((tier) => ({ kind: 'text', text: t(hasFeature(tier, 'watermarkFreeExport') ? 'paywall.compare.no' : 'paywall.compare.yes') })),
    },
  ];
}

// ── money ────────────────────────────────────────────────────────────────────

export function formatUsd(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${whole ? String(cents / 100) : (cents / 100).toFixed(2)}`;
}

export function annualSavingPct(tier: SubTier): number {
  const p = PRICE_CENTS[tier];
  return Math.round((1 - p.annual / (p.monthly * 12)) * 100);
}

export function annualPerMonthCents(tier: SubTier): number {
  return Math.round(PRICE_CENTS[tier].annual / 12);
}

export type StorePlatform = 'ios' | 'android';
