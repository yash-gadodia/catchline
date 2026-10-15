import type { Analysis, Point, Rep } from '../types';
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

// The owner's own snatch (prod lift 4d50a976, 15 Oct 2026), bystanders blurred.
// The worker ran it as a snatch but scored it low confidence (filmed ~43° off
// side-on); the demo shows the standard result, still labelled AI estimate.
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
    confidenceText: 'Filmed ~43° off side-on, so the numbers are estimates',
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

export const ANALYSES: Record<string, Analysis> = {
  'snatch-mock': snatchMock,
  'snatch-mock-low': snatchMockLow,
  'snatch-mock-miss': snatchMockMiss,
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
