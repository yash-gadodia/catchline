import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import { analyseTrace, planFromMisses } from './analyseTrace';
import { butter2 } from './filter';
import { pyFixed, pyRound } from './num';
import { Fixture, compare, runFixture } from './parity';
import { Trace, parseTraceJson } from './trace';

const DIR = join(__dirname, 'fixtures');
const TRACES = join(__dirname, '..', '..', '..', 'cv', 'tests', 'fixtures', 'traces');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.expected.json.gz'))
  .sort();
const load = (f: string) => JSON.parse(gunzipSync(readFileSync(join(DIR, f))).toString()) as Fixture;
const loadTrace = (name: string) => parseTraceJson(gunzipSync(readFileSync(join(TRACES, `${name}.trace.json.gz`))).toString()) as Trace;

describe('device measurement matches the Python pipeline on the committed lift traces', () => {
  it('covers the snatch, clean, jerk, kipping pull-up and bar muscle-up code', () => {
    const fx = files.map(load);
    expect(new Set(fx.map((f) => f.movement))).toEqual(new Set(['snatch', 'clean', 'jerk', 'kipping_pull_up', 'bar_muscle_up']));
    // forced fixtures reach the clean, jerk and muscle-up rep code on clips of other movements
    expect(fx.filter((f) => f.forced).map((f) => (f.expected.analysis as { reps: unknown[] }).reps.length)).toEqual([2, 2, 1, 1, 1, 1]);
  });

  it.each(files)('%s', (f) => {
    const fx = load(f);
    const { diffs } = runFixture(fx, loadTrace(fx.name));
    for (const d of Object.values(diffs)) expect(d.mismatches).toEqual([]);
  });

  it('analyseTrace gives the Python analysis for a trace as recorded', () => {
    for (const fx of files.map(load).filter((x) => !x.forced)) {
      const a = analyseTrace(loadTrace(fx.name), fx.movement);
      expect(compare(fx.expected.analysis, a).mismatches).toEqual([]);
    }
  });

  it('notices a changed plate fit', () => {
    const fx = load('2026-10-05_21B27BAF.mov.snatch.expected.json.gz');
    const trace = loadTrace(fx.name);
    for (const outs of Object.values(trace.calls.refine_plate)) {
      for (const o of outs as ({ axes: { $t: number[] } } | null)[]) if (o) o.axes.$t = o.axes.$t.map((v) => v * 1.2);
    }
    const { diffs } = runFixture(fx, trace);
    expect(diffs.analysis.mismatches.some((m) => m.startsWith('.pxPerCm'))).toBe(true);
  });

  it('refuses a trace of another version', () => {
    expect(() => analyseTrace({ traceVersion: 2 }, 'snatch')).toThrow('trace version 2');
  });
});

describe('planFromMisses asks the native pixel stages for what a replay could not answer', () => {
  const name = '2026-10-05_21B27BAF.mov';
  const strip = (keys: string[]) => {
    const t = loadTrace(name);
    for (const k of keys) delete t.calls[k];
    return t;
  };

  it('is empty on a complete trace, except the stills', () => {
    const plan = planFromMisses(loadTrace(name), 'snatch');
    expect(plan.misses).toEqual([]);
    expect([plan.windows, plan.plates, plan.tracks]).toEqual([[], [], []]);
    expect(plan.keyframes.map((k) => k.name)).toEqual([
      'r1-1-setup.jpg',
      'r1-2-first_pull.jpg',
      'r1-3-transition.jpg',
      'r1-4-second_pull.jpg',
      'r1-5-turnover.jpg',
      'r1-6-catch.jpg',
      'r1-7-recovery.jpg',
    ]);
  });

  it('after pose alone, wants the rep window and the setup plate frame', () => {
    const plan = planFromMisses(strip(['frames', 'stabilise', 'find_plates', 'refine_plate', 'track_plate']), 'snatch');
    expect(plan.windows).toEqual([{ s0: 10, count: 136 }]);
    // lift-off reads a frame later on affines composed from the camera path than on the window's own stabilisation,
    // so the seed frame settles once the window comes back
    expect(plan.plates.map((p) => p.frame)).toEqual([57]);
    expect(plan.plates[0].bodyH).toBeGreaterThan(0);
    expect(plan.tracks).toEqual([]);
    expect(plan.misses.slice(0, 3)).toEqual(['frames 10+136', 'stabilise 10+136', 'find_plates 57']);
  });

  it('with the plates found, wants the sample frames and the near plate track', () => {
    const full = loadTrace(name);
    const t = strip(['track_plate']);
    t.calls.find_plates = { '56': full.calls.find_plates['56'] };
    const plan = planFromMisses(t, 'snatch');
    expect(plan.windows).toEqual([]);
    expect(plan.plates.map((p) => p.frame)).toEqual([35, 38, 41, 44, 47, 50, 53]);
    expect(plan.tracks).toHaveLength(1);
    expect(plan.tracks[0]).toMatchObject({ s0: 10, n: 136, start: 46 });
    expect(plan.tracks[0].plate.axes[0]).toBeGreaterThan(0);
  });
});

describe('numerics', () => {
  it('rounds the exact binary value half to even, as Python does', () => {
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(0.375, 2)).toBe(0.38);
    expect(pyRound(2.675, 2)).toBe(2.67);
    expect(pyFixed(2.5, 0)).toBe('2');
    expect(pyFixed(-0.4, 0)).toBe('-0');
    expect(pyFixed(12.3456, 1)).toBe('12.3');
  });

  it('designs the same Butterworth filter as scipy', () => {
    const { b, a } = butter2(6 / 15);
    const d = compare([0.20657208, 0.41314417, 0.20657208, 1, -0.36952738, 0.19581571], [...b, ...a]);
    expect(d.maxRel).toBeLessThan(5e-8);
  });

  it('parses the NaN Python writes into a trace', () => {
    expect(parseTraceJson('{"a": [NaN, 1.5, "NaN"], "b": -Infinity}')).toEqual({ a: [NaN, 1.5, 'NaN'], b: -Infinity });
  });
});
