// cv/catchline_cv/pipeline.py after pose: the movement check, the snatch (and, via analyseRep, the clean) rep
// measurement, the cue card and the withholding rules. Frames inside a rep are window indices unless named abs.
import { MAX_YAW_DEG, cleanPullValues, facing, hipAngles, kneeAngles, rackMask, scaleFromBody, yawFromBody } from './body';
import { detect, Detected } from './detect';
import { lowpass, lowpassPts } from './filter';
import { NAN_PT, angle, barFromWrists, barTrack, dist, finitePt, fromRef, fusePath, midPt, normalise, onPlate, sub, toRef, toWorld, trunkAngle } from './geometry';
import {
  FAMILY,
  K,
  L_ANK,
  L_BIGTOE,
  L_ELB,
  L_HEEL,
  L_HIP,
  L_KNEE,
  L_SHO,
  L_WRI,
  R_ANK,
  R_BIGTOE,
  R_ELB,
  R_HEEL,
  R_HIP,
  R_KNEE,
  R_SHO,
  R_WRI,
  JOINTS,
  check,
  col,
  headY,
  lowpassK,
  mid,
  signals,
  torsoPx,
  ys,
} from './movement';
import {
  Affine,
  Pt,
  argmax,
  argmin,
  clip,
  corrcoef,
  degrees,
  finite,
  gradient,
  int,
  max,
  median,
  min,
  nanargmin,
  nanmax,
  nanmean,
  nanmedian,
  nanmin,
  pyFixed,
  pyRound,
  pyRoundInt,
  radians,
  where,
} from './num';
import { CAUSE_CUE, behindCause, behindCopy, classify, droppedAt, peakUpSpeed, pullSpeed, speedMeasurements } from './outcome';
import {
  PhaseOut,
  SNATCH_PHASES,
  SnatchEvents,
  StartClass,
  approachesCamera,
  catchDepth,
  findLifts,
  hangPhases,
  keyFrames,
  plateFollowsBar,
  plateLiftoff,
  plateOnBar,
  runs,
  segmentSnatch,
} from './phases';
import * as rules from './rules';
import { DeviceInput, FrameSource, PlateObservation } from './source';
import type { PathOnlyGate, PathSource, RepGuides, RepTracks, TracePoint, TrackName } from '../types';

export const KEYFRAME_H = 1080;
const PLATE_CM = 45.0;
const PLATE_PATH_MAX_DEG = 45;
const PLATE_SPAN_CM = 150.0;
const PLATE_FIT_SPREAD = 0.15;
const SCALE_VS_BODY: [number, number] = [0.75, 1.75];
const BODY_DEPTH_RATIO: [number, number] = [0.75, 1.0];
const MIN_PHASE = 2;

export type AnalysisJson = Record<string, unknown>;
export type Values = Record<string, number | null>;
export type Detail = {
  frame: number;
  from_frame?: number;
  to_frame?: number;
  from?: Pt;
  to?: Pt;
  caption?: string;
  kp?: string;
  hip_rise?: number;
  sho_rise?: number;
  trunk_change?: number;
  hip_max?: number;
  knee_max?: number;
  elbow_land?: number;
  gap_s?: number;
  side?: string;
};
export type MeasRow = {
  id: string;
  label: string;
  value: number;
  unit: string;
  frame: number;
  status: string;
  note: string;
  best?: number;
};
export type Point = { x: number; y: number };
export type CueCard = {
  faultId: string;
  text: string;
  why: string;
  confidence: rules.Confidence;
  confidenceText: string;
  evidence: { rep: number; frame: number; from: Point; to: Point; value: number; unit: string; caption: string };
};
export type NoCue = { code: string; offSideDeg?: number };
export type Plate = PlateObservation & { diameter_px?: number; refined?: boolean };
export type Miss = {
  bar_vs_midfoot: number;
  bar_vx: number;
  frame: number;
  fwd_excursion: number | null;
  pvx_minus: number;
  hip_past_ankle: number;
  trunk_back: number;
  foot_dx: number | null;
  trunk_fwd_catch: number;
  max_hip: number;
  bar_behind: number;
  midfoot: Pt;
  bar: Pt;
};
export type Ref = {
  s0: number;
  Ms: Affine[];
  ksm: K;
  bar: Pt[];
  knee_ang: number[];
  hip_ang: number[];
  trunk: number[];
  hip: Pt[];
  sho: Pt[];
  ank: Pt[];
  elbow: number[];
  lo: number;
  contact: number;
  knee_pass: number | null;
  rack: boolean[] | null;
};
export type OutcomeDetail = { from: Pt; to: Pt; note: string; caption: string; trunk?: number; trunk_back?: number };

// one rep's record (pipeline.analyse_rep's info dict; lifts.rep_info fills the same shape)
export type RepInfo = {
  rep_no: number;
  start: number;
  end: number;
  made: boolean;
  phases: PhaseOut[];
  keys: Record<string, number>;
  events: Record<string, number | boolean>;
  path: ({ frame: number; src?: PathSource } & Point)[];
  values: Values;
  detail: Record<string, Detail>;
  px_per_cm: number | null;
  off_side_deg: number | null;
  severity: number;
  outcome: string;
  fwd: number;
  index: number;
  s0: number;
  Ms: Affine[];
  // the per-frame track the path is drawn from (bar, or hip for gymnastics) and the smoothed keypoints, window px
  track: Pt[];
  ksm: K;
  scale_ok?: boolean;
  scale_method?: string;
  start_class?: StartClass;
  cut_off?: boolean;
  bar_lost?: boolean;
  miss?: Miss;
  extra_meas?: MeasRow[];
  outcome_value?: number;
  outcome_frame?: number;
  outcome_detail?: OutcomeDetail;
  snatch?: SnatchExtras;
  guides?: RepGuides;
  tracks?: RepTracks;
  // the numbers a lifter reads off the tracks (hip rise, knee at the catch, ...), listed with the key numbers
  track_meas?: MeasRow[];
};
export type SnatchExtras = {
  off_side_estimates: number[];
  span_cm: number | null;
  plates: Plate[];
  catch_depth: number;
  catch_depth_frame: number;
  catch_kind: string;
  catch_knee_min: number;
  peak_h: number;
  drop: number;
  turnover_s: number;
  standing_h: number;
  bar_speed: [number, number] | null;
  bar_speed_avg: number | null;
  peak_pct: number | null;
  max_drift: number;
  max_drift_frame: number;
  catch_h: number;
  hands_overlap: boolean;
  stab_inliers_min: number;
  ref: Ref;
};

export type Ctx = {
  input: DeviceInput;
  movement: string;
  analysisId: string;
  assetPrefix: string;
  k: K;
  ks: number[][];
  boxes: number[][];
  world: K;
  fps: number;
  H: number;
  W: number;
  n: number;
};

export type Result = { analysis: AnalysisJson; reps: RepInfo[]; repCalls: (RepInfo | null | false)[] };

export function base(analysisId: string, meta: DeviceInput['meta'], n: number, movement = 'snatch'): AnalysisJson {
  const vh = KEYFRAME_H;
  const vw = pyRoundInt((meta.width * vh) / meta.height);
  return {
    version: 1,
    id: analysisId,
    movement,
    video: { uri: `assets/analysis/${analysisId}`, width: vw, height: vh, fps: meta.fps, frameCount: meta.frameCount || n },
    traceKind: (FAMILY[movement] ?? 'barbell') !== 'barbell' ? 'hip' : 'bar',
  };
}

const TRACKS: [TrackName, number, number][] = [
  ['feet', L_ANK, R_ANK],
  ['hips', L_HIP, R_HIP],
  ['shoulders', L_SHO, R_SHO],
  ['knees', L_KNEE, R_KNEE],
  ['elbows', L_ELB, R_ELB],
];

// The joint tracks beside the bar path (27-10: tracking first): per window frame from..to the mid-point of each pair,
// smoothed like the bar (ksm), back in the frame's own pixels like the path. A frame where the pose has either joint
// missing (kr, before the low-pass filled it) is skipped, not invented.
export function jointTracks(kr: K, ksm: K, Ms: Affine[], from: number, to: number, W: number, H: number, g: (f: number) => number): RepTracks {
  const out: RepTracks = {};
  for (const [name, a, b] of TRACKS) {
    const pts: TracePoint[] = [];
    for (let f = Math.max(0, from); f <= to && f < ksm.length; f++) {
      if (!finitePt(kr[f][a]) || !finitePt(kr[f][b])) continue;
      pts.push({ frame: g(f), ...normalise(fromRef(midPt(ksm[f][a], ksm[f][b]), Ms[f]), W, H) });
    }
    if (pts.length) out[name] = pts;
  }
  return out;
}

// The drawn bar (3.1.1): the followed near plate's centre on every frame the track holds and reads as the setup plate
// (onPlate), the wrists shifted to meet it on the frames between (fusePath), low-passed like the wrist bar; window
// reference px. The follow is seeded on the plate the setup found, and asked for over the whole window. Null when the
// source has no follow (a 3.1 phone, a server trace), the lifter's wrists are unseen on the seed frame, or the camera
// is further off side-on than the plate path is trusted.
// The follow is anchored on the hands' track. The native start search grids 0.3 setup heights around its anchor,
// and off side-on the near plate (the largest outline the setup finder fitted) sits further from the hands than
// that, so the hands seed the far plate: then the anchor track is shifted towards the plate until it is 0.2 setup
// heights away, on its own side, and that follow is asked for a frame after the seed, since a follow is recorded by
// its window and seed frame and the phone's earlier pass may already hold one anchored on the hands.
const PLATE_REACH = 0.3;
const PLATE_HOME = 0.2;
const PLATE_START = 0.25;
const PLATE_START_SIZE = 0.3;

export function platePath(source: FrameSource, s0: number, L: number, seed: number, kw: K, bodyH: number, setupH: number, barRaw: Pt[], Ms: Affine[], fps: number, offSide: number, plates: Plate[] = []): { drawn: Pt[]; plate: boolean[] } | null {
  if (!(Number.isFinite(setupH) && Number.isFinite(bodyH)) || seed < 0 || seed >= L) return null;
  const wristsW = barFromWrists(col(kw, L_WRI), col(kw, R_WRI), 0.12 * bodyH);
  const fitted = plates.filter((p) => p.refined && finitePt(p.centre)).sort((a, b) => (b.diameter_px ?? 0) - (a.diameter_px ?? 0))[0];
  const away = fitted && finitePt(wristsW[seed]) ? dist(fitted.centre, wristsW[seed]) : 0;
  const far = away > PLATE_REACH * setupH && seed + 1 < L;
  const k = far ? 1 - (PLATE_HOME * setupH) / away : 0;
  const shift = far ? sub(fitted.centre, wristsW[seed]).map((v) => v * k) : [0, 0];
  const anchor = far ? wristsW.map((p): Pt => (finitePt(p) ? [p[0] + shift[0], p[1] + shift[1]] : p)) : wristsW;
  const at = far ? seed + 1 : seed;
  const follow = source.followPlate?.(s0, L, at, anchor, [kw[at][L_WRI], kw[at][R_WRI]], bodyH, setupH);
  if (!follow || offSide > PLATE_PATH_MAX_DEG || follow.src[at] !== 1) return null;
  // a follow that started on some other disc than the plate the setup finder fitted is not followed
  if (fitted && (dist(follow.centres[at], fitted.centre) > PLATE_START * setupH || Math.abs(follow.fit[at][0] / (fitted.diameter_px as number) - 1) > PLATE_START_SIZE)) return null;
  const ok = onPlate(follow.src, follow.fit, follow.centres, anchor, at, offSide);
  const fused = fusePath(toRef(follow.centres.map((p, f): Pt => (ok[f] ? p : NAN_PT)), Ms), barRaw);
  return { drawn: lowpassPts(fused.path, fps, 6.0), plate: fused.plate };
}

export function fail(ctx: Ctx, reason: string, code: string, message: string): Result {
  return {
    analysis: {
      ...base(ctx.analysisId, ctx.input.meta, ctx.n, ctx.movement),
      reps: [],
      bestRepIndex: 0,
      cue: null,
      measurements: [],
      failure: { reason, code, message },
    },
    reps: [],
    repCalls: [],
  };
}

// No lift found, and the lifter's shoulders and hips read wide enough that the camera is in front
// or behind, not beside (26-10: a competition clip filmed from behind came back "no lift found"):
// the fix is the camera angle, so that is the failure. The body yaw reads a front view low, so the
// bar for "off side-on" is where cues stop being judged, not 90.
export function noLiftFailure(ctx: Ctx, message: string): Result {
  const yaw = yawFromBody(ctx.k, 0, ctx.n - 1);
  if (yaw !== null && yaw >= rules.VALUE_MAX_DEG) {
    return fail(ctx, 'not_side_on', 'front_or_back', `The camera is about ${pyRoundInt(yaw)} degrees off side-on, so the bar could not be followed.`);
  }
  return fail(ctx, 'unsupported_movement', 'no_reps', message);
}

// The gates after "person found" whose failure now gives a tracking-first result instead of the failure screen
// (owner decision 27-10: the product is the tracking; a cue is secondary).
const PATH_ONLY_GATES: Record<string, PathOnlyGate> = {
  no_reps: 'no_reps',
  front_or_back: 'not_side_on',
  no_plate: 'no_plate',
  no_body_scale: 'no_body_scale',
  shoulders_cut_off: 'shoulders_cut_off',
};

export function orPathOnly(ctx: Ctx, res: Result): Result {
  const code = (res.analysis.failure as { code?: string } | null)?.code ?? '';
  const gate = PATH_ONLY_GATES[code];
  if (!gate) return res;
  const only = pathOnly(ctx, gate);
  return only ? { ...only, repCalls: res.repCalls } : res;
}

// One rep over the whole clip with no phases and no cue: the bar track as the rep path (the hands, design 2.1; the hips
// for a hanging movement, as its reps are drawn), the joint tracks, a setup and a peak still, and for a barbell lift
// the start line and the ring. Null when the pose has under two frames of the path.
export function pathOnly(ctx: Ctx, gate: PathOnlyGate): Result | null {
  const { fps, H, W, n, input } = ctx;
  const { Ms } = input.source.window(0, n);
  const L = Ms.length;
  if (L < 2) return null;
  const kw = ctx.k.slice(0, L);
  const bodyH = nanmedian(ctx.boxes.slice(0, L).map((b) => b[3] - b[1]));
  const cols = Array.from({ length: JOINTS }, (_, j) => toRef(col(kw, j), Ms));
  const kr: K = kw.map((_, f) => cols.map((c) => c[f]));
  const ksm = lowpassK(kr, fps, 6.0);
  const hanging = FAMILY[ctx.movement] === 'hanging';
  const barRaw = hanging ? [] : barTrack(col(kr, L_WRI), col(kr, R_WRI), bodyH);
  const yaw = yawFromBody(ctx.k, 0, n - 1);
  // the plate is sought where the bar sat lowest with both hands on it (the floor, or the rack): the setup of
  // whatever this clip holds
  const low = barRaw.reduce((best, p, f) => (finitePt(kw[f][L_WRI]) && finitePt(kw[f][R_WRI]) && finitePt(p) && (best < 0 || p[1] > barRaw[best][1]) ? f : best), -1);
  const found = !hanging && low >= 0 ? input.source.plates(low, kw[low][L_WRI], kw[low][R_WRI], bodyH, bodyH).map((p): Plate => ({ ...p, diameter_px: Math.max(...p.axes), refined: p.fitInliers !== undefined })) : [];
  // with no rep to judge the follow by, only a plate whose outline the finder fitted is followed
  const fused = hanging || !found.some((p) => p.refined) ? null : platePath(input.source, 0, L, low, kw, bodyH, bodyH, barRaw, Ms, fps, yaw ?? 0, found);
  const bar = hanging ? mid(ksm, L_HIP, R_HIP) : fused ? fused.drawn : lowpassPts(barRaw, fps, 6.0);
  const seen = (f: number) => (hanging ? finitePt(kw[f][L_HIP]) && finitePt(kw[f][R_HIP]) : finitePt(kw[f][L_WRI]) || finitePt(kw[f][R_WRI]));
  const path: TracePoint[] = [];
  for (let f = 0; f < L; f++)
    if (seen(f) && finitePt(bar[f])) path.push({ frame: f, ...normalise(fromRef(bar[f], Ms[f]), W, H), ...(hanging ? {} : { src: fused?.plate[f] ? 'plate' : 'wrist' }) });
  if (path.length < 2) return null;
  const first = path[0].frame;
  const last = path[path.length - 1].frame;
  const peak = path.reduce((a, b) => (b.y < a.y ? b : a)).frame;
  const fwd = facing(kw);
  const ring = path.reduce((a, b) => (fwd * (b.x - path[0].x) > fwd * (a.x - path[0].x) ? b : a));
  const bodyScale = scaleFromBody(ctx.k);
  const keys: [string, number][] = [['setup', first], ['peak', peak]];
  const analysis: AnalysisJson = {
    ...base(ctx.analysisId, input.meta, n, ctx.movement),
    ...(bodyScale ? { pxPerCm: pyRound((bodyScale * KEYFRAME_H) / H, 3) } : {}),
    reps: [
      {
        index: 1,
        startFrame: first,
        endFrame: last,
        made: false,
        phases: [],
        keyFrames: keys.map(([phase, frame], pi) => ({ phase, frame, image: `${ctx.assetPrefix}/r1-${pi + 1}-${phase}.jpg` })),
        path,
        ...(hanging ? {} : { guides: { startX: path[0].x, ring } }),
        tracks: jointTracks(kr, ksm, Ms, first, last, W, H, (f) => f),
      },
    ],
    bestRepIndex: 1,
    cue: null,
    noCueReason: { code: 'path_only', gate, ...(yaw !== null ? { offSideDeg: pyRoundInt(yaw) } : {}) },
    notes: [],
    ...(rules.yawBucket(yaw) ? { yawBucket: rules.yawBucket(yaw) } : {}),
    measurements: [],
    keyNumbers: [],
    failure: null,
  };
  return { analysis, reps: [], repCalls: [] };
}

export function runSnatch(ctx: Ctx, forceReps?: [number, number, number][]): Result {
  const { k, fps, H } = ctx;
  const up = (y: number[]) => y.map((v) => H - v);
  const wrH = up(ys(mid(k, L_WRI, R_WRI)));
  // overhead = the bar overhead, from the wrist that continues it: a far wrist parked low halves the midpoint's height
  const barH = up(ys(barFromWrists(col(k, L_WRI), col(k, R_WRI), 0.12 * nanmedian(ctx.boxes.map((b) => b[3] - b[1])))));
  const headH = lowpass(up(headY(k)), fps);
  const overhead = lowpass(barH, fps).map((v, i) => v > headH[i]);
  const lifts = findLifts(runs(overhead, Math.max(1, Math.ceil(0.3 * fps - 1e-9))), lowpass(wrH, fps), lowpass(up(ys(mid(k, L_KNEE, R_KNEE))), fps),
    lowpass(up(ys(mid(k, L_SHO, R_SHO))), fps), torsoPx(k), fps);
  const reps = forceReps ?? lifts.map((l) => l.window);
  const classes = forceReps ? reps.map((): StartClass => 'floor') : lifts.map((l) => l.startClass);
  const noLift = () => orPathOnly(ctx, noLiftFailure(ctx, 'No floor-to-overhead lift found in this clip.'));
  if (!reps.length) return noLift();
  const repInfo: RepInfo[] = [];
  const repCalls: (RepInfo | null | false)[] = [];
  let notLifts = 0;
  reps.forEach(([start, end], ri) => {
    const info = analyseRep(ctx, start, end, ri + 1, 'snatch', classes[ri]);
    repCalls.push(info);
    if (info === false) notLifts += 1;
    if (info) repInfo.push(info);
  });
  if (!repInfo.length && notLifts) return { ...noLift(), repCalls };
  if (!repInfo.length)
    return {
      ...orPathOnly(ctx, fail(ctx, 'bar_out_of_frame', 'no_plate', 'Could not find the plates at the start of the lift, so the bar could not be measured.')),
      repCalls,
    };
  const best = bestRep(repInfo);
  repInfo.forEach((r, i) => (r.index = i + 1));
  const cueRep = repInfo.find((r) => r.outcome.startsWith('missed')) ?? maxBy(repInfo, (r) => r.severity);
  const [measurements, cue0] = buildCue(cueRep, repInfo, best, ctx.W, ctx.H);
  const [cue, noCue] = withhold(cue0, cueRep, measurements);
  const outReps = repInfo.map((r) => ({
    index: r.index,
    startFrame: r.start,
    endFrame: r.end,
    made: r.made,
    phases: r.phases,
    keyFrames: Object.entries(r.keys).map(([phase, frame], pi) => ({
      phase,
      frame,
      image: `${ctx.assetPrefix}/r${r.index}-${pi + 1}-${phase}.jpg`,
    })),
    path: r.path,
    ...(r.guides ? { guides: r.guides } : {}),
    ...(r.tracks ? { tracks: r.tracks } : {}),
  }));
  const analysis: AnalysisJson = {
    ...base(ctx.analysisId, ctx.input.meta, ctx.n),
    pxPerCm: pyRound(((cueRep.px_per_cm as number) * KEYFRAME_H) / ctx.H, 3),
    reps: outReps,
    bestRepIndex: best.index,
    cue,
    ...(noCue ? { noCueReason: noCue } : {}),
    notes: rules.notes('snatch', ruleReps(repInfo), cue),
    ...liftTags(cueRep),
    measurements,
    keyNumbers: keyNumbers(cueRep, measurements),
    failure: null,
  };
  return { analysis, reps: repInfo, repCalls };
}

// max() over a key: the first of equal keys wins
export function maxBy<T>(items: T[], key: (t: T) => number): T {
  return items.reduce((a, b) => (key(b) > key(a) ? b : a));
}

export const bestRep = (reps: RepInfo[]) =>
  reps.reduce((a, b) => {
    const ka = [a.made ? 1 : 0, -a.severity];
    const kb = [b.made ? 1 : 0, -b.severity];
    return kb[0] > ka[0] || (kb[0] === ka[0] && kb[1] > ka[1]) ? b : a;
  });

// the rules read a detail's numbers and words; the evidence points stay here
export const ruleDetail = (d: Detail): rules.Detail => {
  const { from: _from, to: _to, ...rest } = d;
  return rest;
};
export const ruleReps = (reps: RepInfo[]): rules.Rep[] =>
  reps.map((r) => ({ values: r.values, detail: Object.fromEntries(Object.entries(r.detail).map(([k, d]) => [k, ruleDetail(d)])) }));

export const severityOf = (values: Values) => {
  const f = Object.values(rules.fired(values));
  return f.length ? Math.max(...f) : 0.0;
};

const kSlice = (k: K, a: number, b: number) => k.slice(a, b);

export function analyseRep(
  ctx: Ctx,
  start: number,
  end: number,
  repNo: number,
  kind: 'snatch' | 'clean' = 'snatch',
  startClass: StartClass = 'floor',
): RepInfo | null | false {
  const { fps, H, W, n, input } = ctx;
  const source = input.source;
  const s0 = Math.max(0, start - int(2 * fps));
  let e0 = Math.min(n, end + (kind === 'snatch' ? int(1.0 * fps) : 1));
  const { Ms, inliers } = source.window(s0, e0 - s0);
  const L = Ms.length;
  e0 = s0 + L;
  const kw = kSlice(ctx.k, s0, e0);
  const boxH = (a: number, b: number) => ctx.boxes.slice(a, b).map((bx) => bx[3] - bx[1]);
  const bodyH = nanmedian(boxH(s0, e0));

  const kr: K = (() => {
    const cols = Array.from({ length: JOINTS }, (_, j) => toRef(col(kw, j), Ms));
    return kw.map((_, f) => cols.map((c) => c[f]));
  })();
  const ksm = lowpassK(kr, fps, 6.0);
  const handsOverlap = nanmedian(kr.map((r) => dist(r[L_WRI], r[R_WRI]))) < 0.15 * bodyH;
  const barRaw = barTrack(col(kr, L_WRI), col(kr, R_WRI), bodyH);
  const bar: Pt[] = lowpassPts(barRaw, fps, 6.0);
  const barY = ys(bar);
  const kneeAng = kneeAngles(ksm);
  const hipAng = hipAngles(ksm);
  const sho = mid(ksm, L_SHO, R_SHO);
  const hip = mid(ksm, L_HIP, R_HIP);
  const knee = mid(ksm, L_KNEE, R_KNEE);
  const ank = mid(ksm, L_ANK, R_ANK);
  const trunk = trunkAngle(sho, hip);
  const el = angle(col(ksm, L_SHO), col(ksm, L_ELB), col(ksm, L_WRI));
  const er = angle(col(ksm, R_SHO), col(ksm, R_ELB), col(ksm, R_WRI));
  const elbow = el.map((v, i) => (Number.isNaN(v) || Number.isNaN(er[i]) ? NaN : Math.min(v, er[i])));
  // one bar: wrists more than 0.12 body heights apart in height disagree, so one is misread and the arm whose wrist
  // continues the bar stands (barFromWrists' choice)
  const onBar = barFromWrists(col(kr, L_WRI), col(kr, R_WRI), 0.12 * bodyH);
  kr.forEach((r, f) => {
    if (Math.abs(r[L_WRI][1] - r[R_WRI][1]) > 0.12 * bodyH) elbow[f] = dist(r[L_WRI], onBar[f]) <= dist(r[R_WRI], onBar[f]) ? el[f] : er[f];
  });
  const rack = kind === 'clean' ? rackMask(ksm, bar, fps) : null;
  const barUp = barY.map((v) => -v);
  const seg = (o: { kneePass?: number | null; liftoff?: number | null }) =>
    segmentSnatch(barUp, kneeAng, fps, { elbow, catchMask: rack ?? undefined, ...o });
  const kneePassFrom = (lo: number, peak: number) => {
    for (let f = lo; f < peak; f++) if (barY[f] <= knee[f][1]) return f;
    return null;
  };
  let [phases, ev] = seg({});
  let lo = ev.liftoff;
  let kneePass = kneePassFrom(lo, ev.peak);
  if (kneePass !== null && !ev.double_knee_bend) [phases, ev] = seg({ kneePass });

  // plates on the setup frames only, a booster: a yaw estimate beside the body's, and the scale side-on when both
  // plates' outlines hold and agree with the body; the body sizes everything else
  let seed = Math.max(0, lo - 3);
  const setupH = nanmedian(boxH(s0 + Math.max(0, lo - 24), s0 + lo + 1));
  const platesAt = (f: number): Plate[] => source.plates(s0 + f, kw[f][L_WRI], kw[f][R_WRI], bodyH, setupH).map((p) => ({ ...p }));
  let plates = platesAt(seed);
  // no plate at setup (the bar came into frame late, or the plate was hidden): the first frame of the pull that shows one
  const searched = source.platesSearched?.(s0 + seed) ?? true;
  for (let f = lo; searched && !plates.length && f <= ev.peak; f += 3) {
    plates = platesAt(f);
    if (plates.length) seed = f;
  }
  const bodyScale = scaleFromBody(kw);
  // no plate in the lift: the body sizes the lift and the pose gives the angle, as for a plate not on the lifter's bar
  if (!plates.length && !bodyScale) return null;
  const samples: Plate[][] = [];
  const [sa, sb] = seed >= lo ? [seed + 3, Math.min(ev.peak + 1, seed + 25)] : [Math.max(0, lo - 24), lo];
  if (plates.length) for (let f = sa; f < sb; f += 3) samples.push(platesAt(f));
  plates.forEach((pl, i) => {
    const fits = [plates, ...samples].filter((s) => s.length === plates.length && s[i].side === pl.side).map((s) => s[i]);
    const [axes, diameter] = plateDiameter(fits, bodyScale);
    pl.axes = axes ?? pl.axes;
    pl.diameter_px = diameter ? diameter : Math.max(...pl.axes);
    pl.refined = fits.some((q) => q.fitInliers !== undefined);
  });
  // another plate on the floor: it judges nothing and sizes nothing, the body does
  const stray = plates.length > 0 && !plateOnBar(plates[0].centre[1], mid(kw, L_WRI, R_WRI)[seed][1], plates[0].diameter_px as number);
  if (stray) for (const pl of plates) pl.refined = false;
  const near = plates.length ? plates[0] : null;
  const far = plates.length > 1 ? plates[1] : null;
  const shin = kw.map((r) => nanmean([dist(r[L_KNEE], r[L_ANK]), dist(r[R_KNEE], r[R_ANK])]));
  if (approachesCamera(shin, lo, ev.peak) || ev.peak <= lo) return false;
  const bothFit = near !== null && far !== null && Boolean(near.refined) && Boolean(far.refined);
  const plateScale = bothFit ? 2 / (PLATE_CM / (near.diameter_px as number) + PLATE_CM / (far.diameter_px as number)) : null;
  const spanCm = plateScale ? dist(near!.centre, far!.centre) / plateScale : null;
  let plateYaw = [...(spanCm !== null ? [degrees(Math.asin(clip(spanCm / PLATE_SPAN_CM, 0, 1)))] : []), ...ellipseAngles(plates)];
  // side-on the hands overlap; a plate read within 10 deg of side-on with them a grip apart is not the lifter's
  if (plateYaw.length && !handsOverlap && max(plateYaw) < rules.ANGLE_ERR_DEG) plateYaw = [];
  const bodyYaw = yawFromBody(kw, lo, Math.min(ev.second_ext, L - 1));
  const offEst = [...(bodyYaw !== null ? [bodyYaw] : []), ...plateYaw];
  const offSide = offEst.length ? clip(median(offEst), 0, MAX_YAW_DEG) : 0.0;
  const foreshort = 1 / Math.cos(radians(offSide));
  let pxPerCm = bodyScale ?? NaN;
  let scaleMethod = 'body segments';
  let scaleOk = bodyScale !== null;
  if (plateScale !== null && offSide <= 20 && (!bodyScale || (SCALE_VS_BODY[0] <= plateScale / bodyScale && plateScale / bodyScale <= SCALE_VS_BODY[1]))) {
    pxPerCm = plateScale;
    scaleMethod = 'harmonic mean of near and far plates';
    scaleOk = true;
  } else if (!bodyScale && near) {
    pxPerCm = (near.diameter_px as number) / PLATE_CM;
    scaleMethod = 'near plate only (no body scale)';
  }
  if (!Number.isFinite(pxPerCm)) return null;

  const toes = mid(ksm, L_BIGTOE, R_BIGTOE);
  const heels = mid(ksm, L_HEEL, R_HEEL);
  const fwd = toes[lo][0] - heels[lo][0] >= 0 ? 1.0 : -1.0;
  const ppc = pxPerCm;
  const cm = (px: number) => px / ppc;

  const vals: Values = {};
  const detail: Record<string, Detail> = {};
  if (kneePass !== null) {
    const hipRise = cm(hip[lo][1] - hip[kneePass][1]);
    const shoRise = cm(sho[lo][1] - sho[kneePass][1]);
    vals.hips_rise_early = hipRise - shoRise;
    detail.hips_rise_early = { frame: kneePass, hip_rise: hipRise, sho_rise: shoRise, trunk_change: trunk[lo] - trunk[kneePass] };
  }
  let hipPass = ev.second_ext;
  for (let f = lo; f < ev.peak; f++)
    if (barY[f] <= hip[f][1]) {
      hipPass = f;
      break;
    }
  const contact = Math.min(hipPass, ev.second_ext);
  const xsFwd = bar.slice(contact, ev.peak + 1).map((p) => fwd * (p[0] - bar[contact][0]));
  const j = argmax(xsFwd);
  vals.bar_forward_off_hips = cm(xsFwd[j]) * foreshort;
  detail.bar_forward_off_hips = { frame: contact + j, from_frame: contact };
  const w = Math.max(1, int(0.3 * fps));
  const medPt = (p: Pt[]): Pt => [median(p.map((q) => q[0])), median(p.map((q) => q[1]))];
  const feetFrom = medPt(ank.slice(Math.max(0, lo - w), lo + 1));
  const feetTo = medPt(ank.slice(ev.caught, ev.caught + w + 1));
  vals.jump_forward = cm(fwd * (feetTo[0] - feetFrom[0])) * foreshort;
  detail.jump_forward = { frame: ev.caught, from_frame: lo, from: feetFrom, to: feetTo };
  if (kind === 'clean') {
    const [cv, cd] = cleanPullValues(ksm, hipAng, kneeAng, lo, ev.peak, fps);
    Object.assign(vals, cv);
    Object.assign(detail, cd);
  }
  const depthEnd = Math.min(ev.recovered, ev.hold_end - 1);
  const [depthF, depthPx, catchKind] = catchDepth(
    hip.map((p) => -p[1]),
    knee.map((p) => -p[1]),
    kneeAng,
    ev.caught,
    depthEnd,
    65.0 + rules.openAngleDeg(offSide, 65.0),
  );
  const valsDepth = cm(depthPx);
  if (kind === 'snatch') {
    // fault catalogue priority 1, heuristic thresholds, uncalibrated
    vals.hips_too_low_at_start = cm(knee[lo][1] - hip[lo][1]);
    detail.hips_too_low_at_start = { frame: lo, from: knee[lo], to: hip[lo] };
    vals.shoulders_behind_bar_at_start = cm(fwd * (bar[lo][0] - sho[lo][0])) * foreshort;
    detail.shoulders_behind_bar_at_start = { frame: lo, from: bar[lo], to: sho[lo] };
    // feet back further than the bar came back: equal backward travel is fine
    const barDx = cm(fwd * (bar[ev.caught][0] - bar[lo][0])) * foreshort;
    vals.jump_back_excessive = -(vals.jump_forward as number) - Math.max(0.0, -barDx);
    detail.jump_back_excessive = { frame: ev.caught, from: feetFrom, to: feetTo };
  }
  // no first pull from the hang or blocks: the floor-start rules judge nothing (design 4.3)
  if (startClass !== 'floor') for (const f of ['hips_rise_early', 'hips_too_low_at_start', 'shoulders_behind_bar_at_start']) if (f in vals) vals[f] = null;
  const peakH = cm(bar[lo][1] - bar[ev.peak][1]);
  const drop = cm(bar[ev.caught][1] - bar[ev.peak][1]);
  const turnoverS = (ev.caught - ev.second_ext) / fps;
  if (kind === 'snatch') {
    const [cv, cd] = cleanPullValues(ksm, hipAng, kneeAng, lo, ev.peak, fps, 150.0);
    const d = cd.early_arm_bend;
    vals.early_arm_bend = armBendValue(cv.early_arm_bend, d.from_frame, d.to_frame, lo);
    detail.early_arm_bend = d;
    const [tv, td] = turnoverValues(ev, elbow, drop, fps, 1.0, 150.0 + 0.25 * offSide);
    Object.assign(vals, tv);
    Object.assign(detail, td);
  }
  const head = headY(ksm);
  const standingH = cm(nanmax(ank.map((p, i) => p[1] - head[i]))) + 12.0;

  let made = ev.recovered < L - 1 && max(kneeAng.slice(ev.recovered, ev.recovered + int(0.5 * fps) + 1)) > 150;

  const midfoot = toes.map((t, i): Pt => [(t[0] + heels[i][0]) / 2, (t[1] + heels[i][1]) / 2]);
  const fEnd = int(Math.min(Math.max(ev.caught, ev.hold_end - 1), L - 1));
  const kBack = Math.max(1, int(0.2 * fps));
  const barVsMid = cm(fwd * (bar[fEnd][0] - midfoot[fEnd][0])) * foreshort;
  const barVx = cm(fwd * (bar[fEnd][0] - bar[Math.max(0, fEnd - kBack)][0])) * foreshort;
  if (kind === 'clean' && rack) {
    made = false;
    for (let f = ev.caught; f < L; f++) if (rack[f] && kneeAng[f] > 155 && hipAng[f] > 155) made = true;
  }
  // the hands below mid-torso for 0.2 s after the catch, within 1 s of an unmade catch or before the stand-up of a made
  // snatch: the bar came down, so the lift was missed (its side: where the bar was furthest from mid-foot above the
  // shoulders)
  const midTorso = sho.map((p, i) => (p[1] + hip[i][1]) / 2);
  const dropTo = !made ? Math.min(L, ev.caught + int(1.0 * fps) + 1) : kind === 'snatch' ? ev.recovered : ev.caught;
  const dropF = droppedAt(barY, midTorso, ev.caught, dropTo, Math.max(2, int(0.2 * fps)));
  let missF = fEnd;
  if (dropF !== null) {
    made = false;
    missF = dropF;
    for (let f = ev.peak; f < dropF; f++)
      if (barY[f] < sho[f][1] && Math.abs(bar[f][0] - midfoot[f][0]) > Math.abs(bar[missF][0] - midfoot[missF][0])) missF = f;
  }
  const missVsMid = cm(fwd * (bar[missF][0] - midfoot[missF][0])) * foreshort;
  const missVx = cm(fwd * (bar[missF][0] - bar[Math.max(0, missF - kBack)][0])) * foreshort;
  const released = ev.hold_end < L || dropF !== null;
  const cutOff = (s0 === 0 && lo < int(0.3 * fps)) || (s0 + L >= n && !released && !made);
  const outcomeKind = dropF !== null ? (missVsMid >= 0 ? 'missed_forward' : 'missed_behind') : made || released ? classify(made, barVsMid, barVx) : 'unknown';
  const lean = (f: number) => 90.0 - trunk[f];
  const ahead = (f: number) => fwd * (sho[f][0] - hip[f][0]) > 0;
  const vx = gradient(bar.map((p) => fwd * p[0])).map((g) => ((g * fps) / pxPerCm) * foreshort);
  const swingF = contact + argmax(xsFwd);
  const miss: Miss = {
    bar_vs_midfoot: missVsMid,
    bar_vx: missVx,
    frame: missF,
    fwd_excursion: vals.bar_forward_off_hips,
    pvx_minus: min(vx.slice(swingF, Math.min(L, ev.caught + int(0.3 * fps)) + 1)),
    hip_past_ankle: cm(fwd * (hip[ev.second_ext][0] - ank[ev.second_ext][0])) * foreshort,
    trunk_back: ahead(ev.peak) ? 0.0 : lean(ev.peak),
    foot_dx: vals.jump_forward,
    trunk_fwd_catch: ahead(ev.caught) ? lean(ev.caught) : 0.0,
    max_hip: max(hipAng.slice(lo, ev.peak + 1)),
    bar_behind: -cm(fwd * (bar[ev.peak][0] - sho[ev.peak][0])) * foreshort,
    midfoot: midfoot[missF],
    bar: bar[missF],
  };
  if (outcomeKind === 'missed_behind') vals.jump_forward = null;
  const g = (f: number) => s0 + int(f);
  const fused = platePath(source, s0, L, seed, kw, bodyH, setupH, barRaw, Ms, fps, offSide, plates);
  const drawn: Pt[] = fused ? fused.drawn : bar;
  const path: RepInfo['path'] = [];
  for (let f = phases[0].startFrame; f < L; f++)
    if (f <= ev.recovered) path.push({ frame: g(f), ...normalise(fromRef(drawn[f], Ms[f]), W, H), src: fused?.plate[f] ? 'plate' : 'wrist' });
  const tracks = jointTracks(kr, ksm, Ms, phases[0].startFrame, ev.recovered, W, H, g);
  const pull2 = phases.find((ph) => ph.name === 'second_pull');
  const sp = peakUpSpeed(barY, fps, pxPerCm, pull2 ? pull2.startFrame : ev.liftoff, ev.second_ext);
  const drift = bar.slice(lo, ev.caught + 1).map((p) => fwd * (p[0] - bar[lo][0]));
  const driftF = lo + argmax(drift);
  const at = (p: Pt, f: number) => normalise(fromRef(p, Ms[f]), W, H);
  const drawnDrift = drawn.slice(lo, ev.caught + 1).map((p) => fwd * (p[0] - drawn[lo][0]));
  const ringF = lo + argmax(drawnDrift);
  const avgSpeed = pullSpeed(barY, fps, pxPerCm, lo, ev.second_ext);
  const barLost = kind === 'snatch' && bar[ev.peak][1] > sho[ev.peak][1];
  const catchEnd = Math.max(ev.caught, depthEnd);
  const catchKneeMin = min(kneeAng.slice(ev.caught, catchEnd + 1));
  const pullElbow = elbow.slice(lo, ev.second_ext + 1);
  const bentF = pullElbow.some(Number.isFinite) ? lo + nanargmin(pullElbow) : lo;
  const trackMeas: MeasRow[] = [
    { id: 'hip_rise', label: 'Hip rise', value: pyRound(cm(hip[lo][1] - hip[ev.second_ext][1]), 1), unit: 'cm', frame: g(ev.second_ext), status: 'normal', note: 'hips, lift-off to full extension' },
    ...(kind === 'snatch'
      ? [{ id: 'bar_over_shoulder', label: 'Bar over shoulder', value: pyRound(cm(fwd * (bar[ev.caught][0] - sho[ev.caught][0])) * foreshort, 1), unit: 'cm', frame: g(ev.caught), status: 'normal', note: 'bar vs shoulder at the catch (+ = in front)' }]
      : []),
    { id: 'knee_catch', label: 'Knee at catch', value: pyRound(catchKneeMin, 1), unit: 'deg', frame: g(depthF), status: 'normal', note: 'deepest knee angle in the catch' },
    ...(Number.isFinite(elbow[bentF])
      ? [{ id: 'elbow_pull', label: 'Elbow bend in the pull', value: pyRound(180 - elbow[bentF], 1), unit: 'deg', frame: g(bentF), status: 'normal', note: 'most the elbows bent before full extension (0 = straight)' }]
      : []),
    ...frontReadings(ksm, bar, lo, ev.caught, fps, pxPerCm, offSide, g),
  ];
  const events: Record<string, number | boolean> = {};
  for (const [kk, v] of Object.entries(ev)) events[kk] = typeof v === 'boolean' ? v : g(v);
  const keys: Record<string, number> = {};
  const [outPhases, outKeys] = startClass === 'floor' ? [phases, keyFrames(ev)] : hangPhases(phases, ev, barY, torsoPx(kw), fps);
  for (const [kk, v] of Object.entries(outKeys)) keys[kk] = g(v);
  return {
    rep_no: repNo,
    start: g(phases[0].startFrame),
    end: g(ev.recovered),
    made,
    phases: outPhases.map((p) => ({ ...p, startFrame: g(p.startFrame), endFrame: g(p.endFrame) })),
    keys,
    events,
    path,
    values: vals,
    start_class: startClass,
    detail,
    px_per_cm: pxPerCm,
    off_side_deg: offSide,
    severity: severityOf(vals),
    outcome: outcomeKind,
    fwd,
    index: 0,
    s0,
    Ms,
    track: bar,
    ksm,
    scale_ok: scaleOk,
    scale_method: scaleMethod,
    cut_off: cutOff,
    guides: {
      startX: at(drawn[lo], lo).x,
      kneeY: at(knee[lo], lo).y,
      hipY: at(hip[contact], contact).y,
      peakY: at(drawn[ev.peak], ev.peak).y,
      ring: { frame: g(ringF), ...at(drawn[ringF], ringF) },
    },
    bar_lost: barLost,
    miss,
    tracks,
    track_meas: trackMeas,
    snatch: {
      off_side_estimates: offEst,
      span_cm: spanCm,
      plates,
      catch_depth: valsDepth,
      catch_depth_frame: g(depthF),
      catch_kind: catchKind,
      catch_knee_min: catchKneeMin,
      peak_h: peakH,
      drop,
      turnover_s: turnoverS,
      standing_h: standingH,
      bar_speed: sp ? [sp[0], g(sp[1])] : null,
      bar_speed_avg: avgSpeed,
      max_drift: cm(drift[driftF - lo]) * foreshort,
      max_drift_frame: g(driftF),
      catch_h: cm(bar[lo][1] - bar[ev.caught][1]),
      peak_pct: startClass === 'floor' ? ((PLATE_CM / 2 + peakH) / standingH) * 100 : null,
      hands_overlap: handsOverlap,
      stab_inliers_min: inliers.length ? int(min(inliers)) : 0,
      ref: { s0, Ms, ksm, bar, knee_ang: kneeAng, hip_ang: hipAng, trunk, hip, sho, ank, elbow, lo, contact, knee_pass: kneePass, rack },
    },
  };
}

export function armBendValue(value: number, brk: number, hipFull: number, lo: number): number | null {
  if (brk - lo <= MIN_PHASE || hipFull - lo <= MIN_PHASE) return null;
  return value;
}

// lockDeg: the elbow lockout angle, 150 side-on; off side-on a bent elbow reads more open (design 3.1: 150 + 0.25 x yaw)
export function turnoverValues(ev: SnatchEvents, elbow: number[], dropCm: number, fps: number, maxS = 1.0, lockDeg = 150.0): [Values, Record<string, Detail>] {
  const vals: Values = { slow_turnover: null, bar_crash: null };
  const det: Record<string, Detail> = {
    slow_turnover: { frame: ev.caught, from_frame: ev.second_ext },
    bar_crash: { frame: ev.caught, from_frame: ev.peak },
  };
  if (!(elbow[ev.caught] >= lockDeg) || ev.second_ext - ev.rebend < MIN_PHASE || ev.peak - ev.second_ext < MIN_PHASE) return [vals, det];
  // the turnover ends at the first lockout after the elbows' deepest bend under the bar (3-frame medians), not
  // always at the catch: the arms can lock while the bar still rises
  let lock = ev.caught;
  const a = ev.second_ext;
  if (a >= 1 && lock > a + 1) {
    const seg = elbow.slice(a - 1, lock + 1);
    const bend: number[] = [];
    for (let i = 0; i + 2 < seg.length; i++) bend.push(median([seg[i], seg[i + 1], seg[i + 2]]));
    const deepest = a + argmin(bend);
    const relock = where(elbow.slice(deepest, lock).map((v) => v >= lockDeg));
    if (min(bend) < lockDeg && relock.length) {
      lock = deepest + relock[0];
      det.slow_turnover.frame = lock;
    }
  }
  const t = (lock - a) / fps;
  if (t <= maxS) vals.slow_turnover = t;
  if (ev.caught - ev.peak >= MIN_PHASE) vals.bar_crash = dropCm;
  return [vals, det];
}

function notALift(near: Plate | null, plateY: number[], barY: number[], shin: number[], liftoff: number, peak: number): boolean {
  return (
    (Boolean(near?.refined) && plateFollowsBar(plateY, barY, liftoff, peak, (near as Plate).diameter_px as number) === false) ||
    approachesCamera(shin, liftoff, peak) ||
    peak <= liftoff
  );
}

export const ellipseAngles = (plates: Plate[]) =>
  plates.filter((p) => p.refined).map((p) => degrees(Math.acos(Math.min(1.0, p.axes[1] / p.axes[0]))));

export function plateDiameter(fits0: Plate[], bodyScale: number | null): [[number, number] | null, number | null, boolean] {
  let fits = fits0;
  if (bodyScale) {
    const [lo, hi] = SCALE_VS_BODY.map((x) => PLATE_CM * bodyScale * x);
    fits = fits.filter((q) => lo <= Math.max(...q.axes) && Math.max(...q.axes) <= hi);
  }
  if (!fits.length) return [null, null, false];
  const axes: [number, number] = [median(fits.map((q) => q.axes[0])), median(fits.map((q) => q.axes[1]))];
  const refined = fits.filter((q) => q.fitInliers !== undefined);
  if (!refined.length) return [axes, Math.max(...axes), false];
  const d = refined.map((q) => Math.max(...q.axes));
  const md = median(d);
  const keep = d.filter((v) => Math.abs(v / md - 1) <= PLATE_FIT_SPREAD);
  return [axes, median(keep), true];
}

export function nearBarScale(scaleNear: number, depthRatio: number | null, bodyScale: number | null): [number, string] {
  if (depthRatio !== null && depthRatio > 0.2 && depthRatio <= 1.2)
    return [scaleNear * depthRatio, `near plate x parallax depth ratio ${pyFixed(depthRatio, 2)}`];
  if (bodyScale)
    return [scaleNear * clip(bodyScale / scaleNear, ...BODY_DEPTH_RATIO), "near plate only (no parallax), depth from the lifter's body"];
  return [scaleNear, 'near plate only (no parallax: plate rise too small or lost)'];
}

export function checkScale(px: number, method: string, plateOk: boolean, scaleNear: number, bodyScale: number | null): [number, string, boolean] {
  if (bodyScale && !(SCALE_VS_BODY[0] <= scaleNear / bodyScale && scaleNear / bodyScale <= SCALE_VS_BODY[1]))
    return [bodyScale, 'body segments (plate fit unreliable)', false];
  return [px, method, plateOk];
}

const LABELS: Record<string, string> = {
  hips_rise_early: 'Hips rose early',
  bar_forward_off_hips: 'Bar forward off hips',
  jump_forward: 'Jumped forward',
  early_arm_bend: 'Early arm bend',
  slow_turnover: 'Slow turnover',
  bar_crash: 'Bar drop into the catch',
  hips_too_low_at_start: 'Hips above knees at the start',
  shoulders_behind_bar_at_start: 'Shoulders behind the bar at the start',
  jump_back_excessive: 'Feet jumped back',
};
const NOTES: Record<string, string> = {
  hips_rise_early: 'hips vs shoulders, floor to knee',
  bar_forward_off_hips: 'after hip contact',
  jump_forward: 'feet, lift-off to catch',
  early_arm_bend: 'elbows bent before the hips finished (+ = early)',
  slow_turnover: 'full extension to elbow lockout',
  bar_crash: 'bar peak to elbow lockout',
  hips_too_low_at_start: 'hip height above the knees at lift-off',
  shoulders_behind_bar_at_start: 'shoulders behind the bar at lift-off (+ = behind)',
  jump_back_excessive: "feet back, beyond the bar's own move back",
};
const CAPTIONS: Record<string, (v: string) => string> = {
  hips_too_low_at_start: (v) => `hip · ${v} cm above knee`,
  shoulders_behind_bar_at_start: (v) => `shoulders · ${v} cm behind bar`,
  jump_back_excessive: (v) => `feet · ${v} cm back`,
};

const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);

function buildCue(r: RepInfo, reps: RepInfo[], best: RepInfo, W: number, H: number): [MeasRow[], CueCard | null] {
  const vals = r.values;
  const det = r.detail;
  const sn = r.snatch as SnatchExtras;
  const ref = sn.ref;
  const off = r.off_side_deg as number;
  const angleNote = off > 20 ? `; corrected for a camera ~${pyFixed(off, 0)}° off side-on, so treat as an estimate` : '';
  const seenVals = rules.onScreen(vals, off);
  let cueId = rules.chooseCue(seenVals);
  const fired = rules.fired(seenVals);
  const s0 = ref.s0;
  const meas: MeasRow[] = [];
  for (const fid of rules.FAULTS.snatch) {
    const v = vals[fid];
    const unit = rules.RULES[fid].unit;
    const nd = unit === 's' ? 2 : 1;
    if (v === null || v === undefined) {
      meas.push({
        id: fid,
        label: LABELS[fid],
        value: 0,
        unit,
        frame: r.start,
        status: 'not_seen',
        note: r.outcome === 'missed_behind' && fid === 'jump_forward' ? 'not judged: the step forward was the bail' : 'could not measure',
      });
      continue;
    }
    const status = fid === cueId ? 'cue' : fid in fired ? 'follows' : 'normal';
    let note = NOTES[fid];
    if (rules.RULES[fid].horizontal) note += angleNote;
    const m: MeasRow = { id: fid, label: LABELS[fid], value: pyRound(v, nd), unit, frame: s0 + int(det[fid].frame), status, note };
    const bv = best.values[fid];
    if (best !== r && bv !== null && bv !== undefined) m.best = pyRound(bv, nd);
    meas.push(m);
  }
  meas.push(
    { id: 'bar_peak_height', label: 'Bar peak height', value: pyRound(sn.peak_h, 1), unit: 'cm', frame: r.events.peak as number, status: 'normal', note: 'above lift-off (wrist midpoint)' },
    {
      id: 'catch_depth',
      label: 'Catch depth',
      value: pyRound(Math.abs(sn.catch_depth), 1),
      unit: 'cm',
      frame: sn.catch_depth_frame,
      status: 'normal',
      note: `${sn.catch_kind} catch, hip ${sn.catch_depth > 0 ? 'below' : 'above'} knee, knee ${pyFixed(sn.catch_knee_min, 0)}°`,
    },
    { id: 'turnover_time', label: 'Extension to catch', value: pyRound(sn.turnover_s, 2), unit: 's', frame: r.events.second_ext as number, status: 'normal', note: '± 1 frame at 30 fps' },
    ...guideRows(sn),
    ...speedMeasurements({ peak: sn.bar_speed, avg: sn.bar_speed_avg, peakPct: sn.peak_pct }, r.scale_ok ?? false, {
      secondExt: r.events.second_ext as number,
      peak: r.events.peak as number,
    }),
    ...(r.track_meas ?? []),
  );
  if (r.outcome === 'missed_behind') return missBehindCard(r, meas, W, H);
  if (r.outcome === 'missed_forward') {
    const f_ = [...rules.gate(Object.keys(fired))];
    cueId = f_.length ? f_.reduce((a, b) => (rules.RULES[b].order < rules.RULES[a].order ? b : a)) : null;
    if (cueId === null) return [meas, missCard(r, 'missed_forward', meas, W, H)];
  }
  if (cueId === null) return [meas, null];
  const sev = fired[cueId];
  const seen = reps.filter((x) => (cueId as string) in rules.fired(rules.onScreen(x.values, x.off_side_deg))).length;
  const conf = rules.cueConfidence(cueId, sev, off, seen, reps.length, r.scale_ok as boolean);
  const unit = rules.RULES[cueId].unit;
  const d = det[cueId];
  const f = d.frame;
  const raw = (p: Pt, fr: number) => fromRef(p, ref.Ms[fr]);
  const v = vals[cueId] as number;
  let frm: Pt;
  let to: Pt;
  let caption: string;
  if (cueId === 'hips_rise_early') {
    frm = raw(ref.hip[ref.lo], f);
    to = raw(ref.hip[f], f);
    caption = `hips +${pyFixed(d.hip_rise as number, 0)} cm · shoulders +${pyFixed(d.sho_rise as number, 0)} cm`;
  } else if (cueId === 'bar_forward_off_hips') {
    frm = raw(ref.bar[d.from_frame as number], f);
    to = raw(ref.bar[f], f);
    caption = `hip · ${pyFixed(v, 0)} cm fwd`;
  } else if (cueId === 'early_arm_bend') {
    frm = raw(mid(ref.ksm, L_ELB, R_ELB)[d.from_frame as number], f);
    to = raw(ref.hip[d.to_frame as number], f);
    caption = `elbows bend ${pyFixed(v, 2)} s early`;
  } else if (cueId === 'slow_turnover' || cueId === 'bar_crash') {
    frm = raw(ref.bar[d.from_frame as number], f);
    to = raw(ref.bar[f], f);
    caption = cueId === 'slow_turnover' ? `extension to lockout · ${pyFixed(v, 2)} s` : `bar · ${pyFixed(v, 0)} cm drop`;
  } else {
    frm = raw(d.from as Pt, f);
    to = raw(d.to as Pt, f);
    caption = (CAPTIONS[cueId] ?? ((x) => `feet · ${x} cm fwd`))(pyFixed(v, 0));
  }
  let confText = `Seen on ${seen} of ${reps.length} reps`;
  if (off > 20) confText += `, filmed ~${pyFixed(off, 0)}° off side-on: film from the side to confirm`;
  if (!r.scale_ok && unit !== 's') confText += ', sized from your body because the plate could not be measured';
  let why = rules.whySentence(cueId, vals, ruleDetail(det[cueId]));
  const miss = r.miss as Miss;
  if (r.outcome === 'missed_forward') {
    meas.push({
      id: 'outcome',
      label: 'Missed forward',
      value: pyRound(miss.bar_vs_midfoot, 1),
      unit: 'cm',
      frame: s0 + miss.frame,
      status: 'normal',
      note: 'bar vs mid-foot when it left you (+ = in front)',
    });
    why = `Missed forward. The bar left you ${pyFixed(miss.bar_vs_midfoot, 0)} cm in front of mid-foot. Earliest thing I can see: ${lowerFirst(why)}`;
  }
  const cue: CueCard = {
    faultId: cueId,
    text: rules.CUES[cueId],
    why,
    confidence: conf,
    confidenceText: confText,
    evidence: {
      rep: r.index,
      frame: s0 + f,
      from: normalise(frm, W, H),
      to: normalise(to, W, H),
      value: pyRound(v, unit === 's' ? 2 : 1),
      unit,
      caption,
    },
  };
  return [meas, cue];
}

// the lift record's tags the phone syncs (sync_lift: start_class, yaw_bucket)
export function liftTags(r: RepInfo): { startClass?: StartClass; yawBucket?: string } {
  const yaw = rules.yawBucket(r.off_side_deg);
  return { ...(r.start_class ? { startClass: r.start_class } : {}), ...(yaw ? { yawBucket: yaw } : {}) };
}

const OUTCOMES = new Set(['missed_forward', 'missed_behind', 'missed', 'jerk_forward', 'jerk_back', 'could_not_stand']);

export function withhold(cue: CueCard | null, r: RepInfo, meas: MeasRow[]): [CueCard | null, NoCue | null] {
  if (r.bar_lost) {
    for (const m of meas) if (m.status === 'cue') m.status = 'normal';
    return [null, { code: 'bar_lost' }];
  }
  const off = r.off_side_deg;
  if (cue === null && off !== null && off > 20) return [null, { code: 'off_side_on', offSideDeg: pyRoundInt(off) }];
  if (cue === null || (cue.confidence !== 'low' && !r.cut_off)) return [cue, null];
  const fid = cue.faultId;
  const horizontal = (i: string) => i === 'outcome' || OUTCOMES.has(i) || (rules.RULES[i]?.horizontal ?? false);
  let reason: NoCue;
  if (r.cut_off) reason = { code: 'rep_cut_off' };
  else if (off !== null && off > 20 && horizontal(fid)) reason = { code: 'off_side_on', offSideDeg: pyRoundInt(off) };
  else if (OUTCOMES.has(fid)) reason = { code: 'unclear_miss' };
  else if (!(r.scale_ok ?? true)) reason = { code: 'plate_hidden' };
  else reason = { code: 'low_confidence' };
  for (const m of meas) {
    if (m.status === 'cue') m.status = m.id in rules.RULES ? 'follows' : 'normal';
    if (reason.code === 'off_side_on' && horizontal(m.id) && m.status !== 'not_seen') {
      m.status = 'not_seen';
      m.note = `not judged: filmed ~${pyFixed(off as number, 0)}° off side-on`;
    }
  }
  return [null, reason];
}

export function missCard(r: RepInfo, kind: string, meas: MeasRow[], W: number, H: number, cause: string | null = null, sev = 0.0): CueCard {
  const m = r.miss as Miss;
  const f = m.frame;
  const raw = (p: Pt) => fromRef(p, r.Ms[f]);
  const off = r.off_side_deg;
  let why: string;
  let text: string;
  if (kind === 'missed_behind') {
    const hipsText =
      m.hip_past_ankle > 6
        ? `your hips drove ${pyFixed(m.hip_past_ankle, 0)} cm past your ankles at the top`
        : m.trunk_back > 10
          ? `you leaned ${pyFixed(m.trunk_back, 0)} deg back at the top of the pull`
          : `your feet jumped ${pyFixed(Math.abs(m.foot_dx || 0), 0)} cm back`;
    why = behindCopy(m.bar_vs_midfoot, cause, { fwd: m.fwd_excursion as number, hips_text: hipsText, trunk: m.trunk_fwd_catch, behind: m.bar_behind });
    text = cause !== null && cause in CAUSE_CUE ? rules.CUES[CAUSE_CUE[cause]] : 'Film one more rep from the side.';
  } else {
    why =
      `Missed forward. The bar left you ${pyFixed(m.bar_vs_midfoot, 0)} cm in front of mid-foot. I can't tell why from ` +
      "this clip: nothing in the pull was outside its window. Film one more rep, or a lighter make, and I'll compare.";
    text = 'Film one more rep from the side.';
  }
  const conf: rules.Confidence = cause !== null && cause in CAUSE_CUE && sev >= 1.5 && (off === null || off <= 20) ? 'worth_checking' : 'low';
  const confText = 'One missed rep' + (off && off > 20 ? `, filmed ~${pyFixed(off, 0)}° off side-on: film from the side to confirm` : '');
  meas.push({
    id: 'outcome',
    label: 'Missed ' + (kind === 'missed_behind' ? 'behind' : 'forward'),
    value: pyRound(m.bar_vs_midfoot, 1),
    unit: 'cm',
    frame: r.s0 + f,
    status: 'cue',
    note: 'bar vs mid-foot when it left you (+ = in front)',
  });
  return {
    faultId: kind,
    text,
    why,
    confidence: conf,
    confidenceText: confText,
    evidence: {
      rep: r.index,
      frame: r.s0 + f,
      from: normalise(raw(m.midfoot), W, H),
      to: normalise(raw(m.bar), W, H),
      value: pyRound(m.bar_vs_midfoot, 1),
      unit: 'cm',
      caption: `bar ${pyFixed(Math.abs(m.bar_vs_midfoot), 0)} cm ${m.bar_vs_midfoot < 0 ? 'behind' : 'in front of'} mid-foot`,
    },
  };
}

export function missBehindCard(r: RepInfo, meas: MeasRow[], W: number, H: number): [MeasRow[], CueCard] {
  const m = r.miss as Miss;
  const [cause, sev] = behindCause(m.fwd_excursion, m.pvx_minus, m.hip_past_ankle, m.trunk_back, m.foot_dx, m.trunk_fwd_catch, m.max_hip, m.bar_behind);
  return [meas, missCard(r, 'missed_behind', meas, W, H, cause, sev)];
}

export function guideRows(sn: SnatchExtras): MeasRow[] {
  const row = (id: string, label: string, v: number, frame: number, note: string): MeasRow =>
    Number.isFinite(v)
      ? { id, label, value: pyRound(v, 1), unit: 'cm', frame, status: 'normal', note }
      : { id, label, value: 0, unit: 'cm', frame, status: 'not_seen', note: 'could not measure' };
  return [
    row('max_forward_drift', 'Max forward drift', sn.max_drift, sn.max_drift_frame, 'bar furthest in front of where it left the floor'),
    row('catch_height', 'Catch height', sn.catch_h, sn.catch_depth_frame, 'bar above lift-off when you caught it'),
  ];
}

// The readings a front or back view can give (29-10, any camera angle): the bar's tilt at the catch (left hand vs
// right, pose left and right so the camera side does not matter), the bar's sideways drift from lift-off to the
// catch and the hips' sideways shift over the feet, both towards the lifter's own left (the shoulders say which way
// they face), and the stance width from the ankles at setup and at the catch. Sideways distances are foreshortened by
// the yaw (sin), so they are corrected for it, as forward distances are side-on (cos).
export const FRONT_NUMBERS = ['bar_tilt_catch', 'bar_drift_lateral', 'hip_shift', 'stance_setup', 'stance_catch'];

export function frontReadings(ksm: K, bar: Pt[], setup: number, caught: number, fps: number, pxPerCm: number, yaw: number, g: (f: number) => number): MeasRow[] {
  const L = ksm.length;
  if (setup < 0 || caught < 0 || setup >= L || caught >= L) return [];
  const lateral = 1 / Math.sin(radians(clip(Math.max(yaw, rules.VALUE_MAX_DEG), 0, 90)));
  const cm = (px: number) => (px / pxPerCm) * lateral;
  const w = Math.max(1, int(0.2 * fps));
  const at = (f: number, a: number, b: number, j: 0 | 1) => nanmedian(ksm.slice(Math.max(0, f - w), Math.min(L, f + w + 1)).map((r) => (r[a][j] + r[b][j]) / 2));
  const width = (f: number) => nanmedian(ksm.slice(Math.max(0, f - w), Math.min(L, f + w + 1)).map((r) => Math.abs(r[L_ANK][0] - r[R_ANK][0])));
  // the lifter's own left is image right when they face the camera: the left shoulder then sits right of the right one
  const left = nanmedian(ksm.map((r) => r[L_SHO][0] - r[R_SHO][0])) >= 0 ? 1 : -1;
  const lw = ksm[caught][L_WRI];
  const rw = ksm[caught][R_WRI];
  const tilt = degrees(Math.asin(clip((rw[1] - lw[1]) / Math.max(1e-6, dist(lw, rw)), -1, 1)));
  const rows: MeasRow[] = [];
  const row = (id: string, label: string, v: number, unit: string, frame: number, note: string) => {
    if (Number.isFinite(v)) rows.push({ id, label, value: pyRound(v, 1), unit, frame: g(frame), status: 'normal', note });
  };
  row('bar_tilt_catch', 'Bar tilt at catch', tilt, 'deg', caught, 'left hand above the right (+) at the catch');
  row('bar_drift_lateral', 'Bar drift sideways', left * cm(bar[caught][0] - bar[setup][0]), 'cm', caught, "towards your left (+) from lift-off to the catch");
  row('hip_shift', 'Hip shift', left * cm(at(caught, L_HIP, R_HIP, 0) - at(caught, L_ANK, R_ANK, 0) - (at(setup, L_HIP, R_HIP, 0) - at(setup, L_ANK, R_ANK, 0))), 'cm', caught, 'hips over the feet, towards your left (+), setup to catch');
  row('stance_setup', 'Stance at setup', cm(width(setup)), 'cm', setup, 'ankle to ankle');
  row('stance_catch', 'Stance at catch', cm(width(caught)), 'cm', caught, 'ankle to ankle');
  return rows;
}

const KEY_NUMBERS = ['max_forward_drift', 'bar_forward_off_hips', 'bar_crash', 'jump_forward', 'catch_height'];
const KEY_FORWARD = new Set(['max_forward_drift', 'bar_forward_off_hips', 'jump_forward']);
export const TRACK_NUMBERS = ['hip_rise', 'bar_over_shoulder', 'knee_catch', 'elbow_pull'];
const TRACK_FORWARD = new Set(['bar_over_shoulder']);

// The result's key numbers: the cue-grade ones measured on a scale the cue trusts, on a whole rep with the bar in
// view, then the track readings (sized from the body when no plate held); forward/back distances only within the
// yaw a distance is still read as a value (design 3.1: 45 deg).
export function keyNumbers(r: RepInfo, meas: MeasRow[]): string[] {
  const side = (r.off_side_deg ?? 0) <= rules.VALUE_MAX_DEG;
  const has = (id: string) => meas.some((m) => m.id === id && m.status !== 'not_seen');
  const cueGrade = !r.snatch || !r.scale_ok || r.bar_lost || r.cut_off ? [] : KEY_NUMBERS.filter((id) => has(id) && (side || !KEY_FORWARD.has(id)));
  return [...cueGrade, ...(side ? [] : FRONT_NUMBERS.filter(has)), ...TRACK_NUMBERS.filter((id) => has(id) && (side || !TRACK_FORWARD.has(id)))];
}

