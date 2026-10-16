import type { Cue, Measurement } from './types';
import {
  compareRows,
  confidenceLine,
  doneTitle,
  filmedAtAngle,
  evidenceReadout,
  fmt,
  formatWait,
  heroValue,
  liftTitle,
  measurementReadout,
  movementNote,
  peakSpeed,
  phaseLabel,
  processingSteps,
  signedCm,
  speedText,
  syncCaption,
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

describe('measurementReadout', () => {
  it('marks the cue', () => {
    expect(measurementReadout(m({ value: 0.12, unit: 's', note: 'before bar', status: 'cue' }))).toBe(
      '0.12 s · before bar · the cue'
    );
  });

  it('says not seen without a number', () => {
    expect(measurementReadout(m({ status: 'not_seen' }))).toBe('not seen');
  });

  it('shows a best instead of "within normal" when there is one', () => {
    expect(measurementReadout(m({ value: 0.21, unit: 's', best: 0.19 }))).toBe('0.21 s · best 0.19');
    expect(measurementReadout(m({ value: 3 }))).toBe('3 cm · within normal');
  });

  it('explains a follow-on fault', () => {
    expect(measurementReadout(m({ value: 6, best: 2, status: 'follows' }))).toBe('6 cm · follows from above');
  });

  it('gives bar speed two decimals', () => {
    expect(measurementReadout(m({ value: 1.8, unit: 'm/s', note: 'peak upward speed in the pull' }))).toBe(
      '1.80 m/s · peak upward speed in the pull · within normal'
    );
  });
});

describe('bar speed', () => {
  it('always shows two decimals', () => {
    expect(speedText(1.8)).toBe('1.80 m/s');
    expect(speedText(1.836)).toBe('1.84 m/s');
    expect(speedText(2)).toBe('2.00 m/s');
  });

  it('reads the clip peak, and nothing when it was not measured or not sent', () => {
    const a = (measurements: Measurement[]) => ({ measurements }) as Parameters<typeof peakSpeed>[0];
    expect(peakSpeed(a([m({ id: 'bar_speed', value: 1.82, unit: 'm/s' })]))).toBeNull();
    expect(peakSpeed(a([m({ id: 'bar_speed', value: 1.82, unit: 'm/s' })]), true)).toBe('1.82 m/s');
    expect(peakSpeed(a([m({ id: 'bar_speed', value: 0, unit: 'm/s', status: 'not_seen' })]), true)).toBeNull();
    expect(peakSpeed(a([m({ value: 3 })]), true)).toBeNull();
  });
});

describe('compareRows', () => {
  const today = [m({ id: 'a', label: 'A', value: 6 }), m({ id: 'b', label: 'B', value: 0.59, unit: 's' }), m({ id: 'c', label: 'C', value: 4 })];
  const best = [m({ id: 'a', value: 2 }), m({ id: 'b', value: 0.58, unit: 's' }), m({ id: 'c', value: 6 })];

  it('gives a signed delta, or "same" within 5 percent, with no arrows', () => {
    expect(compareRows(today, best, 'best', ['a', 'b', 'c'])).toEqual([
      { id: 'a', label: 'A', value: '6 cm', delta: '+4 vs best' },
      { id: 'b', label: 'B', value: '0.59 s', delta: 'same as best' },
      { id: 'c', label: 'C', value: '4 cm', delta: '−2 vs best' },
    ]);
  });

  it('skips metrics missing on either side', () => {
    expect(compareRows(today, [best[0]], 'last', ['a', 'b'])).toEqual([
      { id: 'a', label: 'A', value: '6 cm', delta: '+4 vs last' },
    ]);
  });
});

describe('processing', () => {
  it('ticks steps before the current one and pulses the current one', () => {
    expect(processingSteps(snatchMock, 2)).toEqual([
      { label: 'Found the bar', state: 'done' },
      { label: '3 reps', state: 'done' },
      { label: 'Finding your phases', state: 'active' },
      { label: 'Comparing to your best', state: 'todo' },
      { label: 'Choosing one cue', state: 'todo' },
    ]);
  });

  it('says the expected wait in minutes once it is one', () => {
    expect(formatWait(150)).toBe('about 2 min');
    expect(formatWait(90)).toBe('about 1 min');
    expect(formatWait(20)).toBe('about 20 s');
  });

  it('looks for hips on gymnastics', () => {
    expect(processingSteps({ ...snatchMock, traceKind: 'hip' }, 0)[0].label).toBe('Found your hips');
  });

  it('summarises when done', () => {
    expect(doneTitle(snatchMock)).toBe('Done. 3 reps, one cue.');
    expect(doneTitle({ ...snatchMock, cue: null, reps: snatchMock.reps.slice(0, 1) })).toBe('Done. 1 rep.');
  });
});

describe('compare captions', () => {
  it('names the sync point and frames', () => {
    expect(syncCaption('transition', 422, 102)).toBe('synced at the hip · frame 422 vs 102');
  });

  it('signs centimetre deltas', () => {
    expect(signedCm(3.6)).toBe('+4 cm');
    expect(signedCm(-2.2)).toBe('-2 cm');
    expect(signedCm(0)).toBe('0 cm');
  });
});

describe('confidenceLine', () => {
  const cue = (confidence: Cue['confidence'], confidenceText: string): Cue => ({ ...snatchMock.cue!, confidence, confidenceText });

  it('maps the three confidence levels to plain bands, with the reason when not high', () => {
    expect(confidenceLine(cue('clear', 'Clear on all 3 reps'))).toBe('Confidence: high');
    expect(confidenceLine(cue('worth_checking', 'Seen on 2 of 3 reps and the hip was behind a plate on rep 1.'))).toBe(
      'Confidence: medium · bar partly hidden, seen on 2 of 3 reps'
    );
    expect(confidenceLine(cue('low', 'Seen on 1 of 2 reps, filmed ~36° off side-on: film from the side to confirm'))).toBe(
      'Confidence: low · filmed at an angle, seen on 1 of 2 reps'
    );
    expect(confidenceLine(cue('worth_checking', 'Seen on 1 of 1 reps'))).toBe('Confidence: medium · one rep only');
    expect(confidenceLine(cue('low', 'Something new'))).toBe('Confidence: low');
  });

  it('knows when the camera angle is the reason', () => {
    expect(filmedAtAngle(cue('low', 'Seen on 1 of 2 reps, filmed ~36° off side-on: film from the side to confirm'))).toBe(true);
    expect(filmedAtAngle(cue('worth_checking', 'Seen on 2 of 3 reps'))).toBe(false);
  });
});
