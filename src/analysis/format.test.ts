import type { Cue, Measurement } from './types';
import {
  fmt,
  formatLoad,
  formatWait,
  heroValue,
  liftTitle,
  speedRows,
  phaseLabel,
  speedText,
  valueText,
} from './format';
import { snatchMock } from './fixtures';

const m = (over: Partial<Measurement>): Measurement => ({
  id: 'x',
  label: 'X',
  value: 1,
  unit: 'cm',
  frame: 0,
  status: 'normal',
  note: '',
  ...over,
});

describe('fmt', () => {
  it('drops trailing zeros and caps at two decimals', () => {
    expect(fmt(6)).toBe('6');
    expect(fmt(62.5)).toBe('62.5');
    expect(fmt(0.123)).toBe('0.12');
    expect(fmt(0.1)).toBe('0.1');
  });
});

describe('titles', () => {
  it('reads movement, load and rep', () => {
    expect(liftTitle(snatchMock, 'kg', 2)).toBe('Snatch · 62.5 kg · rep 2');
    expect(liftTitle(snatchMock, 'kg')).toBe('Snatch · 62.5 kg');
    expect(liftTitle({ ...snatchMock, loadKg: 67.5 }, 'kg', 'miss')).toBe('Snatch · 67.5 kg · miss');
  });

  it('reads the load in lb when the lifter picked lb', () => {
    expect(liftTitle({ ...snatchMock, loadKg: 72.5 }, 'lb')).toBe('Snatch · 160 lb');
  });

  it('labels phases for chips', () => {
    expect(phaseLabel('first_pull')).toBe('1st pull');
    expect(phaseLabel('second_pull')).toBe('2nd pull');
  });
});

describe('loads', () => {
  it('shows kg as stored and lb to the nearest half pound', () => {
    expect(formatLoad(62.5, 'kg')).toBe('62.5 kg');
    expect(formatLoad(72.5, 'lb')).toBe('160 lb');
    expect(formatLoad(100, 'lb')).toBe('220.5 lb');
  });

  it('reads a lb entry back as typed, though it is stored to 0.1 kg', () => {
    // 135 lb is stored as 61.2 kg, 137.5 lb as 62.4 kg (parseWeight)
    expect(formatLoad(61.2, 'lb')).toBe('135 lb');
    expect(formatLoad(62.4, 'lb')).toBe('137.5 lb');
  });
});

describe('evidence', () => {
  it('formats the hero number from the cue', () => {
    expect(heroValue(snatchMock.cue!)).toBe('6 cm');
  });
});

describe('bar speed', () => {
  it('always shows two decimals', () => {
    expect(speedText(1.8)).toBe('1.80 m/s');
    expect(speedText(1.836)).toBe('1.84 m/s');
    expect(speedText(2)).toBe('2.00 m/s');
  });

  it('reads the measured speed rows in order, and nothing when not measured, not sent or switched off', () => {
    const a = (measurements: Measurement[]) => ({ measurements }) as Parameters<typeof speedRows>[0];
    const peak = m({ id: 'bar_speed', value: 1.82, unit: 'm/s' });
    const pct = m({ id: 'bar_peak_pct', value: 67.4, unit: '%' });
    expect(speedRows(a([pct, m({ value: 3 }), peak])).map(valueText)).toEqual(['1.82 m/s', '67%']);
    expect(speedRows(a([peak]), false)).toEqual([]);
    expect(speedRows(a([m({ id: 'bar_speed', value: 0, unit: 'm/s', status: 'not_seen' })]))).toEqual([]);
  });
});

describe('processing', () => {
  it('says the expected wait in minutes once it is one', () => {
    expect(formatWait(150)).toBe('about 2 min');
    expect(formatWait(90)).toBe('about 1 min');
    expect(formatWait(20)).toBe('about 20 s');
  });

});
