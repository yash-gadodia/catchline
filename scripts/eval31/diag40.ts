// Why a clip's path was or was not read off the plate (4.0): the low-bar frame, what the finder saw there, where the
// follow started and how each gate of onPlate thinned it.
//   node diag40.cjs DIR/<id>/trace.json.gz [...]
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

import { barFromWrists, barTrack, dist, finitePt, onPlate, toRef } from '../../src/analysis/device/geometry';
import { JOINTS, K, L_WRI, R_WRI, col } from '../../src/analysis/device/movement';
import { nanmedian } from '../../src/analysis/device/num';
import { yawFromBody } from '../../src/analysis/device/body';
import { Trace, dec, parseTraceJson, traceInput } from '../../src/analysis/device/trace';

const r = (v: number, d = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
for (const file of process.argv.slice(2)) {
  const trace = parseTraceJson(gunzipSync(readFileSync(file)).toString()) as Trace;
  const input = traceInput(trace, 'snatch');
  const n = input.lifter.k.length;
  const { Ms } = input.source.window(0, n);
  const L = Ms.length;
  const kw = input.lifter.k.slice(0, L);
  const bodyH = nanmedian(input.lifter.boxes.slice(0, L).map((b) => b[3] - b[1]));
  const cols = Array.from({ length: JOINTS }, (_, j) => toRef(col(kw, j), Ms));
  const kr: K = kw.map((_, f) => cols.map((c) => c[f]));
  const barRaw = barTrack(col(kr, L_WRI), col(kr, R_WRI), bodyH);
  const low = barRaw.reduce((best, p, f) => (finitePt(kw[f][L_WRI]) && finitePt(kw[f][R_WRI]) && finitePt(p) && (best < 0 || p[1] > barRaw[best][1]) ? f : best), -1);
  const yaw = yawFromBody(input.lifter.k, 0, n - 1);
  const out: Record<string, unknown> = { id: file.split('/').slice(-2)[0], L, shape: input.shape, bodyH: r(bodyH), low, yaw: r(yaw ?? NaN), grip: low >= 0 ? r(dist(kw[low][L_WRI], kw[low][R_WRI]) / bodyH, 2) : null };
  const wr = barFromWrists(col(kw, L_WRI), col(kw, R_WRI), 0.12 * bodyH);
  out.finds = Object.entries(trace.calls.find_plates ?? {}).map(([f, outs]) => {
    const ps = dec(outs[0]) as { centre: [number, number]; axes: [number, number]; score: number; side: string }[];
    return { f: Number(f), plates: ps.map((p) => ({ c: p.centre.map((v) => r(v)), ax: p.axes.map((v) => r(v)), s: r(p.score, 2), side: p.side, dW: finitePt(wr[Number(f)]) ? r(dist(p.centre, wr[Number(f)]) / bodyH, 2) : null })) };
  });
  out.refines = Object.entries(trace.calls.refine_plate ?? {}).map(([, outs]) => {
    const p = dec(outs[0]) as { centre: [number, number]; axes: [number, number]; fit_inliers?: number } | null;
    return p ? { c: p.centre.map((v) => r(v)), ax: p.axes.map((v) => r(v)), inl: r(p.fit_inliers ?? NaN, 2) } : null;
  });
  out.follows = Object.entries(trace.calls.follow_plate ?? {}).map(([key, outs]) => {
    const [centres, src, fit, start] = dec(outs[0]) as [[number, number][], number[], [number, number, number, number][], { centre: [number, number]; axes: [number, number]; score: number } | null];
    const seed = Number(key.split(':')[2]);
    const cnt = (v: number) => src.filter((s) => s === v).length;
    const res: Record<string, unknown> = { key, start: start ? { c: start.centre.map((v) => r(v)), ax: start.axes.map((v) => r(v)), rim: r(start.score, 2), dW: finitePt(wr[seed]) ? r(dist(start.centre, wr[seed]) / bodyH, 2) : null } : null, det: cnt(1), flow: cnt(2), lost: cnt(0) - seed };
    if (start && src[seed] === 1) {
      const ok = onPlate(src, fit, centres, wr, seed, yaw ?? 0);
      res.ok = ok.filter(Boolean).length;
      const M0 = fit[seed][0], home = dist(centres[seed], wr[seed]);
      const det = src.flatMap((s, f) => (s === 1 ? [f] : []));
      const q = (v: number[]) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? [0.1, 0.5, 0.9].map((p) => r(s[Math.floor(p * (s.length - 1))], 2)) : null; };
      res.rim = q(det.map((f) => fit[f][1]));
      res.pol = q(det.map((f) => fit[f][2]));
      res.grey = q(det.map((f) => fit[f][3] - fit[seed][3]));
      res.size = q(det.map((f) => fit[f][0] / M0));
      res.leash = q(det.flatMap((f) => (finitePt(wr[f]) ? [(dist(centres[f], wr[f]) - home) / M0] : [])));
      res.fail = {
        rim: det.filter((f) => fit[f][1] < 0.3).length,
        pol: det.filter((f) => fit[f][1] < 0.5 && fit[f][2] < 0.5).length,
        grey: det.filter((f) => Math.abs(fit[f][3] - fit[seed][3]) > 40).length,
        size: det.filter((f) => fit[f][0] / M0 < 0.9 || fit[f][0] / M0 > 1.3).length,
        leash: det.filter((f) => finitePt(wr[f]) && ((dist(centres[f], wr[f]) - home) / M0 < -0.35 || (dist(centres[f], wr[f]) - home) / M0 > 0.5)).length,
        noWrist: det.filter((f) => !finitePt(wr[f])).length,
      };
      res.okRange = [ok.indexOf(true), ok.lastIndexOf(true)];
    }
    return res;
  });
  console.log(JSON.stringify(out));
}
