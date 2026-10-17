import {
  addMonths,
  chargeNote,
  continueLabel,
  failedBody,
  failedTitle,
  longDate,
  pullSummary,
  purchasingLine,
  purchasingTitle,
  renewalDate,
  sheetTitle,
  shortDate,
  successBody,
  trialNote,
  trialOptionLine,
} from './copy';

const OCT11 = new Date(2026, 9, 11);
const PULL_ANNUAL = { kind: 'sub', tier: 'pull', period: 'annual' } as const;
const PULL_MONTHLY = { kind: 'sub', tier: 'pull', period: 'monthly' } as const;
const FOUNDING = { kind: 'founding' } as const;

describe('dates', () => {
  it('formats short and long dates', () => {
    expect(shortDate(OCT11)).toBe('11 Oct');
    expect(longDate(OCT11)).toBe('11 Oct 2026');
  });

  it('renews a year or a month out', () => {
    expect(longDate(renewalDate(OCT11, 'annual'))).toBe('11 Oct 2027');
    expect(longDate(renewalDate(OCT11, 'monthly'))).toBe('11 Nov 2026');
  });

  it('clamps month ends', () => {
    expect(longDate(addMonths(new Date(2027, 0, 31), 1))).toBe('28 Feb 2027');
    expect(longDate(addMonths(new Date(2028, 0, 31), 1))).toBe('29 Feb 2028');
  });
});

describe('charge copy', () => {
  it('Continue states the exact price and period', () => {
    expect(continueLabel(PULL_ANNUAL)).toBe('Continue · $59.99 a year');
    expect(continueLabel(PULL_MONTHLY)).toBe('Continue · $9.99 a month');
    expect(continueLabel({ kind: 'sub', tier: 'hook', period: 'annual' })).toBe('Continue · $29.99 a year');
    expect(continueLabel(FOUNDING)).toBe('Take a seat · $49.99');
  });

  it('uses the store price string when given', () => {
    expect(continueLabel(PULL_ANNUAL, 'S$78.98')).toBe('Continue · S$78.98 a year');
  });

  it('says how it renews and that the lift goes first', () => {
    expect(chargeNote(PULL_ANNUAL, true)).toBe(
      'Charged today, renews yearly, cancel any time. This lift is saved and goes first.'
    );
    expect(chargeNote(PULL_MONTHLY, false)).toBe('Charged today, renews monthly, cancel any time.');
    expect(chargeNote(FOUNDING, true)).toBe(
      'Charged once today. No renewal, Pull for life. This lift is saved and goes first.'
    );
  });

  it('trial copy names the first charge date', () => {
    expect(trialNote('annual', OCT11)).toBe(
      "Today: nothing. 18 Oct: $59.99 unless you cancel. We'll remind you two days before."
    );
    expect(trialNote('monthly', OCT11)).toBe(
      "Today: nothing. 18 Oct: $9.99 unless you cancel. We'll remind you two days before."
    );
    expect(trialOptionLine('annual')).toBe('$5 a month, billed $59.99');
    expect(trialOptionLine('monthly')).toBe('$9.99 a month');
  });

  it('the Pull summary', () => {
    expect(pullSummary()).toBe('40 videos a month · ghost of best · did it stick · no watermark');
  });
});

describe('purchase states', () => {
  it('names the store', () => {
    expect(purchasingTitle('ios')).toBe('Confirming with the App Store');
    expect(purchasingTitle('android')).toBe('Confirming with Google Play');
    expect(failedTitle('ios')).toBe("The App Store didn't go through");
    expect(failedTitle('android')).toBe("Google Play didn't go through");
  });

  it('purchasing line', () => {
    expect(purchasingLine(PULL_ANNUAL)).toBe('Pull · $59.99 a year');
    expect(purchasingLine(FOUNDING)).toBe('Founding member · $49.99 once');
  });

  it('failed body keeps the queue promise only when there is a clip', () => {
    expect(failedBody(true)).toBe('Nothing was charged. Your lift is still queued.');
    expect(failedBody(false)).toBe('Nothing was charged.');
  });

  it('success body', () => {
    expect(successBody(PULL_ANNUAL, OCT11, 'snatch')).toBe(
      'Pull, renews 11 Oct 2027. Your queued snatch is first in line.'
    );
    expect(successBody(PULL_MONTHLY, OCT11)).toBe('Pull, renews 11 Nov 2026.');
    expect(successBody(FOUNDING, OCT11, 'clean')).toBe('Pull, for life. No renewal. Your queued clean is first in line.');
    expect(successBody({ ...PULL_ANNUAL, trial: true }, OCT11)).toBe('Pull trial, first charge 18 Oct.');
  });

  // #13: the sheet is also reached from Plans with every free video still in hand.
  it('only says the free videos are done when they are', () => {
    expect(sheetTitle(0)).toBe('Your 3 free videos are done. Keep the cues coming.');
    expect(sheetTitle(3)).toBe('Keep the cues coming.');
    expect(sheetTitle(1)).toBe('Keep the cues coming.');
  });
});
