import {
  FOUNDING_PRICE_CENTS,
  PRICE_CENTS,
  TIER_NAME,
  TRIAL_DAYS,
  annualPerMonthCents,
  formatUsd,
  type Period,
  type StorePlatform,
} from './entitlements';
import type { Plan } from './products';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function longDate(d: Date): string {
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

const per = (period: Period) => (period === 'annual' ? 'a year' : 'a month');

// `price` is the store's localised string when offerings loaded, else the USD table.
export function planPrice(plan: Plan): string {
  if (plan.kind === 'founding') return formatUsd(FOUNDING_PRICE_CENTS);
  return formatUsd(PRICE_CENTS[plan.tier][plan.period]);
}

export function continueLabel(plan: Plan, price = planPrice(plan)): string {
  if (plan.kind === 'founding') return `Take a seat · ${price}`;
  return `Continue · ${price} ${per(plan.period)}`;
}

export function chargeNote(plan: Plan, queued: boolean): string {
  const tail = queued ? ' This lift is saved and goes first.' : '';
  if (plan.kind === 'founding') return `Charged once today. No renewal, Pull for life.${tail}`;
  const renews = plan.period === 'annual' ? 'yearly' : 'monthly';
  return `Charged today, renews ${renews}, cancel any time.${tail}`;
}

export function trialNote(period: Period, now: Date, price = formatUsd(PRICE_CENTS.pull[period])): string {
  return `Today: nothing. ${shortDate(addDays(now, TRIAL_DAYS))}: ${price} unless you cancel. We'll remind you two days before.`;
}

export function trialOptionLine(period: Period): string {
  if (period === 'monthly') return `${formatUsd(PRICE_CENTS.pull.monthly)} a month`;
  return `${formatUsd(annualPerMonthCents('pull'))} a month, billed ${formatUsd(PRICE_CENTS.pull.annual)}`;
}

export const PULL_SUMMARY = '40 videos a month · ghost of best · did it stick · no watermark';

export function storeName(platform: StorePlatform): string {
  return platform === 'ios' ? 'the App Store' : 'Google Play';
}

export function purchasingTitle(platform: StorePlatform): string {
  return `Confirming with ${storeName(platform)}`;
}

export function purchasingLine(plan: Plan, price = planPrice(plan)): string {
  if (plan.kind === 'founding') return `Founding member · ${price} once`;
  return `${TIER_NAME[plan.tier]} · ${price} ${per(plan.period)}`;
}

export function failedTitle(platform: StorePlatform): string {
  const name = storeName(platform);
  return `${name[0].toUpperCase()}${name.slice(1)} didn't go through`;
}

export function failedBody(queued: boolean): string {
  return queued ? 'Nothing was charged. Your lift is still queued.' : 'Nothing was charged.';
}

export function successBody(plan: Plan, now: Date, queuedMovement?: string): string {
  const head =
    plan.kind === 'founding'
      ? 'Pull, for life. No renewal.'
      : plan.trial
        ? `${TIER_NAME[plan.tier]} trial, first charge ${shortDate(addDays(now, TRIAL_DAYS))}.`
        : `${TIER_NAME[plan.tier]}, renews ${longDate(renewalDate(now, plan.period))}.`;
  return queuedMovement ? `${head} Your queued ${queuedMovement} is first in line.` : head;
}

export const OFFLINE_BODY = "Plans need a connection. The clip is saved on your phone and will queue when you're back.";
