// cv/catchline_cv/lifts.py: the clean (on the snatch's analyseRep), the jerk and the hanging gymnastics movements.
// The kipping HSPU is not ported.
import { HANG_HIP_W, elbows, facing, hipAngles, kneeAngles, offSidePose, pyMin, rackMask, scaleFromBody, yawFromBody } from './body';
import { lowpass, lowpassPts } from './filter';
import { barTrack, dist, finitePt, fromRef, normalise, toRef, trunkAngle1 } from './geometry';
import { bmuEvents, bmuPhases, chordOffset, cycleTops, hspuEvents, hspuPhases, kipEvents, kipPhases, mergeCycles, pushAway, timingError } from './gym';
import {
  JOINTS,
  K,
  L_ANK,
  L_ELB,
  L_HIP,
  L_KNEE,
  L_SHO,
  L_WRI,
  R_ANK,
  R_ELB,
  R_HIP,
  R_KNEE,
  R_SHO,
  R_WRI,
  col,
  headY,
  lowpassK,
  mid,
  torsoPx,
  ys,
} from './movement';
import {
  Affine,
  Pt,
  argmin,
  fmax,
  fmin,
  int,
  max,
  median,
  nanargmax,
  nanargmin,
  nanmax,
  nanmedian,
  nanmin,
  pyFixed,
  pyFixedSigned,
  pyRound,
  pyRoundInt,
  radians,
  where,
} from './num';
import { speedMeasurement } from './outcome';
import { PhaseOut, StartClass, findJerkReps, findLifts, jerkKeyFrames, runs, segmentJerk } from './phases';
import {
  AnalysisJson,
  CueCard,
  Ctx,
  Detail,
  MeasRow,
  RepInfo,
  Result,
  SnatchExtras,
  Values,
  analyseRep,
  base,
  bestRep,
  fail,
  KEYFRAME_H,
  liftTags,
  maxBy,
  missBehindCard,
  ruleDetail,
  ruleReps,
  severityOf,
  withhold,
} from './pipeline';
import * as rules from './rules';

type Window = { L: number; kw: K; kr: K; ksm: K; Ms: Affine[]; bodyH: number };

function loadWindow(ctx: Ctx, s0: number, e0: number): Window {
  const { Ms } = ctx.input.source.window(s0, e0 - s0);
  const L = Ms.length;
  const kw = ctx.k.slice(s0, s0 + L);
  const bodyH = nanmedian(ctx.boxes.slice(s0, s0 + L).map((b) => b[3] - b[1]));
  const cols = Array.from({ length: JOINTS }, (_, j) => toRef(col(kw, j), Ms));
  const kr = kw.map((_, f) => cols.map((c) => c[f]));
  return { L, kw, kr, ksm: lowpassK(kr, ctx.fps, 6.0), Ms, bodyH };
}

function writeOut(ctx: Ctx, repInfo: RepInfo[]): Result {
  const movement = ctx.movement;
  const best = bestRep(repInfo);
  repInfo.forEach((r, i) => (r.index = i + 1));
  const [measurements, cue0, cueRep] = build(movement, repInfo, best, ctx.W, ctx.H);
  const [cue, noCue] = withhold(cue0, cueRep, measurements);
  const outReps = repInfo.map((r) => ({
    index: r.index,
    startFrame: r.start,
    endFrame: r.end,
    made: r.made,
    phases: r.phases,
    keyFrames: Object.entries(r.keys).map(([phase, f], pi) => ({ phase, frame: f, image: `${ctx.assetPrefix}/r${r.index}-${pi + 1}-${phase}.jpg` })),
    path: r.path,
  }));
  const analysis: AnalysisJson = {
    ...base(ctx.analysisId, ctx.input.meta, ctx.n, movement),
    ...(cueRep.px_per_cm ? { pxPerCm: pyRound((cueRep.px_per_cm * KEYFRAME_H) / ctx.H, 3) } : {}),
    reps: outReps,
    bestRepIndex: best.index,
    cue,
    ...(noCue ? { noCueReason: noCue } : {}),
    notes: rules.notes(movement, ruleReps(repInfo), cue),
    ...liftTags(cueRep),
    measurements,
    failure: null,
  };
  return { analysis, reps: repInfo, repCalls: [] };
}

const LABELS: Record<string, [string, string]> = {
  hips_rise_early: ['Hips rose early', 'hips vs shoulders, floor to knee'],
  bar_forward_off_hips: ['Bar forward off hips', 'after hip contact'],
  jump_forward: ['Jumped forward', 'feet, lift-off to catch'],
  early_arm_bend: ['Early arm bend', 'elbows bent before the hips finished (+ = early)'],
  incomplete_extension: ['Extension short', 'hip angle short of 170° at the top of the pull'],
  forward_dip: ['Bar forward in dip', 'bar, dip start to dip bottom'],
  press_out: ['Press-out', "elbow straightening after the hips' lowest point"],
  chest_dive: ['Chest forward in catch', 'trunk lean from vertical when landing'],
  bar_forward_overhead: ['Bar forward overhead', 'bar vs shoulders at lockout'],
  leg_kip: ['Knee bend in the swing', 'knee range, arch to top'],
  early_arm_pull: ['Arms before hips', 'elbow bend before the hip snap (+ = early)'],
  no_push_away: ['Push-away at the top', 'shoulders back off the bar in 0.4 s'],
  bmu_early_pull: ['Hips under bar at the pull', 'when the elbows start to bend'],
  hips_low_transition: ['Hips under bar at transition', 'highest hip point before the elbows go over'],
  chicken_wing: ['Elbow timing gap', 'time between the two elbows crossing the bar'],
  hspu_banana: ['Hips off the body line', 'hip vs shoulder-ankle line at lockout (+ = away from the wall)'],
  hspu_kip_timing: ['Tuck before the kick', 'knees above the hips at the deepest tuck'],
};

const OUTCOME_HEAD: Record<string, (v: number) => string> = {
  missed_forward: (v) => `Missed forward. The bar left you ${pyFixed(v, 0)} cm in front of mid-foot.`,
  jerk_forward: (v) => `Jerk dumped forward. The bar locked out ${pyFixed(v, 0)} cm in front of your shoulder line.`,
  missed: () => 'Missed.',
};
const head = (kind: string, v: number) => (OUTCOME_HEAD[kind] ?? OUTCOME_HEAD.missed)(v);

function build(movement: string, reps: RepInfo[], best: RepInfo, W: number, H: number): [MeasRow[], CueCard | null, RepInfo] {
  const seenVals = (x: RepInfo) => rules.onScreen(x.values, x.off_side_deg);
  let [cueId, seen] = rules.chooseSetCue(movement, reps.map(seenVals));
  let cueRep = cueId ? maxBy(reps, (r) => rules.fired(seenVals(r))[cueId as string] ?? 0.0) : best;
  const missed = reps.find((x) => x.outcome !== 'make' && x.outcome !== 'unknown');
  if (missed) {
    cueRep = missed;
    const f_ = [...rules.gate(Object.keys(rules.fired(seenVals(missed))))];
    cueId = f_.length ? f_.reduce((a, b) => (rules.RULES[b].order < rules.RULES[a].order ? b : a)) : null;
    seen = cueId ? reps.filter((x) => (cueId as string) in rules.fired(seenVals(x))).length : 0;
  }
  const r = cueRep;
  const fired = rules.fired(seenVals(r));
  const off = r.off_side_deg;
  const angleNote = off !== null && off > 20 ? `; filmed ~${pyFixed(off, 0)}° off side-on, so treat as an estimate` : '';
  const meas: MeasRow[] = [];
  for (const fid of rules.FAULTS[movement]) {
    let [label, note] = LABELS[fid];
    const unit = rules.RULES[fid].unit;
    const v = r.values[fid];
    if (v === null || v === undefined) {
      meas.push({ id: fid, label, value: 0, unit, frame: r.start, status: 'not_seen', note: 'could not measure' });
      continue;
    }
    const status = fid === cueId ? 'cue' : fid in fired ? 'follows' : 'normal';
    if (rules.RULES[fid].horizontal) note += angleNote;
    const nd = unit === 's' ? 2 : 1;
    const m: MeasRow = { id: fid, label, value: pyRound(v, nd), unit, frame: r.s0 + int(r.detail[fid].frame), status, note };
    const bv = best.values[fid];
    if (best !== r && bv !== null && bv !== undefined) m.best = pyRound(bv, nd);
    meas.push(m);
  }
  meas.push(...(r.extra_meas ?? []));
  const kind = r.outcome;
  if (kind === 'missed_behind') return [...missBehindCard(r, meas, W, H), cueRep];
  if (kind === 'could_not_stand' || kind === 'jerk_back' || (kind !== 'make' && cueId === null)) return [meas, outcomeCard(r, kind, meas, W, H), cueRep];
  if (cueId === null) return [meas, null, cueRep];
  const sev = fired[cueId];
  const conf = rules.cueConfidence(cueId, sev, off, seen, reps.length, r.scale_ok ?? true);
  const d = r.detail[cueId];
  const f = int(d.frame);
  const raw = (p: Pt, fr: number) => fromRef(p, r.Ms[fr]);
  const v = r.values[cueId] as number;
  const unit = rules.RULES[cueId].unit;
  let confText = `Seen on ${seen} of ${reps.length} reps`;
  if (off !== null && off > 20) confText += `, filmed ~${pyFixed(off, 0)}° off side-on: film from the side to confirm`;
  let why = rules.whySentence(cueId, r.values, ruleDetail(r.detail[cueId]));
  if (kind !== 'make') why = `${head(kind, r.outcome_value as number)} Earliest thing I can see: ${why[0].toLowerCase()}${why.slice(1)}`;
  const cue: CueCard = {
    faultId: cueId,
    text: rules.CUES[cueId],
    why,
    confidence: conf,
    confidenceText: confText,
    evidence: {
      rep: r.index,
      frame: r.s0 + f,
      from: normalise(raw(d.from as Pt, f), W, H),
      to: normalise(raw(d.to as Pt, f), W, H),
      value: pyRound(v, unit === 's' ? 2 : 1),
      unit,
      caption: d.caption ?? '',
    },
  };
  return [meas, cue, cueRep];
}

function outcomeCard(r: RepInfo, kind: string, meas: MeasRow[], W: number, H: number): CueCard {
  const v = r.outcome_value as number;
  const f = int(r.outcome_frame as number);
  const o = r.outcome_detail as NonNullable<RepInfo['outcome_detail']>;
  let text: string;
  let why: string;
  if (kind === 'could_not_stand') {
    const trunk = o.trunk as number;
    if (trunk > 25) {
      text = 'Elbows up, chest up through the bar.';
      why = `Could not stand up. Your chest was ${pyFixed(trunk, 0)} deg forward at the bottom of the clean, so the bar pulled you over.`;
    } else {
      text = 'Build the front squat at this weight.';
      why = 'Could not stand up. The bar was racked and your chest stayed up, so this was strength at this weight, not a new technique fault.';
    }
  } else if (kind === 'jerk_back') {
    text = 'Drive straight up first, then split.';
    why =
      `Jerk dumped back. The bar finished ${pyFixed(Math.abs(v), 0)} cm behind your shoulder line` +
      ((o.trunk_back ?? 0) > 10 ? `, with your torso leaning ${pyFixed(o.trunk_back as number, 0)} deg back as you landed.` : '.');
  } else {
    text = 'Film one more rep from the side.';
    why = `${head(kind, v)} I can't tell why from this clip; film one more rep and I'll compare.`;
  }
  const off = r.off_side_deg;
  const label = kind.replace(/_/g, ' ');
  meas.push({ id: 'outcome', label: label[0].toUpperCase() + label.slice(1), value: pyRound(v, 1), unit: 'cm', frame: r.s0 + f, status: 'cue', note: o.note ?? '' });
  const raw = (p: Pt) => fromRef(p, r.Ms[f]);
  return {
    faultId: kind,
    text,
    why,
    confidence: (off ?? 0) > 20 ? 'low' : 'worth_checking',
    confidenceText: 'One missed rep' + (off && off > 20 ? `, filmed ~${pyFixed(off, 0)}° off side-on` : ''),
    evidence: {
      rep: r.index,
      frame: r.s0 + f,
      from: normalise(raw(o.from), W, H),
      to: normalise(raw(o.to), W, H),
      value: pyRound(v, 1),
      unit: 'cm',
      caption: o.caption ?? '',
    },
  };
}

function repInfo(
  ctx: Ctx,
  repNo: number,
  s0: number,
  w: Window,
  trace: Pt[],
  phases: PhaseOut[],
  keys: Record<string, number>,
  events: Record<string, number | null>,
  values: Values,
  detail: Record<string, Detail>,
  extra: MeasRow[],
  pxPerCm: number | null,
  off: number | null,
  made: boolean,
  end: number,
  fwd: number,
): RepInfo {
  const g = (f: number) => s0 + int(f);
  const a = phases[0].startFrame;
  const path: RepInfo['path'] = [];
  for (let f = a; f < Math.min(w.L, end + 1); f++)
    if (finitePt(trace[f])) path.push({ frame: g(f), ...normalise(fromRef(trace[f], w.Ms[f]), ctx.W, ctx.H) });
  for (const d of Object.values(detail)) d.caption = d.caption ?? '';
  const ev: Record<string, number> = {};
  for (const [kk, v] of Object.entries(events)) if (v !== null) ev[kk] = g(v);
  const ks: Record<string, number> = {};
  for (const [kk, v] of Object.entries(keys)) ks[kk] = g(v);
  return {
    rep_no: repNo,
    s0,
    start: g(a),
    end: g(end),
    made,
    phases: phases.map((p) => ({ ...p, startFrame: g(p.startFrame), endFrame: g(p.endFrame) })),
    keys: ks,
    events: ev,
    path,
    values,
    detail,
    extra_meas: extra,
    px_per_cm: pxPerCm,
    off_side_deg: off,
    fwd,
    severity: severityOf(values),
    outcome: 'make',
    index: 0,
    Ms: w.Ms,
    track: trace,
    ksm: w.ksm,
  };
}

// ---------------------------------------------------------------- clean

function runClean(ctx: Ctx, forceReps?: [number, number, number][]): Result {
  const { k, fps, H } = ctx;
  const up = (y: number[]) => y.map((v) => H - v);
  const wr = mid(k, L_WRI, R_WRI);
  const rack = rackMask(lowpassK(k, fps), lowpassPts(wr, fps), fps);
  const lifts = findLifts(runs(rack, Math.max(1, int(0.3 * fps))), lowpass(up(ys(wr)), fps), lowpass(up(ys(mid(k, L_KNEE, R_KNEE))), fps),
    lowpass(up(ys(mid(k, L_SHO, R_SHO))), fps), torsoPx(k), fps);
  const reps = forceReps ?? lifts.map((l) => l.window);
  const classes = forceReps ? reps.map((): StartClass => 'floor') : lifts.map((l) => l.startClass);
  const noClean = () => fail(ctx, 'unsupported_movement', 'no_reps', 'No clean found: the bar never went from the floor to a front-rack hold.');
  if (!reps.length) return noClean();
  const infos: RepInfo[] = [];
  const repCalls: (RepInfo | null | false)[] = [];
  let notLifts = 0;
  reps.forEach(([start, end], ri) => {
    const r = analyseRep(ctx, start, end, ri + 1, 'clean', classes[ri]);
    repCalls.push(r);
    if (r === false) notLifts += 1;
    if (r) infos.push(cleanInfo(r));
  });
  if (!infos.length && notLifts) return { ...noClean(), repCalls };
  if (!infos.length)
    return { ...fail(ctx, 'bar_out_of_frame', 'no_plate', 'Could not find the plates at the start of the lift, so the bar could not be measured.'), repCalls };
  return { ...writeOut(ctx, infos), repCalls };
}

function cleanInfo(r: RepInfo): RepInfo {
  const sn = r.snatch as SnatchExtras;
  const ref = sn.ref;
  const lo = ref.lo;
  const det = r.detail;
  for (const [fid, d] of Object.entries(det)) {
    const f = d.frame;
    const v = r.values[fid] as number;
    if (fid === 'hips_rise_early')
      Object.assign(d, { from: ref.hip[lo], to: ref.hip[f], caption: `hips +${pyFixed(d.hip_rise as number, 0)} cm · shoulders +${pyFixed(d.sho_rise as number, 0)} cm` });
    else if (fid === 'bar_forward_off_hips') Object.assign(d, { from: ref.bar[d.from_frame as number], to: ref.bar[f], caption: `hip · ${pyFixed(v, 0)} cm fwd` });
    else if (fid === 'jump_forward') Object.assign(d, { caption: `feet · ${pyFixed(v, 0)} cm fwd` });
    else if (fid === 'early_arm_bend')
      Object.assign(d, { from: mid(ref.ksm, L_ELB, R_ELB)[d.from_frame as number], to: ref.hip[d.to_frame as number], caption: `elbows bend ${pyFixed(v, 2)} s early` });
    else if (fid === 'incomplete_extension') Object.assign(d, { from: ref.sho[f], to: ref.hip[f], caption: `hip ${pyFixed(d.hip_max as number, 0)}° at the top` });
  }
  const ev = r.events;
  const m = r.miss as NonNullable<RepInfo['miss']>;
  r.outcome_value = m.bar_vs_midfoot;
  r.outcome_frame = m.frame;
  r.outcome_detail = {
    from: m.midfoot,
    to: m.bar,
    note: 'bar vs mid-foot when it left you (+ = in front)',
    caption: `bar ${pyFixed(Math.abs(m.bar_vs_midfoot), 0)} cm ${m.bar_vs_midfoot < 0 ? 'behind' : 'in front of'} mid-foot`,
  };
  if (!r.made) {
    const b = (ev.catch_bottom as number) - r.s0;
    const t = torsoPx(ref.ksm);
    const racked = Math.abs(ref.bar[b][1] - ref.sho[b][1]) < 0.35 * t;
    if (racked && nanmax(ref.hip_ang.slice(b)) < 120) {
      const lean = r.fwd * (ref.sho[b][0] - ref.hip[b][0]) > 0 ? 90.0 - ref.trunk[b] : 0.0;
      r.outcome = 'could_not_stand';
      r.outcome_frame = b;
      r.outcome_value = sn.catch_depth;
      r.outcome_detail = { from: ref.hip[b], to: ref.sho[b], trunk: lean, note: 'racked, then the hips never opened past 120°', caption: `chest ${pyFixed(lean, 0)}° forward` };
    }
  }
  r.extra_meas = [
    { id: 'bar_peak_height', label: 'Bar peak height', value: pyRound(sn.peak_h, 1), unit: 'cm', frame: ev.peak as number, status: 'normal', note: 'above lift-off (wrist midpoint)' },
    {
      id: 'catch_depth',
      label: 'Catch depth',
      value: pyRound(Math.abs(sn.catch_depth), 1),
      unit: 'cm',
      frame: sn.catch_depth_frame,
      status: 'normal',
      note: `${sn.catch_kind} clean, hip ${sn.catch_depth > 0 ? 'below' : 'above'} knee, knee ${pyFixed(sn.catch_knee_min, 0)}°`,
    },
    { id: 'turnover_time', label: 'Extension to rack', value: pyRound(sn.turnover_s, 2), unit: 's', frame: ev.second_ext as number, status: 'normal', note: '± 1 frame at 30 fps' },
    speedMeasurement(sn.bar_speed, r.scale_method as string, ev.second_ext as number),
  ];
  return r;
}

// ---------------------------------------------------------------- jerk

function runJerk(ctx: Ctx, forceReps?: [number, number, number][]): Result {
  const { k, fps, H } = ctx;
  const up = (y: number[]) => y.map((v) => H - v);
  const t = torsoPx(k);
  const wr = lowpass(up(ys(mid(k, L_WRI, R_WRI))), fps);
  const sho = lowpass(up(ys(mid(k, L_SHO, R_SHO))), fps);
  const hd = lowpass(up(headY(k, t)), fps);
  // a dip and drive take under a second, so a rack hold that began with the clean's catch is cut to 1.5 s before
  // the bar goes overhead
  const found = findJerkReps(
    wr.map((w, i) => Math.abs(w - sho[i]) < 0.35 * t),
    wr.map((w, i) => w > hd[i]),
    fps,
  ).map(([s, e, a]): [number, number, number] => [Math.max(s, a - int(1.5 * fps)), e, a]);
  const reps = forceReps ?? found;
  if (!reps.length) return fail(ctx, 'unsupported_movement', 'no_reps', 'No jerk found: the bar never went from the shoulders to overhead.');
  const pxBody = scaleFromBody(k);
  if (!pxBody) return fail(ctx, 'too_far', 'no_body_scale', "Could not measure the lifter's body to scale the clip.");
  const infos = reps.map(([start, end], ri): RepInfo => ({ ...jerkRep(ctx, ri + 1, start, end, pxBody), start_class: 'shoulders' }));
  return { ...writeOut(ctx, infos), repCalls: infos };
}

function jerkRep(ctx: Ctx, repNo: number, start: number, end: number, pxPerCm: number): RepInfo {
  const { fps, n } = ctx;
  const s0 = Math.max(0, start - int(0.3 * fps));
  const e0 = Math.min(n, end + int(0.5 * fps));
  const w = loadWindow(ctx, s0, e0);
  const { ksm, kr, L } = w;
  const t = torsoPx(ksm);
  const bar = lowpassPts(barTrack(col(kr, L_WRI), col(kr, R_WRI), w.bodyH), fps, 6.0);
  const kneeAng = kneeAngles(ksm);
  const el = fmax(...elbows(ksm));
  const o = start - s0;
  const [ph, ev0] = segmentJerk(
    bar.slice(o).map((p) => -p[1]),
    kneeAng.slice(o),
    el.slice(o),
    fps,
  );
  const phases = ph.map((p) => ({ ...p, startFrame: p.startFrame + o, endFrame: p.endFrame + o }));
  const ev = Object.fromEntries(Object.entries(ev0).map(([kk, v]) => [kk, v + o])) as typeof ev0;
  const fwd = ev.leave > ev.dip_start ? facing(ksm.slice(ev.dip_start, ev.leave + 1)) : facing(ksm);
  const off = yawFromBody(ksm, 0, L - 1);
  const fs = 1 / Math.cos(radians(pyMin(off === null || off === 0 ? 0.0 : off, 60.0)));
  const cm = (px: number) => px / pxPerCm;
  const sho = mid(ksm, L_SHO, R_SHO);
  const hip = mid(ksm, L_HIP, R_HIP);
  const { dip_start: ds, dip_bottom: db, land, recovered: rec } = ev;
  const lock = Math.min(rec, L - 1);
  const vals: Values = {};
  const det: Record<string, Detail> = {};
  const fd = cm(fwd * (bar[db][0] - bar[ds][0])) * fs;
  vals.forward_dip = fd;
  det.forward_dip = { frame: db, from: bar[ds], to: bar[db], caption: `dip · ${pyFixed(fd, 0)} cm fwd` };
  const hipH = hip.map((p) => -p[1]);
  const hm = land + argmin(hipH.slice(land, Math.min(L, land + int(0.6 * fps) + 1)));
  const rise = where(hipH.slice(hm).map((v) => v > hipH[hm] + 0.05 * t));
  const he = hm + (rise.length ? rise[0] : 0);
  const po = el[hm] < 165 ? max(el.slice(hm, he + 1)) - el[hm] : 0.0;
  vals.press_out = po;
  det.press_out = {
    frame: hm,
    from: mid(ksm, L_ELB, R_ELB)[hm],
    to: bar[hm],
    elbow_land: el[hm],
    caption: `elbow ${pyFixed(el[hm], 0)}° at the bottom, +${pyFixed(po, 0)}° after`,
  };
  const lean = 90.0 - trunkAngle1(sho[land], hip[land]);
  const leanFwd = fwd * (sho[land][0] - hip[land][0]) > 0;
  const cd = leanFwd ? lean : -lean;
  vals.chest_dive = cd;
  det.chest_dive = { frame: land, from: hip[land], to: sho[land], caption: `chest ${pyFixed(cd, 0)}° forward` };
  const ov = cm(fwd * (bar[lock][0] - sho[lock][0])) * fs;
  vals.bar_forward_overhead = ov;
  det.bar_forward_overhead = { frame: lock, from: sho[lock], to: bar[lock], caption: `bar · ${pyFixed(ov, 0)} cm fwd` };
  const sep = ksm.map((r) => Math.abs(fwd * (r[L_ANK][0] - r[R_ANK][0])));
  const ankMid = mid(ksm, L_ANK, R_ANK);
  const leg = nanmedian(hip.map((p, i) => dist(p, ankMid[i])));
  const catchSep = lock >= land ? nanmax(sep.slice(land, lock + 1)) : 0.0;
  const style = catchSep > 0.3 * leg ? 'split' : 'push';
  const rackH = median(bar.slice(o, o + Math.max(3, int(0.3 * fps))).map((p) => -p[1]));
  const dipKnee = kneeAng[ds] - kneeAng[db];
  const extra: MeasRow[] = [
    { id: 'dip_depth', label: 'Dip depth', value: pyRound(cm(rackH - -bar[db][1]), 1), unit: 'cm', frame: s0 + db, status: 'normal', note: 'bar drop from the rack' },
    { id: 'catch_style', label: 'Foot split', value: pyRound(cm(catchSep), 1), unit: 'cm', frame: s0 + land, status: 'normal', note: `${style} jerk (ankles apart front to back)` },
    { id: 'lockout_elbow', label: 'Lockout elbow', value: pyRound(el[lock], 1), unit: 'deg', frame: s0 + lock, status: 'normal', note: 'standard: arms straight overhead' },
    {
      id: 'dip_knee',
      label: 'Knee bend in the dip',
      value: pyRound(dipKnee, 1),
      unit: 'deg',
      frame: s0 + db,
      status: 'normal',
      note: dipKnee < 10 ? 'under ~10° there is no leg drive: a press, not a jerk' : 'dip and drive',
    },
  ];
  const made = rec < L - 1 && el[lock] >= 155;
  const kind = made ? 'make' : ov > 5 ? 'jerk_forward' : ov < -8 ? 'jerk_back' : 'missed';
  const tb = !leanFwd ? lean : 0.0;
  const info = repInfo(ctx, repNo, s0, w, bar, phases, jerkKeyFrames(ev), ev, vals, det, extra, pxPerCm, off, made, rec, fwd);
  return {
    ...info,
    outcome: kind,
    outcome_value: ov,
    outcome_frame: lock,
    outcome_detail: {
      from: sho[lock],
      to: bar[lock],
      trunk_back: tb,
      note: 'bar vs shoulder line at lockout (+ = in front)',
      caption: `bar ${pyFixed(Math.abs(ov), 0)} cm ${ov < 0 ? 'behind' : 'in front of'} shoulders`,
    },
  };
}

// ---------------------------------------------------------------- gymnastics (hanging)

function runGym(ctx: Ctx, forceCycles?: [number, number, number][]): Result {
  const { movement, k, fps, H } = ctx;
  const up = (y: number[]) => y.map((v) => H - v);
  const t = torsoPx(k);
  const sho = lowpass(up(ys(mid(ctx.world, L_SHO, R_SHO))), fps);
  const pxPerCm = scaleFromBody(k);
  if (!pxPerCm) return fail(ctx, 'too_far', 'no_body_scale', "Could not measure the athlete's body to scale the clip.");
  const wri = lowpass(up(ys(mid(ctx.world, L_WRI, R_WRI))), fps);
  const rel = sho.map((v, i) => v - wri[i]);
  if (movement === 'kipping_hspu') {
    // a rep bottoms out with the shoulders near the hands (head on the floor) and tops out arms-length above
    const cyc = forceCycles ?? cycleTops(sho.map((v) => -v), t, fps, 0.3).filter((c) => rel[c[1]] < 0.4 * t);
    const noReps = () => fail(ctx, 'unsupported_movement', 'no_reps', 'No handstand push-up reps found in this clip.');
    if (!cyc.length) return noReps();
    const infos: RepInfo[] = [];
    cyc.forEach(([a, bottom, b], ri) => {
      const r = hspuRep(ctx, ri + 1, a, bottom, b, pxPerCm);
      if (r !== null) infos.push(r);
    });
    if (!infos.length) return noReps();
    return { ...writeOut(ctx, infos), repCalls: infos };
  }
  const el = lowpass(fmin(...elbows(k)), fps);
  const topMin = movement === 'kipping_pull_up' ? -0.35 * t : 0.2 * t;
  let cyc = cycleTops(sho, t, fps, 0.4).filter(
    (c) => rel[c[1]] > topMin && nanmin(el.slice(Math.max(0, c[1] - int(0.5 * fps)), c[1] + int(0.5 * fps) + 1)) < 120,
  );
  cyc = mergeCycles(cyc, sho, rel, -0.75 * t);
  if (forceCycles) cyc = forceCycles;
  const name = movement === 'kipping_pull_up' ? 'pull' : 'muscle-up';
  if (!cyc.length) return fail(ctx, 'unsupported_movement', 'no_reps', `No ${name} reps found in this clip.`);
  const shoY = (a: number, b: number) => k.slice(a, b + 1).flatMap((r) => [r[L_SHO][1], r[R_SHO][1]]);
  if (cyc.some(([a, , b]) => {
    const v = shoY(a, b).filter((x) => !Number.isNaN(x));
    return v.length > 0 && Math.min(...v) < 0.03 * H;
  }))
    return fail(
      ctx,
      'clip_cut_off',
      'shoulders_cut_off',
      'The bar and the top of the rep are out of the frame. Film with the bar and some space above it in view.',
    );
  const infos: RepInfo[] = [];
  cyc.forEach(([a, top, b], ri) => {
    const r = hangRep(ctx, ri + 1, a, top, b, pxPerCm, ri === cyc.length - 1);
    if (r !== null) infos.push(r);
  });
  if (!infos.length) return fail(ctx, 'unsupported_movement', 'no_reps', `No ${name} reps found in this clip.`);
  return { ...writeOut(ctx, infos), repCalls: infos };
}

function hspuRep(ctx: Ctx, repNo: number, top0: number, bottom: number, top1: number, pxPerCm: number): RepInfo | null {
  const { fps, n } = ctx;
  const s0 = Math.max(0, top0 - int(0.3 * fps));
  const e0 = Math.min(n, top1 + int(0.3 * fps) + 1);
  const w = loadWindow(ctx, s0, e0);
  const { ksm, L } = w;
  const T0 = top0 - s0;
  const T1 = Math.min(top1 - s0, L - 1);
  const sho = mid(ksm, L_SHO, R_SHO);
  const hip = mid(ksm, L_HIP, R_HIP);
  const ank = mid(ksm, L_ANK, R_ANK);
  const wri = mid(ksm, L_WRI, R_WRI);
  const knee = mid(ksm, L_KNEE, R_KNEE);
  const inverted = ank.map((p, i) => p[1] < sho[i][1]);
  const inv = inverted.slice(T0, T1 + 1);
  if (inv.filter(Boolean).length / inv.length < 0.5) return null;
  const wallDir = nanmedian(ank.flatMap((p, i) => (inverted[i] ? [p[0] - wri[i][0]] : []))) >= 0 ? 1.0 : -1.0;
  const hipAng = hipAngles(ksm);
  const kneeAng = kneeAngles(ksm);
  const el = fmax(...elbows(ksm));
  const ev = hspuEvents(sho.map((p) => -p[1]), hipAng, kneeAng, el, T0, T1);
  const off = offSidePose(ksm);
  const fs = 1 / Math.cos(radians(pyMin(off ?? 0.0, 60.0)));
  const cm = (px: number) => px / pxPerCm;
  const lk = ev.lockout;
  const vals: Values = {};
  const det: Record<string, Detail> = {};
  vals.hspu_banana = cm(chordOffset(sho[lk], hip[lk], ank[lk], -wallDir)) * fs;
  det.hspu_banana = { frame: lk, from: [(sho[lk][0] + ank[lk][0]) / 2, (sho[lk][1] + ank[lk][1]) / 2], to: hip[lk], caption: `hips ${pyFixed(vals.hspu_banana, 0)} cm off line` };
  // how far the knees stayed above the hips at the deepest tuck before the kick
  const b_ = Math.max(T0, ev.drive);
  const gap: number[] = [];
  for (let f = T0; f <= b_; f++) gap.push(-(knee[f][1] - hip[f][1]));
  const tf = T0 + nanargmin(gap);
  vals.hspu_kip_timing = cm(gap[tf - T0]);
  det.hspu_kip_timing = { frame: tf, from: hip[tf], to: knee[tf], caption: `knees ${pyFixed(vals.hspu_kip_timing, 0)} cm above hips` };
  const timing = timingError(ev.drive, ev.press, fps);
  const extra: MeasRow[] = [
    { id: 'lockout_elbow', label: 'Lockout elbow', value: pyRound(el[lk], 1), unit: 'deg', frame: s0 + lk, status: 'normal', note: 'standard: arms straight at the top (≥160°)' },
    { id: 'tuck_hip', label: 'Tuck', value: pyRound(hipAng[ev.tuck], 1), unit: 'deg', frame: s0 + ev.tuck, status: 'normal', note: 'tightest hip angle before the drive (<90° = full tuck)' },
    {
      id: 'drive_press',
      label: 'Drive to press',
      value: pyRound((ev.press - ev.drive) / fps, 2),
      unit: 's',
      frame: s0 + ev.press,
      status: 'normal',
      note: 'press after the leg drive; 0 to 0.25 s is in time' + (timing === 0 ? '' : ` (${pyFixed(timing, 2)} s outside)`),
    },
    {
      id: 'bottom_depth',
      label: 'Shoulders above hands at bottom',
      value: pyRound(cm(wri[ev.bottom][1] - sho[ev.bottom][1]), 1),
      unit: 'cm',
      frame: s0 + ev.bottom,
      status: 'normal',
      note: 'smaller = deeper (head to the floor)',
    },
  ];
  const phases = hspuPhases(ev);
  const keys = { tuck: ev.tuck, drive: ev.drive, press: ev.press, lockout: lk };
  return repInfo(ctx, repNo, s0, w, hip, phases, keys, { ...ev }, vals, det, extra, pxPerCm, off, el[lk] >= 160, T1, wallDir);
}

function hangRep(ctx: Ctx, repNo: number, a: number, top: number, b: number, pxPerCm: number, last: boolean): RepInfo | null {
  const { movement, fps, n } = ctx;
  const s0 = Math.max(0, a - int(0.6 * fps));
  const e0 = Math.min(n, b + int(0.2 * fps) + 1);
  const w = loadWindow(ctx, s0, e0);
  const { ksm, L } = w;
  const tPx = torsoPx(ksm);
  const T = top - s0;
  const B = Math.min(b - s0, L - 1);
  const sho = mid(ksm, L_SHO, R_SHO);
  const hip = mid(ksm, L_HIP, R_HIP);
  const knee = mid(ksm, L_KNEE, R_KNEE);
  const wri = mid(ksm, L_WRI, R_WRI);
  const hanging = wri.map((p, i) => p[1] < sho[i][1] - 0.3 * tPx);
  if (hanging.filter(Boolean).length < 3) return null;
  const hw = wri.filter((_, i) => hanging[i]);
  const barY = median(hw.map((p) => p[1])) - 0.12 * tPx;
  const barX = median(hw.map((p) => p[0]));
  const barH = -barY;
  const fwd = hanging.some(Boolean) ? facing(ksm.filter((_, i) => hanging[i])) : 1.0;
  const off = offSidePose(ksm, HANG_HIP_W);
  const fs = 1 / Math.cos(radians(pyMin(off === null || off === 0 ? 0.0 : off, 60.0)));
  const cm = (px: number) => px / pxPerCm;
  const legsFwd = knee.map((p, i) => fwd * (p[0] - hip[i][0]));
  const hipAng = hipAngles(ksm);
  const kneeAng = kneeAngles(ksm);
  const el = fmax(...elbows(ksm));
  const kip = kipEvents(legsFwd, hipAng, el, 0, T);
  const vals: Values = {};
  const det: Record<string, Detail> = {};
  let extra: MeasRow[];
  let phases: PhaseOut[];
  let keys: Record<string, number>;
  let events: Record<string, number | null>;
  let made: boolean;
  if (movement === 'kipping_pull_up') {
    const kw = kneeAng.slice(kip.arch_start, T + 1);
    const lk = nanmax(kw) - nanmin(kw);
    vals.leg_kip = lk;
    const kf = kip.arch_start + nanargmin(kw);
    det.leg_kip = { frame: kf, from: hip[kf], to: knee[kf], caption: `knees through ${pyFixed(lk, 0)}°` };
    const eap = (kip.hip_open - kip.elbow_break) / fps;
    vals.early_arm_pull = eap;
    const eb = kip.elbow_break;
    det.early_arm_pull = { frame: eb, from: mid(ksm, L_ELB, R_ELB)[eb], to: hip[kip.hip_open], caption: `elbows ${pyFixedSigned(eap, 2)} s before hips` };
    if (!last) {
      const pa = cm(pushAway(sho.map((p) => fwd * p[0]), T, fps)) * fs;
      vals.no_push_away = pa;
      det.no_push_away = { frame: T, from: sho[T], to: [barX, barY], caption: `push-away ${pyFixed(pa, 0)} cm` };
    } else vals.no_push_away = null;
    const chin = cm(-sho[T][1] - barH) + 12.0;
    made = chin > 0;
    const hx = hip.slice(0, T + 1).map((p) => fwd * p[0]);
    extra = [
      { id: 'chin_over_bar', label: 'Chin over bar (est.)', value: pyRound(chin, 1), unit: 'cm', frame: s0 + T, status: 'normal', note: 'estimated from the shoulders (+12 cm); no head points are kept' },
      { id: 'swing', label: 'Swing', value: pyRound(cm(nanmax(hx) - nanmin(hx)) * fs, 1), unit: 'cm', frame: s0 + T, status: 'normal', note: 'hip travel front to back' },
    ];
    phases = kipPhases(kip, B);
    keys = { arch: kip.arch_start, hollow: kip.hollow_start, hip_drive: kip.hip_open, recovery: T };
    events = { ...kip };
  } else {
    const ev = bmuEvents(
      kip,
      ksm.map((r) => -r[L_ELB][1]),
      ksm.map((r) => -r[R_ELB][1]),
      sho.map((p) => -p[1]),
      el,
      barH,
      tPx,
      B,
    );
    const eb = kip.elbow_break;
    const bep = cm(barH - -hip[eb][1]);
    vals.bmu_early_pull = bep;
    det.bmu_early_pull = { frame: eb, from: [hip[eb][0], barY], to: hip[eb], caption: `hips ${pyFixed(bep, 0)} cm under bar` };
    const upto = ev.cross !== null ? ev.cross : T;
    const hp = nanargmax(hip.slice(0, upto + 1).map((p) => -p[1]));
    const hlt = cm(barH - -hip[hp][1]);
    vals.hips_low_transition = hlt;
    det.hips_low_transition = { frame: hp, from: [hip[hp][0], barY], to: hip[hp], caption: `hips peak ${pyFixed(hlt, 0)} cm under` };
    const ksw = ctx.ks.slice(s0, s0 + L);
    const crossings = [L_ELB, R_ELB].map((j) => {
      const over = where(ksm.slice(kip.hip_open, B + 1).map((r) => -r[j][1] > barH));
      return over.length ? kip.hip_open + over[0] : null;
    });
    const [ca, cb] = crossings;
    if (ca !== null && cb !== null && ksw[ca][L_ELB] > 0.5 && ksw[cb][R_ELB] > 0.5) {
      const c0 = Math.min(ca, cb);
      const c1 = Math.max(ca, cb);
      const gap = (c1 - c0) / fps;
      vals.chicken_wing = gap;
      const late = ca > cb ? 'left' : 'right';
      det.chicken_wing = {
        frame: c1,
        from: ksm[c0][ca === c0 ? L_ELB : R_ELB],
        to: ksm[c1][ca === c1 ? L_ELB : R_ELB],
        gap_s: gap,
        side: c1 > c0 ? late : 'late',
        caption: `${late} elbow ${pyRoundInt(((c1 - c0) / fps) * 100) * 10} ms later`,
      };
    } else vals.chicken_wing = null;
    const lockEl = ev.support !== null ? nanmax(el.slice(ev.support, B + 1)) : nanmax(el.slice(T, B + 1));
    const over = cm(nanmax(sho.slice(0, B + 1).map((p) => -p[1])) - barH);
    made = ev.lockout !== null;
    extra = [
      {
        id: 'support_lockout',
        label: 'Lockout in support',
        value: pyRound(lockEl, 1),
        unit: 'deg',
        frame: s0 + (ev.lockout !== null ? ev.lockout : T),
        status: 'normal',
        note: 'standard: elbows straight (≥160°) with shoulders over the bar',
      },
      { id: 'shoulders_over_bar', label: 'Shoulders over bar', value: pyRound(over, 1), unit: 'cm', frame: s0 + T, status: 'normal', note: 'highest shoulder point vs the bar line' },
    ];
    phases = bmuPhases(ev, B);
    keys = Object.fromEntries(phases.map((p) => [p.name, p.startFrame]));
    events = { ...ev };
  }
  return repInfo(ctx, repNo, s0, w, hip, phases, keys, events, vals, det, extra, pxPerCm, off, made, B, fwd);
}

export function run(ctx: Ctx, forceReps?: [number, number, number][]): Result {
  if (ctx.movement === 'clean') return runClean(ctx, forceReps);
  if (ctx.movement === 'jerk') return runJerk(ctx, forceReps);
  return runGym(ctx, forceReps);
}
