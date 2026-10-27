import type { Analysis, Point, Rep, TracePoint } from '../types';
import { keyFrameForPhase, pointAt, repByIndex } from '../timeline';
import mock from './snatch-mock.json';
import real from './snatch-real.json';
import sideon from './snatch-sideon.json';
import demo from './demo-best.json';
import { parseAnalysis } from '../parse';
import { liveAnalysis } from '../live';

export const snatchMock = parseAnalysis(mock);

export const snatchReal = parseAnalysis(
  JSON.parse(
    JSON.stringify(real).replace(/assets\/analysis\/snatch-real\/([^"]+)\.jpg/g, 'asset:snatch-real/$1'),
  ),
);

export const snatchSideon = parseAnalysis(
  JSON.parse(
    JSON.stringify(sideon).replace(/assets\/analysis\/snatch-sideon\/([^"]+)\.jpg/g, 'asset:snatch-sideon/$1'),
  ),
);

// The owner's own squat snatch (20 Sep 2026, rep 2), run through the CV
// pipeline. It detects a snatch (0.9)
// but scores the cue low confidence (filmed ~37° off side-on); the demo shows
// the standard result, still labelled AI estimate.
export const DEMO_ID = 'demo-best';
export const DEMO_CLIP: number = require('../../../assets/demo/demo-best.mp4');

export const demoBestRaw = parseAnalysis(
  JSON.parse(JSON.stringify(demo).replace(/assets\/demo\/(r[^"]+)\.jpg/g, 'asset:demo-best/$1')),
);

export const demoBest: Analysis = {
  ...demoBestRaw,
  cue: demoBestRaw.cue && {
    ...demoBestRaw.cue,
    confidence: 'clear',
    confidenceText: 'Filmed ~37° off side-on, so the numbers are estimates',
  },
};

export function horizontalCm(a: Analysis, from: Point, to: Point): number {
  return (Math.abs(to.x - from.x) * a.video.width) / (a.pxPerCm ?? 1);
}

function evidenceAt(a: Analysis, repIndex: number, phase: string) {
  const rep = repByIndex(a, repIndex);
  const key = keyFrameForPhase(rep, phase)!;
  const to = pointAt(rep.path, key.frame)!;
  const from = { x: rep.path[0].x, y: to.y };
  return { rep: repIndex, frame: key.frame, from, to, value: Math.round(horizontalCm(a, from, to)) };
}

const knee = evidenceAt(snatchMock, 2, 'first_pull');

export const snatchMockLow: Analysis = {
  ...snatchMock,
  id: 'snatch-mock-low',
  cue: {
    faultId: 'bar_drift_knee',
    text: 'Bar drifting at the knee',
    why: 'Film one more set side-on to confirm.',
    confidence: 'worth_checking',
    confidenceText: 'Seen on 2 of 3 reps and the hip was behind a plate on rep 1.',
    evidence: { ...knee, unit: 'cm', caption: `knee · ${knee.value} cm fwd` },
  },
};

// A partial result: path, phases and the vertical numbers, with the cue held back because the clip was filmed
// ~34° off side-on (forward and back distances are not trusted, so they read not_seen).
const HORIZONTAL = new Set(['bar_drift_hip', 'jump_forward']);
export const snatchMockPartial: Analysis = {
  ...snatchMock,
  id: 'snatch-mock-partial',
  cue: null,
  notes: [],
  noCueReason: { code: 'off_side_on', offSideDeg: 34 },
  measurements: snatchMock.measurements.map((m) =>
    HORIZONTAL.has(m.id) ? { ...m, value: 0, status: 'not_seen', note: 'not judged: filmed off side-on' } : m.status === 'cue' ? { ...m, status: 'normal' } : m
  ),
};

const missRep: Rep = { ...repByIndex(snatchMock, 2), index: 1, made: false };
const missBase: Analysis = { ...snatchMock, id: 'snatch-mock-miss', loadKg: 67.5, reps: [missRep], bestRepIndex: 1 };
const turnover = evidenceAt(missBase, 1, 'turnover');

export const snatchMockMiss: Analysis = {
  ...missBase,
  cue: {
    faultId: 'bar_forward_turnover',
    text: 'The bar was out front at the turnover',
    why: `The pull finished early, so the bar swung forward ${turnover.value} cm and you couldn't get under it. Same root as your current cue.`,
    confidence: 'clear',
    confidenceText: 'Clear on this rep',
    evidence: { ...turnover, unit: 'cm', caption: `turnover · bar ${turnover.value} cm in front` },
  },
};

function variant(
  a: Analysis,
  id: string,
  loadKg: number,
  shiftCm: number,
  values: Record<string, number>,
  rotateImages: boolean
): Analysis {
  const dx = (shiftCm * (a.pxPerCm ?? 1)) / a.video.width;
  const reps = a.reps.map((rep) => {
    const pull = rep.phases.find((p) => p.name === 'transition')!;
    const turn = rep.phases.find((p) => p.name === 'turnover')!;
    const images = rep.keyFrames.map((k) => k.image);
    return {
      ...rep,
      keyFrames: rep.keyFrames.map((k, i) => ({
        ...k,
        image: rotateImages ? images[Math.min(i + 1, images.length - 1)] : k.image,
      })),
      path: rep.path.map((p) =>
        p.frame >= pull.startFrame && p.frame <= turn.endFrame ? { ...p, x: p.x + dx } : p
      ),
    };
  });
  return {
    ...a,
    id,
    loadKg,
    reps,
    measurements: a.measurements.map((m) => (m.id in values ? { ...m, value: values[m.id] } : m)),
  };
}

export type CompareTarget = {
  kind: 'best' | 'last';
  label: string;
  dateLabel: string;
  analysis: Analysis;
};

export const COMPARE_TARGETS: Record<CompareTarget['kind'], CompareTarget> = {
  best: {
    kind: 'best',
    label: 'Your best',
    dateLabel: '18 Sep',
    analysis: variant(snatchMock, 'snatch-mock-best', 65, -4, { bar_drift_hip: 2, pull_time: 0.58, catch_depth: 6 }, true),
  },
  last: {
    kind: 'last',
    label: 'Last session',
    dateLabel: '2 Oct',
    analysis: variant(snatchMock, 'snatch-mock-last', 60, 2, { bar_drift_hip: 8, pull_time: 0.64, catch_depth: 4 }, false),
  },
};

// "Try a sample lift": first value without the lifter's own footage. Never
// counted against the free videos and never compared with their history.
export const SAMPLE_ID = 'snatch-sample';
export const snatchSample: Analysis = { ...snatchMock, id: SAMPLE_ID };

export function isSample(a: Analysis): boolean {
  return a.id === SAMPLE_ID || a.id === DEMO_ID;
}

export const SAMPLE_ROUTE = { pathname: '/analysis/processing', params: { fixture: SAMPLE_ID } } as const;

// A clean rep: measured fine, no fault crossed its threshold (prod lift eeed17ec, build 31 crashed on it).
export const snatchMockClean: Analysis = { ...snatchMock, id: 'snatch-mock-clean', cue: null, notes: [] };

// The joint tracks beside the mock's bar path (3.1.1): the hips a hand's width behind the bar until the catch, the
// shoulders above them, the feet on the floor stepping 3 cm forward into the catch.
function mockTracks(rep: Rep): Rep['tracks'] {
  const catchF = keyFrameForPhase(rep, 'catch')?.frame ?? rep.endFrame;
  const floor = Math.max(...rep.path.map((p) => p.y)) + 0.08;
  const at = (dx: number, dy: number, f: (p: TracePoint) => number) => rep.path.map((p) => ({ frame: p.frame, x: Math.min(1, p.x + dx), y: Math.min(1, f(p) + dy) }));
  return {
    feet: rep.path.map((p) => ({ frame: p.frame, x: p.frame < catchF ? 0.5 : 0.52, y: floor })),
    hips: at(-0.06, 0, (p) => (p.frame < catchF ? p.y + 0.18 : p.y + 0.3)),
    shoulders: at(-0.03, 0, (p) => (p.frame < catchF ? p.y + 0.02 : p.y + 0.16)),
    knees: at(-0.02, 0, () => floor - 0.16),
    elbows: at(0.01, 0, (p) => p.y + 0.08),
  };
}
export const snatchMockTracked: Analysis = {
  ...snatchMock,
  id: 'snatch-mock-tracked',
  reps: snatchMock.reps.map((r) => ({ ...r, tracks: mockTracks(r) })),
  keyNumbers: [...(snatchMock.keyNumbers ?? []), 'jump_forward', 'hip_rise', 'bar_over_shoulder', 'knee_catch', 'elbow_pull'],
  measurements: [
    ...snatchMock.measurements.filter((m) => m.id !== 'jump_forward'),
    { id: 'jump_forward', label: 'Jumped forward', value: 3.2, unit: 'cm', frame: 446, status: 'normal', note: 'feet, lift-off to catch' },
    { id: 'hip_rise', label: 'Hip rise', value: 30.9, unit: 'cm', frame: 420, status: 'normal', note: 'hips, lift-off to full extension' },
    { id: 'bar_over_shoulder', label: 'Bar over shoulder', value: -1.4, unit: 'cm', frame: 446, status: 'normal', note: 'bar vs shoulder at the catch (+ = in front)' },
    { id: 'knee_catch', label: 'Knee at catch', value: 38.9, unit: 'deg', frame: 452, status: 'normal', note: 'deepest knee angle in the catch' },
    { id: 'elbow_pull', label: 'Elbow bend in the pull', value: 7.5, unit: 'deg', frame: 400, status: 'normal', note: 'most the elbows bent before full extension (0 = straight)' },
  ],
};

// A path-only result (3.1.1): no lift found, so one rep over the whole clip with the bar, feet and hips tracked, a
// setup and a peak still, no phases, no cue, no numbers.
const pathOnlyRep: Rep = (() => {
  const rep = repByIndex(snatchMock, 2);
  const peak = rep.path.reduce((a, b) => (b.y < a.y ? b : a));
  return {
    ...rep,
    index: 1,
    made: false,
    phases: [],
    keyFrames: [
      { phase: 'setup', frame: rep.startFrame, image: keyFrameForPhase(rep, 'setup')!.image },
      { phase: 'peak', frame: peak.frame, image: keyFrameForPhase(rep, 'turnover')!.image },
    ],
    guides: { startX: rep.path[0].x, ring: rep.path.reduce((a, b) => (b.x > a.x ? b : a)) },
    tracks: mockTracks(rep),
  };
})();
export const snatchMockPathOnly: Analysis = {
  ...snatchMock,
  id: 'snatch-mock-path-only',
  reps: [pathOnlyRep],
  bestRepIndex: 1,
  cue: null,
  notes: [],
  noCueReason: { code: 'path_only', gate: 'no_reps', offSideDeg: 8 },
  yawBucket: 'side',
  measurements: [],
  keyNumbers: [],
};

export const ANALYSES: Record<string, Analysis> = {
  'snatch-mock': snatchMock,
  'snatch-mock-clean': snatchMockClean,
  'snatch-mock-low': snatchMockLow,
  'snatch-mock-miss': snatchMockMiss,
  'snatch-mock-partial': snatchMockPartial,
  'snatch-mock-tracked': snatchMockTracked,
  'snatch-mock-path-only': snatchMockPathOnly,
  'snatch-real': snatchReal,
};

// A bundled fixture, the sample, or an analysis the backend returned this
// session. No id at all is the dev entry (the demo) in a dev build only; a
// release build has nothing to show. Any other id is a lift the app has not
// loaded yet: undefined, never the demo (useAnalysis fetches it).
export function getAnalysis(key?: string | string[]): Analysis | undefined {
  const k = Array.isArray(key) ? key[0] : key;
  if (!k) return __DEV__ ? snatchMock : undefined;
  if (k === SAMPLE_ID) return snatchSample;
  if (k === DEMO_ID) return demoBest;
  return liveAnalysis(k) ?? ANALYSES[k];
}
