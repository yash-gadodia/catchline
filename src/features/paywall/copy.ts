import { formatDate, getLocale, t } from '../../i18n';
import {
  FOUNDING_PRICE_CENTS,
  FREE_VIDEOS,
  MONTHLY_CAP,
  PRICE_CENTS,
  TRIAL_DAYS,
  annualPerMonthCents,
  formatUsd,
  tierName,
  type Period,
  type StorePlatform,
} from './entitlements';
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

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
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

// `price` is the store's localised string when offerings loaded, else the USD table.
export function planPrice(plan: Plan): string {
  if (plan.kind === 'founding') return formatUsd(FOUNDING_PRICE_CENTS);
  return formatUsd(PRICE_CENTS[plan.tier][plan.period]);
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

export function trialNote(period: Period, now: Date, price = formatUsd(PRICE_CENTS.pull[period])): string {
  return t('paywall.trialNote', { date: shortDate(addDays(now, TRIAL_DAYS)), price });
}

export function trialOptionLine(period: Period): string {
  if (period === 'monthly') return t('paywall.trialMonthly', { price: formatUsd(PRICE_CENTS.pull.monthly) });
  return t('paywall.trialAnnual', { perMonth: formatUsd(annualPerMonthCents('pull')), price: formatUsd(PRICE_CENTS.pull.annual) });
}

// The sheet is reached at the cap and organically from Plans, where the free videos are
// still in hand: only the first can say they are done.
export function sheetTitle(freeLeft: number): string {
  if (freeLeft > 0) return t('paywall.sheet.titleLeft');
  return t('paywall.sheet.title', { count: FREE_VIDEOS.organic });
}

export function pullSummary(): string {
  return t('paywall.pullSummary', { count: MONTHLY_CAP.pull });
}

export function purchasingTitle(platform: StorePlatform): string {
  return t(platform === 'ios' ? 'paywall.purchasingIos' : 'paywall.purchasingAndroid');
}

export function purchasingLine(plan: Plan, price = planPrice(plan)): string {
  if (plan.kind === 'founding') return t('paywall.purchasingFounding', { price });
  return t('paywall.purchasingSub', { tier: tierName(plan.tier), price, per: per(plan.period) });
}

export function failedTitle(platform: StorePlatform): string {
  return t(platform === 'ios' ? 'paywall.failedIos' : 'paywall.failedAndroid');
}

export function failedBody(queued: boolean): string {
  return t(queued ? 'paywall.failedQueued' : 'paywall.failedBody');
}

export function successBody(plan: Plan, now: Date, queuedMovement?: string): string {
  const head =
    plan.kind === 'founding'
      ? t('paywall.successFounding')
      : plan.trial
        ? t('paywall.successTrial', { tier: tierName(plan.tier), date: shortDate(addDays(now, TRIAL_DAYS)) })
        : t('paywall.successRenews', { tier: tierName(plan.tier), date: longDate(renewalDate(now, plan.period)) });
  return queuedMovement ? t('paywall.successQueued', { head, movement: queuedMovement }) : head;
}

export function offlineBody(): string {
  return t('paywall.offlineBody');
}
