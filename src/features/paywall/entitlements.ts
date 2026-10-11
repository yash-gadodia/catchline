export type Tier = 'free' | 'hook' | 'pull' | 'platform' | 'founding';
export type PaidTier = Exclude<Tier, 'free'>;
export type SubTier = 'hook' | 'pull' | 'platform';
export type Period = 'monthly' | 'annual';
export type Variant = 'organic' | 'ad';

export const SUB_TIERS: readonly SubTier[] = ['hook', 'pull', 'platform'];
export const TIER_NAME: Record<Tier, string> = {
  free: 'Free',
  hook: 'Hook',
  pull: 'Pull',
  platform: 'Platform',
  founding: 'Founding member',
};

// The organic app gives 3 videos for life; the ad funnel gives one, then the trial paywall.
export const FREE_VIDEOS: Record<Variant, number> = { organic: 3, ad: 1 };
export const MONTHLY_CAP: Record<PaidTier, number> = { hook: 12, pull: 40, platform: 100, founding: 40 };

// Prices in US cents. Store-localised price strings replace these once offerings load.
export const PRICE_CENTS: Record<SubTier, Record<Period, number>> = {
  hook: { monthly: 499, annual: 2999 },
  pull: { monthly: 999, annual: 5999 },
  platform: { monthly: 1499, annual: 9999 },
};
export const FOUNDING_PRICE_CENTS = 4999;
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

// The one tier to offer next. Free goes straight to Pull (the preselected default).
export function nextTier(tier: Tier): SubTier | null {
  if (tier === 'free' || tier === 'hook') return 'pull';
  if (tier === 'pull' || tier === 'founding') return 'platform';
  return null;
}

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
    if (left === 0) return { label: 'Free videos used · Unlock', tone: 'used' };
    if (left === total) return { label: `${total} free video${total === 1 ? '' : 's'}`, tone: 'normal' };
    if (left === 1) return { label: 'Last free video', tone: 'last' };
    return { label: `${left} left`, tone: 'normal' };
  }
  if (left === 0) return { label: `All ${MONTHLY_CAP[tier]} used this month`, tone: 'used' };
  if (left <= 5) return { label: `${left} left this month`, tone: left === 1 ? 'last' : 'normal' };
  return null;
}

// ── comparison and upgrade deltas ────────────────────────────────────────────

const GROUPS: { label: string; features: Feature[] }[] = [
  { label: 'Ghost of your best rep', features: ['ghostCompare'] },
  { label: '"Did it stick" tracking', features: ['didItStick'] },
  { label: '240 fps, no watermark', features: ['fps240', 'watermarkFreeExport'] },
  { label: 'Coach link', features: ['coachLink'] },
  { label: 'Explainer from your own clip', features: ['explainer'] },
  { label: 'CSV export', features: ['csvExport'] },
  { label: 'Priority queue', features: ['priorityQueue'] },
];

export function cueMemoryLabel(tier: Tier): string {
  const d = cueMemoryDays(tier);
  if (d === 'all') return 'all';
  return d === 0 ? 'none' : `${d} days`;
}

export type DeltaRow = { label: string; value: string };

export function featureDelta(from: Tier, to: Tier): DeltaRow[] {
  const rows: DeltaRow[] = [];
  const videos = (t: Tier) => (t === 'free' ? `${FREE_VIDEOS.organic} total` : String(MONTHLY_CAP[t]));
  if (videos(from) !== videos(to)) rows.push({ label: 'Videos a month', value: `${videos(from)} → ${videos(to)}` });
  if (cueMemoryLabel(from) !== cueMemoryLabel(to)) {
    rows.push({ label: 'Cue memory', value: `${cueMemoryLabel(from)} → ${cueMemoryLabel(to)}` });
  }
  for (const g of GROUPS) {
    const gained = g.features.every((f) => hasFeature(to, f) && !hasFeature(from, f));
    if (gained) rows.push({ label: g.label, value: 'added' });
  }
  return rows;
}

export type Cell = { kind: 'dot' } | { kind: 'none' } | { kind: 'text'; text: string };
export type ComparisonRow = { label: string; cells: Record<Tier, Cell> };
export const TABLE_TIERS: readonly Tier[] = ['free', 'hook', 'pull', 'platform', 'founding'];

export function comparisonRows(): ComparisonRow[] {
  const each = (fn: (t: Tier) => Cell) =>
    Object.fromEntries(TABLE_TIERS.map((t) => [t, fn(t)])) as Record<Tier, Cell>;
  const dot = (f: Feature) => each((t) => (hasFeature(t, f) ? { kind: 'dot' } : { kind: 'none' }));
  return [
    {
      label: 'Videos',
      cells: each((t) => ({ kind: 'text', text: t === 'free' ? String(FREE_VIDEOS.organic) : `${MONTHLY_CAP[t]}/mo` })),
    },
    { label: 'Cue, player', cells: each(() => ({ kind: 'dot' })) },
    {
      label: 'Cue memory',
      cells: each((t) => {
        const d = cueMemoryDays(t);
        if (d === 0) return { kind: 'none' };
        return { kind: 'text', text: d === 'all' ? 'all' : `${d} d` };
      }),
    },
    { label: 'Ghost of best', cells: dot('ghostCompare') },
    { label: 'Did it stick', cells: dot('didItStick') },
    { label: '240 fps', cells: dot('fps240') },
    {
      label: 'Watermark',
      cells: each((t) => ({ kind: 'text', text: hasFeature(t, 'watermarkFreeExport') ? 'no' : 'yes' })),
    },
    { label: 'Coach link', cells: dot('coachLink') },
    { label: 'Explainer', cells: dot('explainer') },
    { label: 'CSV, priority', cells: dot('csvExport') },
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

export function maxAnnualSavingPct(): number {
  return Math.max(...SUB_TIERS.map(annualSavingPct));
}

export function annualPerMonthCents(tier: SubTier): number {
  return Math.round(PRICE_CENTS[tier].annual / 12);
}

export type StorePlatform = 'ios' | 'android';
export type UpgradeQuote = { deltaCents: number; chargeTodayCents: number; creditCents: number };

// Same-period upgrade between subscription tiers. Google Play is configured with
// CHARGE_PRORATED_PRICE: it charges the price difference for the days left and keeps
// the renewal date. The App Store upgrades immediately, charges the new tier's full
// price and refunds the unused part of the old one.
export function upgradeQuote(
  from: SubTier,
  to: SubTier,
  period: Period,
  daysLeft: number,
  periodDays: number,
  platform: StorePlatform
): UpgradeQuote {
  const fromCents = PRICE_CENTS[from][period];
  const toCents = PRICE_CENTS[to][period];
  const deltaCents = toCents - fromCents;
  const fraction = Math.min(1, Math.max(0, daysLeft / periodDays));
  if (platform === 'android') {
    return { deltaCents, chargeTodayCents: Math.round(deltaCents * fraction), creditCents: 0 };
  }
  return { deltaCents, chargeTodayCents: toCents, creditCents: Math.round(fromCents * fraction) };
}
