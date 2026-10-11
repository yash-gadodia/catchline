import type { Measurement } from './types';
import {
  compareRows,
  doneTitle,
  evidenceReadout,
  fmt,
  heroValue,
  liftTitle,
  measurementReadout,
  phaseLabel,
  processingSteps,
  signedCm,
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
