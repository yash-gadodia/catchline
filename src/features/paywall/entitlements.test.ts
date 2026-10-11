import {
  EMPTY_USAGE,
  annualPerMonthCents,
  annualSavingPct,
  canAnalyse,
  capResetDate,
  chipState,
  comparisonRows,
  cueMemoryDays,
  featureDelta,
  featuresFor,
  formatUsd,
  gateFor,
  hasFeature,
  maxAnnualSavingPct,
  monthKey,
  nextTier,
  recordAnalysis,
  tierFromEntitlements,
  upgradeQuote,
  videosRemaining,
  type Usage,
} from './entitlements';

const OCT = new Date(2026, 9, 11);
const NOV = new Date(2026, 10, 2);
const used = (lifetime: number, thisMonth = 0, month = '2026-10'): Usage => ({ lifetime, month, thisMonth });

describe('videosRemaining / canAnalyse', () => {
  it('free has 3 lifetime videos', () => {
    expect(videosRemaining('free', EMPTY_USAGE, OCT)).toBe(3);
    expect(videosRemaining('free', used(2), OCT)).toBe(1);
    expect(videosRemaining('free', used(3), OCT)).toBe(0);
    expect(videosRemaining('free', used(5), OCT)).toBe(0);
    expect(canAnalyse('free', used(2), OCT)).toBe(true);
    expect(canAnalyse('free', used(3), OCT)).toBe(false);
  });

  it('the ad funnel gives one free video', () => {
    expect(videosRemaining('free', EMPTY_USAGE, OCT, 'ad')).toBe(1);
    expect(canAnalyse('free', used(1), OCT, 'ad')).toBe(false);
  });

  it('free videos do not resurface in a new month', () => {
    expect(videosRemaining('free', used(3, 0, '2026-10'), NOV)).toBe(0);
  });

  it('paid tiers count this calendar month against their cap', () => {
    expect(videosRemaining('hook', used(10, 7), OCT)).toBe(5);
    expect(videosRemaining('pull', used(43, 40), OCT)).toBe(0);
    expect(videosRemaining('platform', used(120, 99), OCT)).toBe(1);
    expect(videosRemaining('founding', used(3, 0), OCT)).toBe(40);
    expect(canAnalyse('pull', used(43, 40), OCT)).toBe(false);
  });

  it('a new month resets the paid cap', () => {
    expect(videosRemaining('pull', used(43, 40, '2026-10'), NOV)).toBe(40);
    expect(canAnalyse('pull', used(43, 40, '2026-10'), NOV)).toBe(true);
  });
});

describe('recordAnalysis', () => {
  it('free only advances the lifetime count', () => {
    expect(recordAnalysis(used(2), 'free', OCT)).toEqual({ lifetime: 3, month: '2026-10', thisMonth: 0 });
    expect(recordAnalysis(EMPTY_USAGE, 'free', OCT)).toEqual({ lifetime: 1, month: '', thisMonth: 0 });
  });

  it('the first paid video starts at 1 even after the free three', () => {
    expect(recordAnalysis(used(3), 'pull', OCT)).toEqual({ lifetime: 4, month: '2026-10', thisMonth: 1 });
  });

  it('rolls the month over', () => {
    expect(recordAnalysis(used(50, 40, '2026-10'), 'pull', NOV)).toEqual({ lifetime: 51, month: '2026-11', thisMonth: 1 });
  });
});

describe('gateFor', () => {
  it('lets the clip through while there are videos left', () => {
    expect(gateFor('free', used(2), OCT)).toBe('ok');
    expect(gateFor('pull', used(10, 39), OCT)).toBe('ok');
  });

  it('video 4 on free hits the paywall', () => {
    expect(gateFor('free', used(3), OCT)).toBe('paywall');
  });

  it('the ad funnel hits the trial paywall after one', () => {
    expect(gateFor('free', used(1), OCT, 'ad')).toBe('trial');
  });

  it('a paid tier at its cap hits the cap sheet', () => {
    expect(gateFor('hook', used(20, 12), OCT)).toBe('cap');
    expect(gateFor('platform', used(200, 100), OCT)).toBe('cap');
  });
});

describe('features per tier', () => {
  it('free and Hook unlock no extra features', () => {
    expect(featuresFor('free')).toEqual([]);
    expect(featuresFor('hook')).toEqual([]);
  });

  it('Pull and Founding unlock the same set', () => {
    const pull = ['cueMemoryFull', 'ghostCompare', 'didItStick', 'fps240', 'watermarkFreeExport'];
    expect(featuresFor('pull')).toEqual(pull);
    expect(featuresFor('founding')).toEqual(pull);
  });

  it('Platform adds coach link, explainer, CSV and priority', () => {
    expect(featuresFor('platform')).toEqual([
      'cueMemoryFull',
      'ghostCompare',
      'didItStick',
      'fps240',
      'watermarkFreeExport',
      'coachLink',
      'explainer',
      'csvExport',
      'priorityQueue',
    ]);
  });

  it('answers single feature checks', () => {
    expect(hasFeature('hook', 'watermarkFreeExport')).toBe(false);
    expect(hasFeature('pull', 'watermarkFreeExport')).toBe(true);
    expect(hasFeature('founding', 'coachLink')).toBe(false);
    expect(hasFeature('platform', 'explainer')).toBe(true);
    expect(hasFeature('pull', 'priorityQueue')).toBe(false);
  });

  it('cue memory is none, 90 days, or all', () => {
    expect(cueMemoryDays('free')).toBe(0);
    expect(cueMemoryDays('hook')).toBe(90);
    expect(cueMemoryDays('pull')).toBe('all');
    expect(cueMemoryDays('founding')).toBe('all');
    expect(cueMemoryDays('platform')).toBe('all');
  });
});

describe('tiers', () => {
  it('nextTier offers Pull first, then Platform, then nothing', () => {
    expect(nextTier('free')).toBe('pull');
    expect(nextTier('hook')).toBe('pull');
    expect(nextTier('pull')).toBe('platform');
    expect(nextTier('founding')).toBe('platform');
    expect(nextTier('platform')).toBeNull();
  });

  it('tierFromEntitlements picks the highest entitlement', () => {
    expect(tierFromEntitlements([])).toBe('free');
    expect(tierFromEntitlements(['hook'])).toBe('hook');
    expect(tierFromEntitlements(['hook', 'pull'])).toBe('pull');
    expect(tierFromEntitlements(['hook', 'pull', 'founding'])).toBe('founding');
    expect(tierFromEntitlements(['hook', 'pull', 'founding', 'platform'])).toBe('platform');
    expect(tierFromEntitlements(['Parallax Pro'])).toBe('free');
  });

  it('capResetDate is the first of next month', () => {
    expect(capResetDate(OCT)).toEqual(new Date(2026, 10, 1));
    expect(capResetDate(new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1));
  });

  it('monthKey pads the month', () => {
    expect(monthKey(new Date(2026, 0, 5))).toBe('2026-01');
  });
});

describe('chipState', () => {
  it('walks 3 free → 2 left → last → used', () => {
    expect(chipState('free', EMPTY_USAGE, OCT)).toEqual({ label: '3 free videos', tone: 'normal' });
    expect(chipState('free', used(1), OCT)).toEqual({ label: '2 left', tone: 'normal' });
    expect(chipState('free', used(2), OCT)).toEqual({ label: 'Last free video', tone: 'last' });
    expect(chipState('free', used(3), OCT)).toEqual({ label: 'Free videos used · Unlock', tone: 'used' });
  });

  it('ad funnel shows one free video', () => {
    expect(chipState('free', EMPTY_USAGE, OCT, 'ad')).toEqual({ label: '1 free video', tone: 'normal' });
  });

  it('paid tiers only show near the cap', () => {
    expect(chipState('pull', used(10, 30), OCT)).toBeNull();
    expect(chipState('pull', used(40, 35), OCT)).toEqual({ label: '5 left this month', tone: 'normal' });
    expect(chipState('pull', used(40, 39), OCT)).toEqual({ label: '1 left this month', tone: 'last' });
    expect(chipState('hook', used(40, 12), OCT)).toEqual({ label: 'All 12 used this month', tone: 'used' });
  });
});

describe('featureDelta', () => {
  it('Hook → Pull lists only what changes', () => {
    expect(featureDelta('hook', 'pull')).toEqual([
      { label: 'Videos a month', value: '12 → 40' },
      { label: 'Cue memory', value: '90 days → all' },
      { label: 'Ghost of your best rep', value: 'added' },
      { label: '"Did it stick" tracking', value: 'added' },
      { label: '240 fps, no watermark', value: 'added' },
    ]);
  });

  it('Pull → Platform', () => {
    expect(featureDelta('pull', 'platform')).toEqual([
      { label: 'Videos a month', value: '40 → 100' },
      { label: 'Coach link', value: 'added' },
      { label: 'Explainer from your own clip', value: 'added' },
      { label: 'CSV export', value: 'added' },
      { label: 'Priority queue', value: 'added' },
    ]);
  });

  it('Founding → Platform matches Pull → Platform', () => {
    expect(featureDelta('founding', 'platform')).toEqual(featureDelta('pull', 'platform'));
  });

  it('no change gives no rows', () => {
    expect(featureDelta('pull', 'founding')).toEqual([]);
  });
});

describe('comparisonRows', () => {
  it('matches the plans table', () => {
    const rows = comparisonRows();
    expect(rows.map((r) => r.label)).toEqual([
      'Videos',
      'Cue, player',
      'Cue memory',
      'Ghost of best',
      'Did it stick',
      '240 fps',
      'Watermark',
      'Coach link',
      'Explainer',
      'CSV, priority',
    ]);
    expect(rows[0].cells).toEqual({
      free: { kind: 'text', text: '3' },
      hook: { kind: 'text', text: '12/mo' },
      pull: { kind: 'text', text: '40/mo' },
      platform: { kind: 'text', text: '100/mo' },
      founding: { kind: 'text', text: '40/mo' },
    });
    expect(rows[2].cells).toEqual({
      free: { kind: 'none' },
      hook: { kind: 'text', text: '90 d' },
      pull: { kind: 'text', text: 'all' },
      platform: { kind: 'text', text: 'all' },
      founding: { kind: 'text', text: 'all' },
    });
    expect(rows[6].cells.hook).toEqual({ kind: 'text', text: 'yes' });
    expect(rows[6].cells.founding).toEqual({ kind: 'text', text: 'no' });
    expect(rows[7].cells.platform).toEqual({ kind: 'dot' });
    expect(rows[7].cells.founding).toEqual({ kind: 'none' });
  });
});

describe('money', () => {
  it('formats cents', () => {
    expect(formatUsd(5999)).toBe('$59.99');
    expect(formatUsd(3000)).toBe('$30');
    expect(formatUsd(500)).toBe('$5');
    expect(formatUsd(250)).toBe('$2.50');
    expect(formatUsd(1840)).toBe('$18.40');
  });

  it('annual savings per tier and the headline max', () => {
    expect(annualSavingPct('hook')).toBe(50);
    expect(annualSavingPct('pull')).toBe(50);
    expect(annualSavingPct('platform')).toBe(44);
    expect(maxAnnualSavingPct()).toBe(50);
  });

  it('annual per month', () => {
    expect(annualPerMonthCents('pull')).toBe(500);
    expect(annualPerMonthCents('hook')).toBe(250);
  });

  it('Play upgrade charges the delta for the days left', () => {
    expect(upgradeQuote('hook', 'pull', 'annual', 73, 365, 'android')).toEqual({
      deltaCents: 3000,
      chargeTodayCents: 600,
      creditCents: 0,
    });
    expect(upgradeQuote('pull', 'platform', 'annual', 365, 365, 'android')).toEqual({
      deltaCents: 4000,
      chargeTodayCents: 4000,
      creditCents: 0,
    });
  });

  it('App Store upgrade charges full price and credits unused time', () => {
    expect(upgradeQuote('hook', 'pull', 'annual', 73, 365, 'ios')).toEqual({
      deltaCents: 3000,
      chargeTodayCents: 5999,
      creditCents: 600,
    });
  });

  it('clamps days left to the period', () => {
    expect(upgradeQuote('hook', 'pull', 'monthly', 45, 30, 'android').chargeTodayCents).toBe(500);
    expect(upgradeQuote('hook', 'pull', 'monthly', -3, 30, 'android').chargeTodayCents).toBe(0);
  });
});
