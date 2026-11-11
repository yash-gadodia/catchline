import type { Cue, Measurement } from './types';
import {
  evidenceReadout,
  fmt,
  formatWait,
  heroValue,
  liftTitle,
  movementNote,
  speedRows,
  phaseLabel,
  processingSteps,
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

describe('movementNote', () => {
  it('says what the clip looked like and that it was analysed that way', () => {
    const a = { ...snatchMock, detectedMovement: { movement: 'clean' as const, confidence: 0.9 }, movementUsed: 'clean' as const };
    expect(movementNote(a)).toBe('Looks like a clean, not a snatch. Analysed as a clean.');
  });

  it('asks when the detection was too weak to switch', () => {
    const a = { ...snatchMock, detectedMovement: { movement: 'clean' as const, confidence: 0.7 }, movementUsed: 'snatch' as const };
    expect(movementNote(a)).toBe('Looks like a clean, not a snatch. Keep as snatch?');
    const gym = { ...snatchMock, movement: 'kipping_pull_up' as const, detectedMovement: { movement: 'jerk' as const, confidence: 0.7 } };
    expect(movementNote(gym)).toBe('Looks like a jerk, not a kipping pull-up. Keep as kipping pull-up?');
  });

  it('is silent when the detection agrees, is unknown, or is missing', () => {
    expect(movementNote({ ...snatchMock, detectedMovement: { movement: 'snatch', confidence: 0.9 }, movementUsed: 'snatch' })).toBeNull();
    expect(movementNote({ ...snatchMock, detectedMovement: { movement: 'unknown', confidence: 0 } })).toBeNull();
    expect(movementNote(snatchMock)).toBeNull();
  });
});

describe('titles', () => {
  it('reads movement, load and rep', () => {
    expect(liftTitle(snatchMock, 2)).toBe('Snatch · 62.5 kg · rep 2');
    expect(liftTitle(snatchMock)).toBe('Snatch · 62.5 kg');
    expect(liftTitle({ ...snatchMock, loadKg: 67.5 }, 'miss')).toBe('Snatch · 67.5 kg · miss');
  });

  it('labels phases for chips', () => {
    expect(phaseLabel('first_pull')).toBe('1st pull');
    expect(phaseLabel('second_pull')).toBe('2nd pull');
  });
});

describe('evidence', () => {
  it('formats the hero number and the readout from the cue', () => {
    expect(heroValue(snatchMock.cue!)).toBe('6 cm');
    expect(evidenceReadout(snatchMock.cue!)).toBe('frame 422 · hip · 6 cm fwd · best 2 cm');
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
  it('ticks steps before the current one and pulses the current one', () => {
    expect(processingSteps(2)).toEqual([
      { label: 'Preparing your clip', state: 'done' },
      { label: 'Finding you', state: 'done' },
      { label: 'Following the bar', state: 'active' },
      { label: 'Following your body', state: 'todo' },
      { label: 'Drawing the lines', state: 'todo' },
    ]);
    expect(processingSteps(0, 'Tracking on your iPhone')[0]).toEqual({ label: 'Tracking on your iPhone', state: 'active' });
  });

  it('says the expected wait in minutes once it is one', () => {
    expect(formatWait(150)).toBe('about 2 min');
    expect(formatWait(90)).toBe('about 1 min');
    expect(formatWait(20)).toBe('about 20 s');
  });

});
