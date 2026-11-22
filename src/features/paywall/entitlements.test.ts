import {
  EMPTY_USAGE,
  FREE_PER_WEEK,
  STARTER_FREE,
  annualSavingPct,
  canAnalyse,
  formatUsd,
  freeLeft,
  freeTotal,
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

// A lifter whose starter videos are spent, so only the week's video is left.
const PAST_STARTER: Usage = { lifetime: STARTER_FREE, week: '2026-11-02', thisWeek: 1 };

describe('a new phone: the first 3 videos are free whatever the week', () => {
  it('starts with 3, counted out of 3', () => {
    expect(STARTER_FREE).toBe(3);
    expect(freeLeft(EMPTY_USAGE, WED)).toBe(3);
    expect(freeTotal(EMPTY_USAGE, WED)).toBe(3);
  });

  it('allows 3 in one week, then blocks until Monday', () => {
    expect(freeLeft(track(1, 'free', WED), WED)).toBe(2);
    expect(freeLeft(track(2, 'free', WED), WED)).toBe(1);
    const three = track(3, 'free', WED);
    expect(three).toEqual({ lifetime: 3, week: '2026-11-09', thisWeek: 3 });
    expect(gateFor('free', three, SUN_NIGHT)).toBe('cap');
    expect(freeLeft(three, NEXT_MON)).toBe(1);
    expect(freeTotal(three, NEXT_MON)).toBe(1);
  });

  it('a starter video left over carries into the next week, on top of nothing', () => {
    const one = track(1, 'free', WED);
    expect(freeLeft(one, NEXT_MON)).toBe(2);
    const two = track(1, 'free', NEXT_MON, one);
    expect(freeLeft(two, NEXT_MON)).toBe(1);
  });

  it('a lifter who has already tracked 3 or more gets only the week', () => {
    const old: Usage = { lifetime: 40, week: '', thisWeek: 0 };
    expect(freeLeft(old, WED)).toBe(1);
    expect(freeTotal(old, WED)).toBe(1);
  });
});

describe('free: 1 video a week, once the starter videos are spent', () => {
  it('starts each week with one', () => {
    expect(FREE_PER_WEEK).toBe(1);
    expect(freeLeft(PAST_STARTER, WED)).toBe(1);
    expect(gateFor('free', PAST_STARTER, WED)).toBe('ok');
  });

  it('allows the first video and blocks the second', () => {
    const one = track(1, 'free', WED, PAST_STARTER);
    expect(one).toEqual({ lifetime: 4, week: '2026-11-09', thisWeek: 1 });
    expect(freeLeft(one, WED)).toBe(0);
    expect(canAnalyse('free', one, WED)).toBe(false);
    expect(gateFor('free', one, WED)).toBe('cap');
  });

  it('stays blocked until Sunday night and resets on Monday', () => {
    const one = track(1, 'free', WED, PAST_STARTER);
    expect(gateFor('free', one, SUN_NIGHT)).toBe('cap');
    expect(usedThisWeek(one, NEXT_MON)).toBe(0);
    expect(freeLeft(one, NEXT_MON)).toBe(1);
    expect(gateFor('free', one, NEXT_MON)).toBe('ok');
    expect(recordAnalysis(one, 'free', NEXT_MON)).toEqual({ lifetime: 5, week: '2026-11-16', thisWeek: 1 });
  });

  it('counts a video from Monday against Sunday night', () => {
    const usage = track(1, 'free', new Date(2026, 10, 9, 6, 0), PAST_STARTER);
    expect(usage.thisWeek).toBe(1);
    expect(gateFor('free', usage, SUN_NIGHT)).toBe('cap');
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
