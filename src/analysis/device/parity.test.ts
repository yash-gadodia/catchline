import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import { analyseTrace, analyseTraceResult, planFromMisses } from './analyseTrace';
import { butter2 } from './filter';
import { pyFixed, pyRound } from './num';
import { Fixture, compare, headline, runFixture } from './parity';
import { Trace, parseTraceJson } from './trace';

const DIR = join(__dirname, 'fixtures');
const TRACES = join(__dirname, '..', '..', '..', 'cv', 'tests', 'fixtures', 'traces');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.expected.json.gz'))
  .sort();
const load = (f: string) => JSON.parse(gunzipSync(readFileSync(join(DIR, f))).toString()) as Fixture;
const loadTrace = (name: string) => parseTraceJson(gunzipSync(readFileSync(join(TRACES, `${name}.trace.json.gz`))).toString()) as Trace;

// 3.1 measures in the body frame (design 2.1, 3.1), so Python stays the reference only for what comes before the
// measurement: the world keypoints, the movement signals, the detector and what the replay asks the video for.
describe('the device analysis on the committed lift traces', () => {
  it('matches the Python pipeline up to the measurement', () => {
    for (const f of files) {
      const { diffs } = runFixture(load(f), loadTrace(load(f).name));
      expect([f, diffs.world.mismatches, diffs.signals.mismatches, diffs.detected.mismatches, diffs.misses.mismatches]).toEqual([f, [], [], [], []]);
    }
  });

  it('judges the gymnastics clip (about 30 deg off side-on) by cue type', () => {
    const got = files.map((f) => {
      const a = runFixture(load(f), loadTrace(load(f).name)).analysis as { cue: { confidence: string } | null };
      return `${f.split('.expected')[0]} ${headline(a)} ${a.cue?.confidence ?? ''}`.trim();
    });
    expect(got).toEqual([
      '2026-09-22_A1F2F738.mov.bar_muscle_up fail:no_reps',
      '2026-09-22_A1F2F738.mov.bar_muscle_up.forced cue:bmu_early_pull worth_checking',
      '2026-09-22_A1F2F738.mov.kipping_pull_up cue:leg_kip worth_checking',
      '2026-09-22_A1F2F738.mp4.bar_muscle_up fail:no_reps',
      '2026-09-22_A1F2F738.mp4.bar_muscle_up.forced cue:bmu_early_pull clear',
      '2026-09-22_A1F2F738.mp4.kipping_pull_up cue:leg_kip worth_checking',
    ]);
  });

  it('sizes a snatch from the body: a plate fit 20% bigger changes nothing', () => {
    const trace = loadTrace('2026-10-05_21B27BAF.mov');
    const before = analyseTraceResult(trace, 'snatch');
    for (const outs of Object.values(trace.calls.refine_plate)) {
      for (const o of outs as ({ axes: { $t: number[] } } | null)[]) if (o) o.axes.$t = o.axes.$t.map((v) => v * 1.2);
    }
    const after = analyseTraceResult(trace, 'snatch');
    expect(before.reps.map((r) => r.scale_method)).toEqual(['body segments']);
    expect(after.analysis.pxPerCm).toBe(before.analysis.pxPerCm);
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

  it('with the plates found, wants the sample frames and no plate track (plates on the setup frames only)', () => {
    const full = loadTrace(name);
    const t = strip(['track_plate']);
    t.calls.find_plates = { '56': full.calls.find_plates['56'] };
    const plan = planFromMisses(t, 'snatch');
    expect(plan.windows).toEqual([]);
    expect(plan.plates.map((p) => p.frame)).toEqual([35, 38, 41, 44, 47, 50, 53]);
    expect(plan.tracks).toEqual([]);
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
