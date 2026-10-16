import type { Analysis, Measurement } from '../../analysis/types';
import { toLift } from '../../data/library';
import type { Lift as LiftRow } from '../../types/db';
import { cleanStreak, compareValues, faultFires, previousValue, retestVerdict, targetLine } from './retest';
import type { CueRecord, Lift, Session } from './types';

const meas = (id: string, value: number, status: Measurement['status'] = 'normal', unit: Measurement['unit'] = 'cm'): Measurement => ({
  id,
  label: id,
  value,
  unit,
  frame: 1,
  status,
  note: '',
});

const analysis = (id: string, measurements: Measurement[], cueFault: string | null = null, notes: string[] = []): Analysis =>
  ({
    version: 1,
    id,
    movement: 'snatch',
    video: { uri: '', width: 1, height: 1, fps: 30, frameCount: 1 },
    traceKind: 'bar',
    reps: [],
    bestRepIndex: 1,
    cue: cueFault ? ({ faultId: cueFault } as Analysis['cue']) : null,
    notes: notes.map((faultId) => ({ faultId, text: '', why: '', severity: 1, reps: 1 })),
    measurements,
    failure: null,
  }) as Analysis;

const cue: CueRecord = {
  id: 'c1',
  movement: 'snatch',
  text: 'Stay over the bar longer',
  metricId: 'bar_drift_hip',
  givenAt: '2026-10-01',
  status: 'trying',
  sessionsTarget: 6,
  before: { image: '' },
  after: { image: '' },
};

describe('compareValues', () => {
  it('calls a lower bar drift better, a higher one worse, and under 2 cm the same', () => {
    expect(compareValues('bar_drift_hip', 15, 9)).toBe('better');
    expect(compareValues('bar_drift_hip', 9, 15)).toBe('worse');
    expect(compareValues('bar_drift_hip', 9, 10.9)).toBe('same');
    expect(compareValues('bar_drift_hip', 9, 11)).toBe('worse');
  });

  it('flips for a metric where higher is better', () => {
    expect(compareValues('catch_depth', 3, 6)).toBe('better');
    expect(compareValues('catch_depth', 6, 3)).toBe('worse');
  });

  it('uses 0.03 s for timings and 3 degrees for angles', () => {
    expect(compareValues('turnover_time', 0.24, 0.22)).toBe('same');
    expect(compareValues('turnover_time', 0.24, 0.2)).toBe('better');
    expect(compareValues('press_out', 10, 8)).toBe('same');
    expect(compareValues('press_out', 10, 6)).toBe('better');
  });
});

describe('retestVerdict', () => {
  it('reads better with both numbers', () => {
    const v = retestVerdict('bar_drift_hip', 15, analysis('a', [meas('bar_drift_hip', 9)]));
    expect(v).toEqual({ kind: 'better', from: 15, to: 9, fires: false, text: 'Bar drift at hip 15 cm → 9 cm. Better.' });
  });

  it('reads same inside the noise band', () => {
    expect(retestVerdict('bar_drift_hip', 7, analysis('a', [meas('bar_drift_hip', 6, 'follows')])).text).toBe('Bar drift at hip 7 cm → 6 cm. Same.');
  });

  it('reads worse, and knows the fault still fires', () => {
    const v = retestVerdict('bar_drift_hip', 6, analysis('a', [meas('bar_drift_hip', 12, 'cue')], 'bar_drift_hip'));
    expect(v.kind).toBe('worse');
    expect(v.fires).toBe(true);
    expect(v.text).toBe('Bar drift at hip 6 cm → 12 cm. Worse.');
  });

  it('judges the cue it was given for even when another fault is the headline', () => {
    const v = retestVerdict('bar_drift_hip', 15, analysis('a', [meas('jump_forward', 9, 'cue'), meas('bar_drift_hip', 9)], 'jump_forward'));
    expect(v.text).toBe('Bar drift at hip 15 cm → 9 cm. Better.');
    expect(v.fires).toBe(false);
  });

  it('says so when the clip could not measure the cue', () => {
    expect(retestVerdict('bar_drift_hip', 6, analysis('a', [meas('jump_forward', 9)]))).toEqual({
      kind: 'not_measured',
      from: 6,
      to: null,
      fires: false,
      text: "Couldn't measure bar drift at hip in this clip.",
    });
    expect(retestVerdict('bar_drift_hip', 6, analysis('a', [meas('bar_drift_hip', 0, 'not_seen')])).kind).toBe('not_measured');
  });

  it('has nothing to compare with no earlier value', () => {
    expect(retestVerdict('bar_drift_hip', null, analysis('a', [meas('bar_drift_hip', 4)])).text).toBe('Bar drift at hip 4 cm. Nothing earlier to compare.');
  });
});

describe('faultFires', () => {
  it('fires as the headline, as a note, or as a measurement that follows', () => {
    expect(faultFires(analysis('a', [], 'x'), 'x')).toBe(true);
    expect(faultFires(analysis('a', [], 'y', ['x']), 'x')).toBe(true);
    expect(faultFires(analysis('a', [meas('x', 3, 'follows')]), 'x')).toBe(true);
    expect(faultFires(analysis('a', [meas('x', 3, 'normal')], 'y'), 'x')).toBe(false);
  });
});

const session = (id: string, date: string, drift: number, liftId?: string): Session => ({
  id,
  movement: 'snatch',
  date,
  liftId,
  values: { bar_drift_hip: drift },
});
const lift = (id: string, date: string, extra: Partial<Lift> = {}): Lift => ({ id, movement: 'snatch', date, status: 'done', analysisId: id, ...extra });

describe('previousValue', () => {
  // Lifts come newest first, so the same day is ordered by the list.
  const lifts = [lift('l3', '2026-10-11'), lift('l2', '2026-10-11'), lift('l1', '2026-10-08')];
  const sessions = [session('s1', '2026-10-08', 15, 'l1'), session('s2', '2026-10-11', 11, 'l2'), session('s3', '2026-10-11', 9, 'l3')];

  it('takes the newest session before the lift, never the lift itself', () => {
    expect(previousValue(cue, sessions, lifts, lifts[0])).toBe(11);
    expect(previousValue(cue, sessions, lifts, lifts[1])).toBe(15);
    expect(previousValue(cue, sessions, lifts, lifts[2])).toBeNull();
  });

  it('takes the newest session overall when the lift is not in the library yet', () => {
    expect(previousValue(cue, sessions, lifts)).toBe(9);
  });
});

describe('cleanStreak', () => {
  const clean = analysis('r-clean', [meas('bar_drift_hip', 4)]);
  const fired = analysis('r-fired', [meas('bar_drift_hip', 12, 'cue')], 'bar_drift_hip');
  const byId: Record<string, Analysis> = { 'r-clean': clean, 'r-fired': fired, 'r-clean2': { ...clean, id: 'r-clean2' } };

  it('counts the newest retests in a row where the fault did not fire', () => {
    const lifts = [
      lift('r-clean2', '2026-10-12', { retestCueId: 'c1' }),
      lift('r-clean', '2026-10-10', { retestCueId: 'c1' }),
      lift('r-fired', '2026-10-08', { retestCueId: 'c1' }),
      lift('other', '2026-10-09'),
    ];
    expect(cleanStreak(cue, lifts, (id) => byId[id])).toBe(2);
  });

  it('starts from the result on screen and stops at the first fire', () => {
    const lifts = [lift('r-fired', '2026-10-08', { retestCueId: 'c1' })];
    expect(cleanStreak(cue, lifts, (id) => byId[id], clean)).toBe(1);
    expect(cleanStreak(cue, lifts, (id) => byId[id], fired)).toBe(0);
  });
});

describe('targetLine', () => {
  it('shows the cue and the number to beat', () => {
    expect(targetLine(cue, 6)).toBe('Stay over the bar longer: bar drift at hip under 6\u00a0cm');
    expect(targetLine({ ...cue, metricId: 'catch_depth' }, 4)).toBe('Stay over the bar longer: catch depth over 4\u00a0cm');
    expect(targetLine(cue, null)).toBe('Stay over the bar longer');
  });
});

describe('toLift', () => {
  it('carries the cue a retest was filmed for', () => {
    const row = { id: 'l9', user_id: 'u', movement: 'snatch', load_kg: null, status: 'uploading', error: null, created_at: '2026-10-14T03:45:00Z', retest_cue_id: 'c1' } as LiftRow;
    expect(toLift(row, undefined).retestCueId).toBe('c1');
    expect(toLift({ ...row, retest_cue_id: null }, undefined).retestCueId).toBeUndefined();
  });
});
