// Catchline 3.1 eval loop (design section 7.3 phase 1): the phone pipeline over the fixed clip sets, on a Mac.
//   sets   --evalset DIR --owner DIR --golden DIR... --design DIR         -> clips.json (labels + the 3.0 baseline)
//   run    --clips clips.json --harness BIN --models DIR --cache DIR --out DIR [--only a,b] [--sets owner,public]
//   score  --clips clips.json --out DIR                                    -> scoreboard.json (section 8.3 metrics)
//   sheet  --clips clips.json --out DIR [--base DIR]                       -> sheet.html (stills, bar path, cue vs before)
// Pose is cached per clip (harness --run-out), the pixel stages per plan hash, so a logic change re-runs node only.
// Bundle for the Mini with: npx esbuild scripts/eval31/run.ts --bundle --platform=node --format=cjs --outfile=<f>
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { gunzipSync } from 'zlib';

import { analyseTraceResult, planFromMisses } from '../../src/analysis/device/analyseTrace';
import { Trace, parseTraceJson } from '../../src/analysis/device/trace';

type Baseline = { cue: string | null; nReps: number | null; status: string | null; reason: string | null; noCue?: string | null };
type Clip = {
  id: string;
  set: 'owner' | 'golden' | 'public';
  file: string;
  movement: string;
  labelMovement: string;
  group: string;
  // camera yaw label: the eye estimate's bin centre (owner) or the manifest bin's centre (public); null if none
  angleDeg: number | null;
  angleLabel: string;
  labelReps: number | null;
  baseline: Baseline | null;
  notes: string;
};

const args = process.argv.slice(2);
const cmd = args.shift();
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const opts = (k: string) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []));
const log = (s: string) => process.stderr.write(s + '\n');
const gz = (p: string) => gunzipSync(readFileSync(p)).toString();
const writeJson = (p: string, o: unknown) => writeFileSync(p, JSON.stringify(o));

// movements the pipeline knows; the public manifest's names map onto them as 3.0 ran them
const RUN_AS: Record<string, string> = {
  snatch: 'snatch', power_snatch: 'snatch', hang_snatch: 'snatch',
  clean: 'clean', power_clean: 'clean', hang_clean: 'clean', clean_and_jerk: 'clean',
  push_jerk: 'jerk', split_jerk: 'jerk', jerk: 'jerk',
  kipping_pull_up: 'kipping_pull_up', bar_muscle_up: 'bar_muscle_up', kipping_hspu: 'kipping_hspu',
};
const OWNER_MOVEMENT: Record<string, string> = { EDF10BB7: 'bar_muscle_up', BD1AE773: 'bar_muscle_up', A1F2F738: 'kipping_pull_up', '21B27BAF': 'snatch', E0DF8887: 'snatch' };

function csv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const binCentre = (s: string): number | null => {
  const m = s.match(/(\d+)-(\d+)/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  return s === 'side' ? 5 : s === '45' ? 45 : s === 'front' ? 80 : null;
};

function sets() {
  const evalset = opt('evalset')!, owner = opt('owner')!, design = opt('design')!;
  const clips: Clip[] = [];
  // owner: the app-format clips with the design agent's eye labels and compare.jsonl's "current" mode as 3.0
  // labels_rev.tsv is the second look at the angled clips and wins over labels.tsv
  const labels = new Map(['labels.tsv', 'labels_rev.tsv'].filter((f) => existsSync(join(design, 'lifts', f))).flatMap((f) =>
    readFileSync(join(design, 'lifts', f), 'utf8').trim().split('\n').map((l) => {
      const [id, movement, angle, framing = '', notes = ''] = l.split('\t');
      return [id, { movement, angle, notes: [framing, notes].filter(Boolean).join('; ') }] as const;
    })));
  const compare = new Map<string, Record<string, unknown>>();
  const cmpPath = join(design, 'lifts', 'out', 'compare.jsonl');
  if (existsSync(cmpPath)) for (const l of readFileSync(cmpPath, 'utf8').trim().split('\n')) { const j = JSON.parse(l); compare.set(j.id, j); }
  for (const f of readdirSync(owner).filter((x) => x.endsWith('.mp4')).sort()) {
    const id = f.split('.')[0], short = id.slice(-8);
    const lab = labels.get(short);
    const cur = compare.get(short)?.current as Record<string, unknown> | undefined;
    const baseline: Baseline | null = cur
      ? { cue: (cur.cue as { faultId: string } | null)?.faultId ?? null, nReps: ((cur.reps as unknown[]) ?? []).length,
          status: cur.failure ? 'failed' : cur.cue ? 'full' : 'partial', reason: (cur.failure as { reason: string } | null)?.reason ?? null,
          noCue: (cur.noCueReason as { code: string } | null)?.code ?? null }
      : null;
    clips.push({ id, set: 'owner', file: join(owner, f), movement: lab?.movement ?? OWNER_MOVEMENT[short] ?? 'auto', labelMovement: lab?.movement ?? 'unknown',
      group: 'owner', angleDeg: lab ? binCentre(lab.angle) : null, angleLabel: lab?.angle ?? '', labelReps: null, baseline, notes: lab?.notes ?? 'unlabelled' });
  }
  // golden: the parity clips (originals and app transcodes)
  for (const dir of opts('golden')) for (const f of readdirSync(dir).filter((x) => /\.(mov|mp4)$/i.test(x)).sort()) {
    const id = f.replace(/\.(mov|mp4)$/i, (m) => '_' + m.slice(1).toLowerCase()), short = f.split('.')[0].slice(-8);
    if (clips.some((c) => c.id === id)) continue;
    const lab = labels.get(short);
    clips.push({ id, set: 'golden', file: join(dir, f), movement: lab?.movement ?? OWNER_MOVEMENT[short] ?? 'auto', labelMovement: lab?.movement ?? 'unknown',
      group: 'golden', angleDeg: lab ? binCentre(lab.angle) : null, angleLabel: lab?.angle ?? '', labelReps: null, baseline: null, notes: lab?.notes ?? '' });
  }
  // public: the CC set with the uploader's rep count and results.jsonl (3.0) as the baseline
  const results = new Map<string, Record<string, unknown>>();
  for (const l of readFileSync(join(evalset, 'results.jsonl'), 'utf8').trim().split('\n')) { const j = JSON.parse(l); results.set(j.id, j); }
  for (const m of csv(readFileSync(join(evalset, 'manifest.csv'), 'utf8'))) {
    const file = join(evalset, m.file);
    if (!existsSync(file)) continue;
    const r = results.get(m.id);
    const movement = m.run_as || (r?.run_movement as string) || RUN_AS[m.movement] || 'auto';
    const reps = m.title_reps === '1?' ? 1 : m.title_reps ? Number(m.title_reps) : null;
    clips.push({ id: m.id, set: 'public', file, movement, labelMovement: m.movement, group: m.group === 'negative' ? 'negative' : m.angle_estimate,
      angleDeg: binCentre(m.angle_estimate), angleLabel: m.angle_estimate, labelReps: Number.isFinite(reps) ? reps : null,
      baseline: r ? { cue: (r.cue as string) ?? null, nReps: (r.n_reps as number) ?? 0, status: r.status as string, reason: (r.reason as string) ?? null } : null,
      notes: m.notes });
  }
  process.stdout.write(JSON.stringify(clips, null, 1));
  log(`${clips.length} clips: ${['owner', 'golden', 'public'].map((s) => `${s} ${clips.filter((c) => c.set === s).length}`).join(', ')}`);
}

type Row = {
  id: string; set: string; group: string; movement: string; movementRun: string;
  status: 'full' | 'partial' | 'failed' | 'error';
  failure: { reason: string; code: string } | null;
  cue: string | null; noCue: { code: string; offSideDeg?: number } | null;
  detected: { movement: string; confidence: number } | null;
  nReps: number; made: boolean[];
  reps: { start: number; end: number; made: boolean; outcome: string; offSide: number | null; scale: string | null; liftoff: number | null }[];
  yawDeg: number | null;
  startClass?: string | null;
  yawBucket?: string | null;
  liftKind?: string | null;
  stills?: string | null;
  rounds: number; misses: number;
  timing: { poseS: number; pixelsS: number; nodeMs: number };
  error?: string;
};

function sh(bin: string, a: string[]): string {
  try {
    return execFileSync(bin, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    throw new Error((err.stderr ?? '').split('\n').filter((l) => /error|Error/.test(l)).slice(-3).join(' | ') || err.message);
  }
}

const median = (v: number[]) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

function mergeCalls(a: Trace, b: Trace): Trace {
  const calls = { ...a.calls } as Trace['calls'];
  for (const [k, v] of Object.entries(b.calls)) calls[k] = { ...(calls[k] ?? {}), ...v };
  return { ...b, calls };
}

function runOne(c: Clip, harness: string, models: string, cache: string, out: string): Row {
  const movements = c.movement === 'auto' ? ['snatch'] : [c.movement];
  let row: Row | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const movement = movements[attempt];
    const cls = movement === 'kipping_hspu' ? 'inverted' : movement === 'kipping_pull_up' || movement === 'bar_muscle_up' ? 'hanging' : 'barbell';
    const key = `${c.id}.${cls}`;
    const poseTrace = join(cache, 'pose', `${key}.trace.json.gz`), runFile = join(cache, 'pose', `${key}.run.json`);
    const timing = { poseS: 0, pixelsS: 0, nodeMs: 0 };
    if (!existsSync(poseTrace) || !existsSync(runFile)) {
      const t0 = Date.now();
      sh(harness, ['pose', c.file, '--models', models, '--out', poseTrace, '--run-out', runFile, '--movement', movement]);
      timing.poseS = (Date.now() - t0) / 1000;
    }
    let trace = parseTraceJson(gz(poseTrace)) as Trace;
    let res: ReturnType<typeof analyseTraceResult> | null = null;
    let rounds = 0;
    let stills: string | null = null;
    const t1 = Date.now();
    for (; rounds < 4; rounds++) {
      const plan = planFromMisses(trace, movement, { assetPrefix: 'kf' });
      if (!plan.misses.length) break;
      const { misses, ...p } = plan;
      const hash = createHash('sha1').update(JSON.stringify(p)).digest('hex').slice(0, 12);
      const pix = join(cache, 'pixels', `${key}.${hash}.trace.json.gz`);
      if (!existsSync(pix)) {
        const planFile = join(cache, 'pixels', `${key}.${hash}.plan.json`);
        writeJson(planFile, p);
        const t2 = Date.now();
        sh(harness, ['analyse', c.file, '--models', models, '--plan', planFile, '--run-in', runFile, '--out', pix, '--stills', join(cache, 'stills', `${key}.${hash}`), '--movement', movement]);
        timing.pixelsS += (Date.now() - t2) / 1000;
      }
      trace = mergeCalls(trace, parseTraceJson(gz(pix)) as Trace);
      stills = join(cache, 'stills', `${key}.${hash}`);
    }
    const t3 = Date.now();
    res = analyseTraceResult(trace, movement, { assetPrefix: 'kf' });
    timing.nodeMs = Date.now() - t3 + (t3 - t1) - timing.pixelsS * 1000;
    const a = res.analysis as Record<string, unknown>;
    const failure = a.failure as { reason: string; code: string } | null;
    const cue = (a.cue as { faultId: string } | null)?.faultId ?? null;
    const detected = (a.detectedMovement as Row['detected']) ?? null;
    const reps = res.reps.map((r) => ({
      start: r.start, end: r.end, made: r.made, outcome: r.outcome, offSide: Number.isFinite(r.off_side_deg) ? r.off_side_deg : null,
      scale: (r.scale_method as string) ?? null, liftoff: typeof r.events?.liftoff === 'number' ? r.events.liftoff : null,
    }));
    row = {
      id: c.id, set: c.set, group: c.group, movement: c.labelMovement, movementRun: movement,
      status: failure ? 'failed' : cue ? 'full' : 'partial', failure, cue, noCue: (a.noCueReason as Row['noCue']) ?? null, detected,
      nReps: reps.length, made: reps.map((r) => r.made), reps, yawDeg: median(reps.map((r) => r.offSide ?? NaN)),
      startClass: (a.startClass as string) ?? null, yawBucket: (a.yawBucket as string) ?? null, liftKind: (a.liftKind as string) ?? null, rounds, misses: res.misses.length, timing, stills,
    };
    writeJson(join(out, `${c.id}.${movement}.analysis.json`), a);
    // the five unlabelled owner clips: follow the detector when the user's hint is the wrong family
    if (c.movement === 'auto' && failure?.code === 'movement_mismatch' && detected && !movements.includes(detected.movement)) movements.push(detected.movement);
    else break;
  }
  return row!;
}

function run() {
  const clips = JSON.parse(readFileSync(opt('clips')!, 'utf8')) as Clip[];
  const harness = opt('harness')!, models = opt('models')!, cache = opt('cache')!, out = opt('out')!;
  const only = opt('only')?.split(',');
  const setsWanted = opt('sets')?.split(',');
  for (const d of ['pose', 'pixels', 'stills']) mkdirSync(join(cache, d), { recursive: true });
  mkdirSync(out, { recursive: true });
  const rowsPath = join(out, 'rows.jsonl');
  const done = new Set(existsSync(rowsPath) ? readFileSync(rowsPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const [shard, shards] = (opt('shard') ?? '0/1').split('/').map(Number);
  const todo = clips.filter((c, i) => i % shards === shard && (!only || only.includes(c.id)) && (!setsWanted || setsWanted.includes(c.set)) && (!done.has(c.id) || only));
  log(`${todo.length} clips to run (${done.size} done)`);
  for (const [i, c] of todo.entries()) {
    const t0 = Date.now();
    let row: Row;
    try {
      row = runOne(c, harness, models, cache, out);
    } catch (e) {
      row = { id: c.id, set: c.set, group: c.group, movement: c.labelMovement, movementRun: c.movement, status: 'error', failure: null, cue: null, noCue: null,
        detected: null, nReps: 0, made: [], reps: [], yawDeg: null, rounds: 0, misses: 0, timing: { poseS: 0, pixelsS: 0, nodeMs: 0 }, error: String((e as Error).message).slice(0, 300) };
    }
    writeFileSync(rowsPath, JSON.stringify(row) + '\n', { flag: 'a' });
    log(`[${i + 1}/${todo.length}] ${c.id} ${row.movementRun} ${row.status} ${row.cue ?? row.noCue?.code ?? row.failure?.code ?? row.error ?? ''} reps ${row.nReps} yaw ${row.yawDeg?.toFixed(0) ?? '-'} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}

const HORIZONTAL = /bar_forward|jump_forward|jump_back|forward_dip|chest_dive|shoulders_behind|no_push_away|banana|bar_drift/;

function score() {
  const clips = JSON.parse(readFileSync(opt('clips')!, 'utf8')) as Clip[];
  const out = opt('out')!;
  const byId = new Map<string, Row>();
  for (const l of readFileSync(join(out, 'rows.jsonl'), 'utf8').trim().split('\n')) { const r = JSON.parse(l) as Row; byId.set(r.id, r); }
  const rows = clips.flatMap((c) => (byId.has(c.id) ? [{ c, r: byId.get(c.id)! }] : []));
  const count = <T>(xs: T[], f: (x: T) => string | null | undefined) => {
    const m: Record<string, number> = {};
    for (const x of xs) { const k = f(x); if (k) m[k] = (m[k] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
  };
  const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const groupOf = (x: { c: Clip }) => (x.c.set === 'public' ? `public_${x.c.group}` : x.c.set);
  const groups = [...new Set(rows.map(groupOf))];
  const scoreboard: Record<string, unknown> = {
    generated: new Date().toISOString(), clips: rows.length, groups: {},
  };
  for (const g of groups) {
    const xs = rows.filter((x) => groupOf(x) === g);
    const bl = xs.filter((x) => x.c.baseline);
    const labelled = xs.filter((x) => x.c.labelReps !== null && x.c.group !== 'negative');
    const repStats = (got: (x: { c: Clip; r: Row }) => number) => {
      const want = labelled.reduce((s, x) => s + x.c.labelReps!, 0);
      const hit = labelled.reduce((s, x) => s + Math.min(got(x), x.c.labelReps!), 0);
      const g2 = labelled.reduce((s, x) => s + got(x), 0);
      return { labelledClips: labelled.length, labelledReps: want, found: g2, recall: pct(hit, want), precision: pct(hit, g2), exact: labelled.filter((x) => got(x) === x.c.labelReps).length };
    };
    const analysable = xs.filter((x) => x.r.status !== 'error' && !['unsupported_movement', 'no_person'].includes(x.r.failure?.reason ?? ''));
    const yawErr = xs.flatMap((x) => (x.c.angleDeg !== null && x.r.yawDeg !== null ? [Math.abs(x.r.yawDeg - x.c.angleDeg)] : []));
    const fwdPast60 = xs.filter((x) => x.r.cue && HORIZONTAL.test(x.r.cue) && (x.r.yawDeg ?? 0) > 60).map((x) => x.c.id);
    const cueChanges = bl.filter((x) => x.c.baseline!.cue !== x.r.cue).map((x) => ({ id: x.c.id, before: x.c.baseline!.cue ?? x.c.baseline!.noCue ?? x.c.baseline!.reason, after: x.r.cue ?? x.r.noCue?.code ?? x.r.failure?.code ?? x.r.error }));
    const repChanges = bl.filter((x) => (x.c.baseline!.nReps ?? 0) !== x.r.nReps).map((x) => ({ id: x.c.id, before: x.c.baseline!.nReps, after: x.r.nReps }));
    (scoreboard.groups as Record<string, unknown>)[g] = {
      clips: xs.length,
      status: count(xs, (x) => x.r.status),
      baselineStatus: count(bl, (x) => x.c.baseline!.status),
      noCueRate: pct(xs.filter((x) => x.r.status !== 'full').length, xs.length),
      noCueRateBaseline: bl.length ? pct(bl.filter((x) => x.c.baseline!.status !== 'full').length, bl.length) : null,
      cueRateAnalysable: pct(analysable.filter((x) => x.r.status === 'full').length, analysable.length),
      noCueReasons: count(xs, (x) => (x.r.status === 'full' ? null : x.r.noCue?.code ?? x.r.failure?.code ?? x.r.error?.slice(0, 40))),
      cues: count(xs, (x) => x.r.cue),
      cuesBaseline: count(bl, (x) => x.c.baseline!.cue),
      reps: repStats((x) => x.r.nReps),
      repsBaseline: repStats((x) => x.c.baseline?.nReps ?? 0),
      yaw: { clips: yawErr.length, medianAbsErrDeg: median(yawErr), p90AbsErrDeg: yawErr.length ? yawErr.sort((a, b) => a - b)[Math.floor(0.9 * (yawErr.length - 1))] : null },
      forwardCuesPast60: fwdPast60,
      cueAgreementWithBaseline: bl.length ? pct(bl.length - cueChanges.length, bl.length) : null,
      cueChanges, repChanges,
      startClasses: count(xs, (x) => x.r.startClass ?? null),
      cleanAndJerkTwoSegments: `${xs.filter((x) => x.c.labelMovement === 'clean_and_jerk' && x.r.liftKind === 'clean_and_jerk').length}/${xs.filter((x) => x.c.labelMovement === 'clean_and_jerk').length}`,
      speed: { medianPoseS: median(xs.map((x) => x.r.timing.poseS).filter((v) => v > 0)), medianPixelsS: median(xs.map((x) => x.r.timing.pixelsS).filter((v) => v > 0)), medianNodeMs: median(xs.map((x) => x.r.timing.nodeMs)), totalS: Math.round(xs.reduce((s, x) => s + x.r.timing.poseS + x.r.timing.pixelsS + x.r.timing.nodeMs / 1000, 0)) },
    };
  }
  scoreboard.rows = rows.map(({ c, r }) => ({ id: c.id, set: c.set, group: c.group, movement: c.movement, run: r.movementRun, status: r.status, cue: r.cue, noCue: r.noCue?.code ?? null, fail: r.failure?.code ?? null, reps: r.nReps, labelReps: c.labelReps, made: r.made, yaw: r.yawDeg === null ? null : Math.round(r.yawDeg), angle: c.angleLabel, baseline: c.baseline ? { cue: c.baseline.cue, reps: c.baseline.nReps, status: c.baseline.status } : null, startClass: r.startClass ?? null }));
  process.stdout.write(JSON.stringify(scoreboard, null, 1) + '\n');
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

// One row per clip: the first rep's key-frame stills with the bar path and the cue's evidence drawn on the setup still,
// this run's result next to the 3.0 baseline (or --base, an earlier run's out dir).
function sheet() {
  const clips = JSON.parse(readFileSync(opt('clips')!, 'utf8')) as Clip[];
  const out = opt('out')!, basePath = opt('base');
  const rowsOf = (dir: string) => new Map(readFileSync(join(dir, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => { const r = JSON.parse(l) as Row; return [r.id, r] as const; }));
  const rows = rowsOf(out), base = basePath ? rowsOf(basePath) : null;
  const res = (r: Row | undefined) => (r ? `${r.cue ?? r.noCue?.code ?? r.failure?.code ?? r.error ?? ''} · ${r.nReps} reps · yaw ${r.yawDeg?.toFixed(0) ?? '-'}` : '-');
  const html: string[] = ['<!doctype html><meta charset="utf-8"><title>eval31 sheet</title><style>body{font:12px system-ui;margin:16px;background:#fff;color:#111}',
    '.c{border-top:1px solid #ccc;padding:8px 0}.s{display:flex;gap:4px;overflow-x:auto}.f{position:relative;flex:none}.f img{height:220px;display:block}',
    '.f svg{position:absolute;inset:0;width:100%;height:100%}.d{color:#c00}</style>'];
  for (const c of clips) {
    const r = rows.get(c.id);
    if (!r) continue;
    const b = base?.get(c.id);
    const before = b ? res(b) : c.baseline ? `${c.baseline.cue ?? c.baseline.noCue ?? c.baseline.reason ?? ''} · ${c.baseline.nReps} reps (3.0)` : '-';
    const changed = before.split(' · ')[0] !== res(r).split(' · ')[0];
    html.push(`<div class="c"><b>${esc(c.id)}</b> ${esc(c.set)} · ${esc(c.labelMovement)} · angle ${esc(c.angleLabel)} · labelled reps ${esc(c.labelReps ?? '-')}<br>`,
      `<span class="${changed ? 'd' : ''}">now: ${esc(res(r))} · before: ${esc(before)}</span>`);
    const aPath = join(out, `${c.id}.${r.movementRun}.analysis.json`);
    const a = existsSync(aPath) ? JSON.parse(readFileSync(aPath, 'utf8')) : null;
    const rep = a?.reps?.[0] as { index: number; keyFrames: { image: string }[]; path: { x: number; y: number }[] } | undefined;
    if (rep && r.stills) {
      const ev = a.cue?.evidence?.rep === rep.index ? a.cue.evidence : null;
      html.push('<div class="s">');
      rep.keyFrames.forEach((kf, i) => {
        const img = join(r.stills!, kf.image.slice(kf.image.lastIndexOf('/') + 1));
        const svg = i > 0 ? '' : `<svg viewBox="0 0 1 1" preserveAspectRatio="none"><polyline fill="none" stroke="#FF1F3D" stroke-width="0.006" points="${rep.path.map((p) => `${p.x},${p.y}`).join(' ')}"/>` +
          (ev ? `<line x1="${ev.from.x}" y1="${ev.from.y}" x2="${ev.to.x}" y2="${ev.to.y}" stroke="#0a0" stroke-width="0.01"/>` : '') + '</svg>';
        html.push(`<div class="f"><img src="file://${esc(img)}" loading="lazy">${svg}</div>`);
      });
      html.push('</div>');
    }
    html.push('</div>');
  }
  writeFileSync(join(out, 'sheet.html'), html.join('\n'));
  log(`sheet: ${join(out, 'sheet.html')}`);
}

if (cmd === 'sets') sets();
else if (cmd === 'run') run();
else if (cmd === 'score') score();
else if (cmd === 'sheet') sheet();
else { log('usage: run.ts sets|run|score|sheet ...'); process.exit(2); }
