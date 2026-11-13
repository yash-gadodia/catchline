import {
  addMonths,
  chargeNote,
  continueLabel,
  failedBody,
  failedTitle,
  longDate,
  purchasingLine,
  purchasingTitle,
  renewalDate,
  sheetBody,
  sheetTitle,
  shortDate,
  successBody,
} from './copy';

const OCT11 = new Date(2026, 9, 11);
const WED = new Date(2026, 10, 11, 9, 0);
const PRO_ANNUAL = { kind: 'pro', period: 'annual' } as const;
const PRO_MONTHLY = { kind: 'pro', period: 'monthly' } as const;
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

describe('the sheet', () => {
  it('sells unlimited videos while free videos are in hand', () => {
    expect(sheetTitle(3)).toBe('Unlimited videos.');
    expect(sheetTitle(1)).toBe('Unlimited videos.');
    expect(sheetBody(2, WED)).toBe('Free gives you 3 videos a week. Catchline Pro has no limit.');
  });

  it('with none left, says so and names the Monday they come back', () => {
    expect(sheetTitle(0)).toBe("You've used this week's 3 free videos.");
    expect(sheetBody(0, WED)).toBe('They come back on Monday, 16 Nov. Catchline Pro has no limit.');
    expect(sheetBody(0, new Date(2026, 10, 15, 23, 0))).toBe('They come back on Monday, 16 Nov. Catchline Pro has no limit.');
    expect(sheetBody(0, new Date(2026, 10, 30))).toBe('They come back on Monday, 7 Dec. Catchline Pro has no limit.');
  });
});

describe('charge copy', () => {
  it('Continue states the exact price and period', () => {
    expect(continueLabel(PRO_ANNUAL)).toBe('Continue · $19.99 a year');
    expect(continueLabel(PRO_MONTHLY)).toBe('Continue · $2.99 a month');
    expect(continueLabel(FOUNDING)).toBe('Take a seat · $29.99');
  });

  it('uses the store price string when given', () => {
    expect(continueLabel(PRO_ANNUAL, 'S$78.98')).toBe('Continue · S$78.98 a year');
  });

  it('says how it renews and that the saved video goes first', () => {
    expect(chargeNote(PRO_ANNUAL, true)).toBe('Charged today, renews yearly, cancel any time. Your video is saved and goes first.');
    expect(chargeNote(PRO_MONTHLY, false)).toBe('Charged today, renews monthly, cancel any time.');
    expect(chargeNote(FOUNDING, true)).toBe('Charged once today. No renewal, Pro for life. Your video is saved and goes first.');
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
    expect(purchasingLine(PRO_ANNUAL)).toBe('Catchline Pro · $19.99 a year');
    expect(purchasingLine(FOUNDING)).toBe('Founding member · $29.99 once');
  });

  it('failed body mentions the saved video only when there is one', () => {
    expect(failedBody(true)).toBe('Nothing was charged. Your video is still saved.');
    expect(failedBody(false)).toBe('Nothing was charged.');
  });

  it('success body', () => {
    expect(successBody(PRO_ANNUAL, OCT11)).toBe('Unlimited videos. Renews 11 Oct 2027.');
    expect(successBody(PRO_MONTHLY, OCT11)).toBe('Unlimited videos. Renews 11 Nov 2026.');
    expect(successBody(FOUNDING, OCT11)).toBe('Unlimited videos, for life. No renewal.');
  });
});
