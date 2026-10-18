import parity from './rules-parity.json';
import {
  ALTERNATES,
  CUES,
  RULES,
  chooseCue,
  chooseSetCue,
  confidence,
  cueConfidence,
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
};

const total = Object.values(P).reduce((n, cases) => n + cases.length, 0);

describe('rules.ts matches rules.py on the parity fixture', () => {
  it('covers every case kind', () => {
    expect(total).toBe(8032);
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
  it('confidence', () => P.confidence.forEach((c) => expect([c, confidence(c.fid, c.sev, c.off)]).toEqual([c, c.out])));
  it('repConfidence', () =>
    P.repConfidence.forEach((c) => expect([c, repConfidence(c.conf, c.seen, c.total)]).toEqual([c, c.out])));
  it('whySentence', () =>
    P.whySentence.forEach((c) => expect([c, whySentence(c.fid, c.values, c.detail)]).toEqual([c, c.out])));
  it('cueConfidence', () =>
    P.cueConfidence.forEach((c) =>
      expect([c, cueConfidence(c.fid, c.sev, c.off, c.seen, c.total, c.scaleOk)]).toEqual([c, c.out])));
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
