// cv/catchline_cv/pipeline.py after pose: the movement check, the snatch (and, via analyseRep, the clean) rep
// measurement, the cue card and the withholding rules. Frames inside a rep are window indices unless named abs.
import { MAX_YAW_DEG, cleanPullValues, hipAngles, kneeAngles, rackMask, scaleFromBody, yawFromBody } from './body';
import { detect, Detected } from './detect';
import { lowpass, lowpassPts } from './filter';
import { angle, barFromWrists, barTrack, dist, finitePt, fromRef, normalise, toRef, toWorld, trunkAngle } from './geometry';
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
import { CAUSE_CUE, behindCause, behindCopy, classify, peakUpSpeed, speedMeasurement } from './outcome';
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
import { DeviceInput, PlateObservation } from './source';

export const KEYFRAME_H = 1080;
const PLATE_CM = 45.0;
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
  path: ({ frame: number } & Point)[];
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
  const noLift = () => fail(ctx, 'unsupported_movement', 'no_reps', 'No floor-to-overhead lift found in this clip.');
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
      ...fail(ctx, 'bar_out_of_frame', 'no_plate', 'Could not find the plates at the start of the lift, so the bar could not be measured.'),
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
  const bar: Pt[] = lowpassPts(barTrack(col(kr, L_WRI), col(kr, R_WRI), bodyH), fps, 6.0);
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
  const seed = Math.max(0, lo - 3);
  const setupH = nanmedian(boxH(s0 + Math.max(0, lo - 24), s0 + lo + 1));
  const platesAt = (f: number): Plate[] => source.plates(s0 + f, kw[f][L_WRI], kw[f][R_WRI], bodyH, setupH).map((p) => ({ ...p }));
  const plates = platesAt(seed);
  const bodyScale = scaleFromBody(kw);
  // no plate at setup: the body sizes the lift and the pose gives the angle, as for a plate not on the lifter's bar
  if (!plates.length && !bodyScale) return null;
  const samples: Plate[][] = [];
  if (plates.length) for (let f = Math.max(0, lo - 24); f < lo; f += 3) samples.push(platesAt(f));
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
  const released = ev.hold_end < L;
  const cutOff = (s0 === 0 && lo < int(0.3 * fps)) || (s0 + L >= n && !released && !made);
  const outcomeKind = made || released ? classify(made, barVsMid, barVx) : 'unknown';
  const lean = (f: number) => 90.0 - trunk[f];
  const ahead = (f: number) => fwd * (sho[f][0] - hip[f][0]) > 0;
  const vx = gradient(bar.map((p) => fwd * p[0])).map((g) => ((g * fps) / pxPerCm) * foreshort);
  const swingF = contact + argmax(xsFwd);
  const miss: Miss = {
    bar_vs_midfoot: barVsMid,
    bar_vx: barVx,
    frame: fEnd,
    fwd_excursion: vals.bar_forward_off_hips,
    pvx_minus: min(vx.slice(swingF, Math.min(L, ev.caught + int(0.3 * fps)) + 1)),
    hip_past_ankle: cm(fwd * (hip[ev.second_ext][0] - ank[ev.second_ext][0])) * foreshort,
    trunk_back: ahead(ev.peak) ? 0.0 : lean(ev.peak),
    foot_dx: vals.jump_forward,
    trunk_fwd_catch: ahead(ev.caught) ? lean(ev.caught) : 0.0,
    max_hip: max(hipAng.slice(lo, ev.peak + 1)),
    bar_behind: -cm(fwd * (bar[ev.peak][0] - sho[ev.peak][0])) * foreshort,
    midfoot: midfoot[fEnd],
    bar: bar[fEnd],
  };
  if (outcomeKind === 'missed_behind') vals.jump_forward = null;
  const g = (f: number) => s0 + int(f);
  const path: RepInfo['path'] = [];
  for (let f = phases[0].startFrame; f < L; f++) if (f <= ev.recovered) path.push({ frame: g(f), ...normalise(fromRef(bar[f], Ms[f]), W, H) });
  const sp = peakUpSpeed(barY, fps, pxPerCm, ev.liftoff, ev.caught);
  const barLost = kind === 'snatch' && bar[ev.peak][1] > sho[ev.peak][1];
  const catchEnd = Math.max(ev.caught, depthEnd);
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
    bar_lost: barLost,
    miss,
    snatch: {
      off_side_estimates: offEst,
      span_cm: spanCm,
      plates,
      catch_depth: valsDepth,
      catch_depth_frame: g(depthF),
      catch_kind: catchKind,
      catch_knee_min: min(kneeAng.slice(ev.caught, catchEnd + 1)),
      peak_h: peakH,
      drop,
      turnover_s: turnoverS,
      standing_h: standingH,
      bar_speed: sp ? [sp[0], g(sp[1])] : null,
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
    speedMeasurement(sn.bar_speed, r.scale_method as string, r.events.second_ext as number),
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
