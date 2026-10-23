import parity from './rules-parity.json';
import {
  ALTERNATES,
  CUE_TYPE,
  CUES,
  RULES,
  chooseCue,
  chooseSetCue,
  confidence,
  confirmedOffSide,
  cueConfidence,
  cueType,
  openAngleDeg,
  yawBucket,
  yawErrDeg,
  onScreen,
  fired,
  fmt,
  gate,
  notes,
  pyRound,
  repConfidence,
  severity,
  whySentence,
  type Confidence,
  type Rep,
  type Values,
} from './rules';

type Case<I> = I & { out: unknown };
const P = parity as unknown as {
  fmt: Case<{ value: number; unit: string }>[];
  severity: Case<{ fid: string; v: number }>[];
  fired: Case<{ values: Values }>[];
  gate: Case<{ ids: string[] }>[];
  chooseCue: Case<{ values: Values }>[];
  chooseSetCue: Case<{ movement: string; reps: Values[] }>[];
  notes: Case<{ movement: string; reps: Rep[]; cue: { faultId: string; text: string } | null; limit: number }>[];
  confidence: Case<{ fid: string; sev: number; off: number | null }>[];
  repConfidence: Case<{ conf: Confidence; seen: number; total: number }>[];
  whySentence: Case<{ fid: string; values: Values; detail: Record<string, number | string | null> | null }>[];
  cueConfidence: Case<{ fid: string; sev: number; off: number | null; seen: number; total: number; scaleOk: boolean }>[];
  onScreen: Case<{ values: Values; off: number | null }>[];
  confirmedOffSide: Case<{ fid: string; sev: number; off: number | null }>[];
};

const total = Object.values(P).reduce((n, cases) => n + cases.length, 0);

// 3.1 judges off side-on by cue type (design 3.1), so rules.py stays the reference only up to 20 deg
const sideOn = <T extends { off: number | null }>(cases: T[]) => cases.filter((c) => c.off === null || c.off <= 20);

describe('rules.ts matches rules.py on the parity fixture', () => {
  it('covers every case kind', () => {
    expect(total).toBe(11519);
  });
  it('fmt', () => P.fmt.forEach((c) => expect([c, fmt(c.value, c.unit)]).toEqual([c, c.out])));
  it('severity', () => P.severity.forEach((c) => expect([c, severity(c.fid, c.v)]).toEqual([c, c.out])));
  it('fired', () => P.fired.forEach((c) => expect([c, fired(c.values)]).toEqual([c, c.out])));
  it('gate', () => P.gate.forEach((c) => expect([c, [...gate(c.ids)].sort()]).toEqual([c, c.out])));
  it('chooseCue', () => P.chooseCue.forEach((c) => expect([c, chooseCue(c.values)]).toEqual([c, c.out])));
  it('chooseSetCue', () =>
    P.chooseSetCue.forEach((c) => expect([c, chooseSetCue(c.movement, c.reps)]).toEqual([c, c.out])));
  it('notes', () =>
    P.notes.forEach((c) => expect([c, notes(c.movement, c.reps, c.cue, c.limit)]).toEqual([c, c.out])));
  it('confidence', () => sideOn(P.confidence).forEach((c) => expect([c, confidence(c.fid, c.sev, c.off)]).toEqual([c, c.out])));
  it('repConfidence', () =>
    P.repConfidence.forEach((c) => expect([c, repConfidence(c.conf, c.seen, c.total)]).toEqual([c, c.out])));
  it('whySentence', () =>
    P.whySentence.forEach((c) => expect([c, whySentence(c.fid, c.values, c.detail)]).toEqual([c, c.out])));
  it('cueConfidence', () =>
    sideOn(P.cueConfidence).forEach((c) =>
      expect([c, cueConfidence(c.fid, c.sev, c.off, c.seen, c.total, c.scaleOk)]).toEqual([c, c.out])));
  it('onScreen', () => sideOn(P.onScreen).forEach((c) => expect([c, onScreen(c.values, c.off)]).toEqual([c, c.out])));
  it('confirmedOffSide', () =>
    sideOn(P.confirmedOffSide).forEach((c) => expect([c, confirmedOffSide(c.fid, c.sev, c.off)]).toEqual([c, c.out])));
});

describe('off side-on, each cue type is judged as far as one camera can see it', () => {
  it('types every rule', () => {
    expect(Object.keys(RULES).filter((f) => !(f in CUE_TYPE))).toEqual([]);
    expect(['early_arm_bend', 'hips_rise_early', 'incomplete_extension', 'bar_forward_off_hips'].map(cueType)).toEqual([
      'timing', 'vertical', 'joint', 'forward',
    ]);
  });

  it('reads the yaw error off the design table and buckets the yaw', () => {
    expect([10, 20, 25, 45, 53, 60, 70].map(yawErrDeg)).toEqual([3, 3, 4, 7, 9, 12, 15]);
    expect([null, 12, 33, 50, 65].map(yawBucket)).toEqual([null, 'side', '20-45', '45-60', 'past_60']);
  });

  it('keeps timing and vertical cues at any yaw, "clear" only under 30 deg', () => {
    expect([10, 25, 40, 65].map((off) => confidence('early_arm_bend', 1.6, off))).toEqual(['clear', 'clear', 'worth_checking', 'worth_checking']);
    expect([25, 65].map((off) => confidence('hips_rise_early', 1.1, off))).toEqual(['worth_checking', 'worth_checking']);
    expect(onScreen({ early_arm_bend: 0.2, bar_crash: 30 }, 65)).toEqual({ early_arm_bend: 0.2, bar_crash: 30 });
  });

  it('corrects a forward distance for the yaw less its error to 45 deg and drops it past 45', () => {
    const at = (off: number) => onScreen({ bar_forward_off_hips: 20 }, off).bar_forward_off_hips as number;
    expect(at(30)).toBeCloseTo((20 * Math.cos(Math.PI / 6)) / Math.cos((25 * Math.PI) / 180), 6);
    expect(at(45)).toBeCloseTo((20 * Math.cos(Math.PI / 4)) / Math.cos((38 * Math.PI) / 180), 6);
    expect([46, 50, 61].map(at)).toEqual([null, null, null]);
    expect(onScreen({ press_out: 20, incomplete_extension: 12 }, 50)).toEqual({ press_out: null, incomplete_extension: 8 });
  });

  it('opens a bent joint by the design table: a 70 deg knee reads 76 at 45 deg, a 120 reads 136', () => {
    expect([openAngleDeg(45, 70), openAngleDeg(45, 120), openAngleDeg(0, 120), openAngleDeg(null, 70)]).toEqual([6, 16, 0, 0]);
    expect(openAngleDeg(45, 65)).toBe(6);
    expect(openAngleDeg(37.5, 95)).toBeCloseTo((4.5 + 11.5) / 2, 6);
  });

  it('lets a forward cue through off side-on only once it cleared on the yaw-aware value, never past 45', () => {
    expect([30, 45, 55, 61].map((off) => cueConfidence('bar_forward_off_hips', 1.2, off, 2, 2, true))).toEqual(['worth_checking', 'worth_checking', 'low', 'low']);
    expect([30, 55].map((off) => confirmedOffSide('early_arm_bend', 1.2, off))).toEqual([false, false]);
    expect(cueConfidence('bar_forward_off_hips', 0.9, 30, 2, 2, true)).toBe('low');
    expect(confirmedOffSide('early_arm_bend', 1.2, 30)).toBe(false);
  });
});

describe('pyRound', () => {
  it('rounds exact ties to even like Python', () => {
    expect([0.5, 1.5, 2.5, -2.5, 0.125, 0.375, 1.005].map((x, i) => pyRound(x, i < 4 ? 0 : 2))).toEqual([
      0, 2, 2, -2, 0.12, 0.38, 1.0,
    ]);
  });
});

describe('cue alternates', () => {
  const all = Object.entries(ALTERNATES);
  it('has 3 to 5 alternates for every cued fault, each with a catalogue source', () => {
    expect(all.map(([f]) => f).sort()).toEqual(Object.keys(CUES).sort());
    for (const [, alts] of all) {
      expect(alts.length).toBeGreaterThanOrEqual(3);
      expect(alts.length).toBeLessThanOrEqual(5);
      for (const a of alts) expect(a.source).toMatch(/^(snatch|clean|jerk|kipping_pull_up|bar_muscle_up|kipping_hspu)\/\w+$/);
    }
  });
  it('keeps every alternate at 8 words or fewer, distinct from the primary, with no injury or diagnosis words', () => {
    const long = all.flatMap(([, alts]) => alts.filter((a) => a.text.split(/\s+/).length > 8).map((a) => a.text));
    expect(long).toEqual([]);
    const banned = all.flatMap(([, alts]) => alts.filter((a) => /injur|diagnos|pain|hurt/i.test(a.text)).map((a) => a.text));
    expect(banned).toEqual([]);
    const dupes = all.filter(([f, alts]) => alts.some((a) => a.text === CUES[f]));
    expect(dupes).toEqual([]);
  });
  it('only cues faults the rules measure', () => {
    expect(Object.keys(CUES).every((f) => f in RULES)).toBe(true);
  });
});
