import { formatDate, getLocale, t } from '../../i18n';
import { FOUNDING_PRICE_CENTS, FREE_PER_WEEK, PRICE_CENTS, formatUsd, nextWeekStart, type Period, type StorePlatform } from './entitlements';
import type { Plan } from './products';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(d: Date): string {
  if (getLocale() !== 'en') return formatDate(d, { day: 'numeric', month: 'short' });
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function longDate(d: Date): string {
  if (getLocale() !== 'en') return formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${shortDate(d)} ${d.getFullYear()}`;
}

// Calendar months, clamped: 31 Jan + 1 month = 28/29 Feb, as the stores bill.
export function addMonths(d: Date, months: number): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), lastDay));
}

export function renewalDate(now: Date, period: Period): Date {
  return addMonths(now, period === 'annual' ? 12 : 1);
}

const per = (period: Period) => t(period === 'annual' ? 'paywall.perYear' : 'paywall.perMonth');

// The USD table; the store's localised string replaces it once offerings load.
export function planPrice(plan: Plan): string {
  return formatUsd(plan.kind === 'founding' ? FOUNDING_PRICE_CENTS : PRICE_CENTS[plan.period]);
}

// With free videos in hand the sheet sells Pro; with none it says when they come back.
export function sheetTitle(freeLeft: number): string {
  return freeLeft > 0 ? t('paywall.title') : t('paywall.cap.title', { count: FREE_PER_WEEK });
}

export function sheetBody(freeLeft: number, now: Date): string {
  if (freeLeft > 0) return t('paywall.body', { count: FREE_PER_WEEK });
  return t('paywall.cap.body', { date: shortDate(nextWeekStart(now)) });
}

export function continueLabel(plan: Plan, price = planPrice(plan)): string {
  if (plan.kind === 'founding') return t('paywall.takeSeat', { price });
  return t('paywall.continue', { price, per: per(plan.period) });
}

export function chargeNote(plan: Plan, queued: boolean): string {
  const tail = queued ? ` ${t('paywall.queuedNote')}` : '';
  if (plan.kind === 'founding') return `${t('paywall.chargeFounding')}${tail}`;
  return `${t(plan.period === 'annual' ? 'paywall.chargeYearly' : 'paywall.chargeMonthly')}${tail}`;
}

export function purchasingTitle(platform: StorePlatform): string {
  return t(platform === 'ios' ? 'paywall.purchasingIos' : 'paywall.purchasingAndroid');
}

export function purchasingLine(plan: Plan, price = planPrice(plan)): string {
  if (plan.kind === 'founding') return t('paywall.purchasingFounding', { price });
  return t('paywall.purchasingSub', { price, per: per(plan.period) });
}

export function failedTitle(platform: StorePlatform): string {
  return t(platform === 'ios' ? 'paywall.failedIos' : 'paywall.failedAndroid');
}

export function failedBody(queued: boolean): string {
  return t(queued ? 'paywall.failedQueued' : 'paywall.failedBody');
}

export function successBody(plan: Plan, now: Date): string {
  if (plan.kind === 'founding') return t('paywall.successFounding');
  return t('paywall.successRenews', { date: longDate(renewalDate(now, plan.period)) });
}
