import {
  EMPTY_USAGE,
  FREE_PER_WEEK,
  annualSavingPct,
  canAnalyse,
  formatUsd,
  freeLeft,
  gateFor,
  hasFeature,
  isPro,
  nextWeekStart,
  recordAnalysis,
  tierFromEntitlements,
  usedThisWeek,
  weekKey,
  type Tier,
  type Usage,
} from './entitlements';

// Wednesday 11 Nov 2026; its week runs Monday 9 Nov to Sunday 15 Nov.
const WED = new Date(2026, 10, 11, 9, 0);
const SUN_NIGHT = new Date(2026, 10, 15, 23, 59);
const NEXT_MON = new Date(2026, 10, 16, 0, 0);

function track(times: number, tier: Tier, at: Date, from: Usage = EMPTY_USAGE): Usage {
  let usage = from;
  for (let i = 0; i < times; i++) usage = recordAnalysis(usage, tier, at);
  return usage;
}

describe('the week starts on Monday, in the phone’s local time', () => {
  it('names a week by its Monday', () => {
    expect(weekKey(WED)).toBe('2026-11-09');
    expect(weekKey(new Date(2026, 10, 9, 0, 0))).toBe('2026-11-09');
    expect(weekKey(SUN_NIGHT)).toBe('2026-11-09');
    expect(weekKey(NEXT_MON)).toBe('2026-11-16');
  });

  it('crosses a month and a year', () => {
    expect(weekKey(new Date(2026, 10, 1))).toBe('2026-10-26');
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-12-28');
  });

  it('the free videos come back the next Monday', () => {
    expect(nextWeekStart(WED)).toEqual(new Date(2026, 10, 16));
    expect(nextWeekStart(new Date(2026, 10, 9))).toEqual(new Date(2026, 10, 16));
    expect(nextWeekStart(SUN_NIGHT)).toEqual(new Date(2026, 10, 16));
  });
});

describe('free: 3 videos a week', () => {
  it('starts with all three', () => {
    expect(FREE_PER_WEEK).toBe(3);
    expect(freeLeft(EMPTY_USAGE, WED)).toBe(3);
    expect(gateFor('free', EMPTY_USAGE, WED)).toBe('ok');
  });

  it('allows the third video and blocks the fourth', () => {
    const two = track(2, 'free', WED);
    expect(two).toEqual({ lifetime: 2, week: '2026-11-09', thisWeek: 2 });
    expect(freeLeft(two, WED)).toBe(1);
    expect(gateFor('free', two, WED)).toBe('ok');

    const three = track(1, 'free', WED, two);
    expect(three).toEqual({ lifetime: 3, week: '2026-11-09', thisWeek: 3 });
    expect(freeLeft(three, WED)).toBe(0);
    expect(canAnalyse('free', three, WED)).toBe(false);
    expect(gateFor('free', three, WED)).toBe('cap');
  });

  it('stays blocked until Sunday night and resets on Monday', () => {
    const three = track(3, 'free', WED);
    expect(gateFor('free', three, SUN_NIGHT)).toBe('cap');
    expect(usedThisWeek(three, NEXT_MON)).toBe(0);
    expect(freeLeft(three, NEXT_MON)).toBe(3);
    expect(gateFor('free', three, NEXT_MON)).toBe('ok');
    expect(recordAnalysis(three, 'free', NEXT_MON)).toEqual({ lifetime: 4, week: '2026-11-16', thisWeek: 1 });
  });

  it('counts videos spread over the week together', () => {
    const usage = track(1, 'free', SUN_NIGHT, track(2, 'free', new Date(2026, 10, 9, 6, 0)));
    expect(usage.thisWeek).toBe(3);
    expect(gateFor('free', usage, SUN_NIGHT)).toBe('cap');
  });

  it('the lifetime count gates nothing: a lifter who used the old 3 for life gets 3 this week', () => {
    const old: Usage = { lifetime: 40, week: '', thisWeek: 0 };
    expect(freeLeft(old, WED)).toBe(3);
    expect(gateFor('free', old, WED)).toBe('ok');
  });
});

describe('every paid tier, old or new, is Pro: unlimited', () => {
  const usedUp = track(3, 'free', WED);

  it.each<Tier>(['hook', 'pull', 'platform', 'founding'])('%s is never capped', (tier) => {
    expect(isPro(tier)).toBe(true);
    expect(canAnalyse(tier, usedUp, WED)).toBe(true);
    expect(gateFor(tier, usedUp, WED)).toBe('ok');
    expect(gateFor(tier, track(500, tier, WED, usedUp), WED)).toBe('ok');
    expect(hasFeature(tier, 'watermarkFreeExport')).toBe(true);
  });

  it('free is not Pro', () => {
    expect(isPro('free')).toBe(false);
    expect(hasFeature('free', 'watermarkFreeExport')).toBe(false);
  });

  it('a Pro video does not use a free one', () => {
    expect(recordAnalysis({ lifetime: 2, week: '2026-11-09', thisWeek: 2 }, 'pull', WED)).toEqual({
      lifetime: 3,
      week: '2026-11-09',
      thisWeek: 2,
    });
  });
});

describe('tierFromEntitlements', () => {
  it('reads the highest active entitlement', () => {
    expect(tierFromEntitlements([])).toBe('free');
    expect(tierFromEntitlements(['hook'])).toBe('hook');
    expect(tierFromEntitlements(['hook', 'pull'])).toBe('pull');
    expect(tierFromEntitlements(['hook', 'pull', 'founding'])).toBe('founding');
    expect(tierFromEntitlements(['hook', 'pull', 'platform'])).toBe('platform');
    expect(tierFromEntitlements(['hook', 'pull', 'platform', 'founding'])).toBe('platform');
    expect(tierFromEntitlements(['something_else'])).toBe('free');
  });
});

describe('money', () => {
  it('formats US prices', () => {
    expect(formatUsd(1999)).toBe('$19.99');
    expect(formatUsd(300)).toBe('$3');
  });

  it('annual saves 44% against twelve months', () => {
    expect(annualSavingPct()).toBe(44);
  });
});
