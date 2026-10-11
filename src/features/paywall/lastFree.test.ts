import { lastFreeDue } from './entitlements';
import { captureHref } from './hooks';
import { useUsage } from './usageStore';

const used = (lifetime: number) => ({ lifetime, month: '', thisMonth: 0 });

describe('last free video', () => {
  beforeEach(() => useUsage.getState().reset());

  it('is due only on the organic free tier with exactly one video left, once', () => {
    expect(lastFreeDue('free', used(2), 'organic', null)).toBe(true);
    expect(lastFreeDue('free', used(2), 'organic', 2)).toBe(false);
    expect(lastFreeDue('free', used(1), 'organic', null)).toBe(false);
    expect(lastFreeDue('free', used(3), 'organic', null)).toBe(false);
    expect(lastFreeDue('free', used(0), 'ad', null)).toBe(false);
    expect(lastFreeDue('pull', used(2), 'organic', null)).toBe(false);
  });

  it('routes Record through the heads-up until it has been seen', () => {
    expect(captureHref('/capture')).toBe('/capture');
    useUsage.setState({ usage: used(2) });
    expect(captureHref('/capture?source=import')).toBe('/paywall/last?next=%2Fcapture%3Fsource%3Dimport');
    useUsage.getState().warnLastFree();
    expect(captureHref('/capture')).toBe('/capture');
  });
});
