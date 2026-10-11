import json
import os
import pickle
import subprocess
import time

import cv2
import numpy as np

from . import rules
from .geometry import angle, lowpass, normalise, trunk_angle
from .lifter import select_lifter
from .phases import SNATCH_PHASES, find_reps, key_frames, segment_snatch
from .pose import (L_ANK, L_BIGTOE, L_ELB, L_HEEL, R_ELB, L_HIP, L_KNEE, L_SHO, L_WRI, NOSE, R_ANK, R_BIGTOE, R_HEEL,
                   R_HIP, R_KNEE, R_SHO, R_WRI, run_pose)
from .track import find_plates, foreground_mask, from_ref, stabilise, to_ref, track_plate
from .video import frames, probe

INFER_H = 1280
PLATE_CM = 45.0
PLATE_SPAN_CM = 150.0  # centre-to-centre of the two outer plates on a 220 cm bar (approx.)
KEYFRAME_H = 1080


def mid(k, a, b):
    return (k[:, a] + k[:, b]) / 2


def run(clip, out_json, assets_dir, asset_prefix, debug_dir, cache_dir, analysis_id):
    t0 = time.time()
    meta = probe(clip)
    fps = meta["fps"]
    os.makedirs(cache_dir, exist_ok=True)
    cache = os.path.join(cache_dir, os.path.basename(clip) + ".pose.pkl")
    if os.path.exists(cache):
        people, shape = pickle.load(open(cache, "rb")).values()
    else:
        people, shape = run_pose(clip, INFER_H)
        pickle.dump({"people": people, "shape": shape}, open(cache, "wb"))
    t_pose = time.time() - t0
    H, W = shape[:2]
    n = len(people)
    k, ks, boxes = select_lifter(people)

    def fail(reason, message, frame=None):
        return write(out_json, base(analysis_id, meta, n) | {
            "reps": [], "bestRepIndex": 0, "cue": None, "measurements": [],
            "failure": {"reason": reason, "message": message} | ({"frame": int(frame)} if frame is not None else {})})

    up = lambda y: H - y
    wr_h = up(mid(k, L_WRI, R_WRI)[:, 1])
    reps = find_reps(lowpass(wr_h, fps), lowpass(up(k[:, NOSE, 1]), fps), lowpass(up(mid(k, L_KNEE, R_KNEE)[:, 1]), fps), fps)
    if not reps:
        return fail("unsupported_movement", "No floor-to-overhead lift found in this clip.")

    out_reps, rep_info = [], []
    for ri, (start, end, _) in enumerate(reps):
        info = analyse_rep(clip, meta, people, k, ks, boxes, start, end, fps, H, W, debug_dir, ri + 1)
        if info is None:
            continue
        rep_info.append(info)
    if not rep_info:
        return fail("bar_out_of_frame", "Could not find the plates at the start of the lift, so the bar could not be measured.")

    best = max(rep_info, key=lambda r: (r["made"], -r["severity"]))
    for i, r in enumerate(rep_info):
        r["index"] = i + 1
    # the cue comes from the rep where the chosen fault is most severe; the others say whether it repeats
    cue_rep = max(rep_info, key=lambda r: r["severity"])
    measurements, cue = build_cue(cue_rep, rep_info, best, W, H)

    keyframes_dir = assets_dir
    os.makedirs(keyframes_dir, exist_ok=True)
    for r in rep_info:
        kfs = []
        for pi, phase in enumerate(SNATCH_PHASES):
            f = r["keys"][phase]
            name = f"r{r['index']}-{pi + 1}-{phase}.jpg"
            export_frame(clip, f, fps, os.path.join(keyframes_dir, name))
            kfs.append({"phase": phase, "frame": int(f), "image": f"{asset_prefix}/{name}"})
        out_reps.append({"index": r["index"], "startFrame": r["start"], "endFrame": r["end"], "made": r["made"],
                         "phases": r["phases"], "keyFrames": kfs, "path": r["path"]})

    analysis = base(analysis_id, meta, n) | {
        "pxPerCm": round(cue_rep["px_per_cm"] * KEYFRAME_H / H, 3),
        "reps": out_reps,
        "bestRepIndex": best["index"],
        "cue": cue,
        "measurements": measurements,
        "failure": None,
    }
    write(out_json, analysis)
    timing = {"pose_s": round(t_pose, 1), "total_s": round(time.time() - t0, 1)}
    with open(os.path.join(debug_dir, "timing.json"), "w") as fh:
        json.dump(timing, fh)
    return analysis, rep_info, timing


def base(analysis_id, meta, n):
    vh = KEYFRAME_H
    vw = int(round(meta["width"] * vh / meta["height"]))
    return {"version": 1, "id": analysis_id, "movement": "snatch",
            "video": {"uri": f"assets/analysis/{analysis_id}", "width": vw, "height": vh, "fps": meta["fps"],
                      "frameCount": meta["frameCount"] or n},
            "traceKind": "bar"}


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=1)
        fh.write("\n")
    return obj


def export_frame(clip, f, fps, path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{f / fps:.4f}", "-i", clip, "-frames:v", "1",
                    "-vf", f"scale=-2:{KEYFRAME_H}", "-q:v", "3", path], check=True)


def analyse_rep(clip, meta, people, k, ks, boxes, start, end, fps, H, W, debug_dir, rep_no):
    n = len(people)
    s0 = max(0, start - int(2 * fps))
    e0 = min(n, end + int(1.0 * fps))
    fr = [im for _, im in frames(clip, H, s0, e0 - s0, fps)]
    e0 = s0 + len(fr)
    kw = k[s0:e0]
    body_h = np.nanmedian(boxes[s0:e0, 3] - boxes[s0:e0, 1])

    # 1. camera motion -> everything in the window's first-frame pixels
    masks = [foreground_mask(im.shape, [p[0] for p in people[s0 + i]], kw[i, [L_WRI, R_WRI]], 0.12 * body_h)
             for i, im in enumerate(fr)]
    Ms, inliers = stabilise(fr, masks)
    kr = np.stack([to_ref(kw[:, j], Ms) for j in range(26)], axis=1)
    ksm = lowpass(kr.reshape(len(fr), -1), fps, 6.0).reshape(len(fr), 26, 2)

    up = lambda y: -y
    bar = (ksm[:, L_WRI] + ksm[:, R_WRI]) / 2
    knee_ang = (angle(ksm[:, L_HIP], ksm[:, L_KNEE], ksm[:, L_ANK]) + angle(ksm[:, R_HIP], ksm[:, R_KNEE], ksm[:, R_ANK])) / 2
    hip_ang = (angle(ksm[:, L_SHO], ksm[:, L_HIP], ksm[:, L_KNEE]) + angle(ksm[:, R_SHO], ksm[:, R_HIP], ksm[:, R_KNEE])) / 2
    sho, hip = mid(ksm, L_SHO, R_SHO), mid(ksm, L_HIP, R_HIP)
    knee, ank = mid(ksm, L_KNEE, R_KNEE), mid(ksm, L_ANK, R_ANK)
    trunk = trunk_angle(sho, hip)

    elbow = np.minimum(angle(ksm[:, L_SHO], ksm[:, L_ELB], ksm[:, L_WRI]), angle(ksm[:, R_SHO], ksm[:, R_ELB], ksm[:, R_WRI]))
    phases, ev = segment_snatch(up(bar[:, 1]), knee_ang, fps, elbow=elbow)
    lo = ev["liftoff"]
    knee_pass = next((f for f in range(lo, ev["peak"]) if bar[f, 1] <= knee[f, 1]), None)
    if knee_pass is not None and not ev["double_knee_bend"]:
        phases, ev = segment_snatch(up(bar[:, 1]), knee_ang, fps, knee_pass=knee_pass, elbow=elbow)

    # 2. plates at setup (sharp, static) -> scale + camera angle; near plate tracked through the pull
    seed = max(0, lo - 3)
    plates = find_plates(fr[seed], kw[seed, L_WRI], kw[seed, R_WRI], body_h)
    if not plates:
        return None
    # single-frame ellipse fits wander ~7% on static setup frames: use the median axes over the setup
    samples = [find_plates(fr[f], kw[f, L_WRI], kw[f, R_WRI], body_h) for f in range(max(0, lo - 24), lo, 3)]
    for i, pl in enumerate(plates):
        axes = [s[i]["axes"] for s in samples if len(s) == len(plates) and s[i]["side"] == pl["side"]]
        if len(axes) >= 3:
            pl["axes"] = tuple(float(v) for v in np.median(axes, axis=0))
            pl["axes_spread"] = float(np.std([a[0] for a in axes]) / np.median([a[0] for a in axes]))
    near = plates[0]
    scale_near = near["axes"][0] / PLATE_CM
    far = plates[1] if len(plates) > 1 else None
    if far is not None:
        scale_far = far["axes"][0] / PLATE_CM
        px_per_cm = 2 / (1 / scale_near + 1 / scale_far)
        span_cm = np.linalg.norm(near["centre"] - far["centre"]) / px_per_cm
        # three estimates of how far the camera sits off side-on: bar span, and each plate's ellipse (minor/major = cos)
        est = [np.arcsin(np.clip(span_cm / PLATE_SPAN_CM, 0, 1))] + [np.arccos(p["axes"][1] / p["axes"][0]) for p in (near, far)]
        off_est = [float(np.degrees(e)) for e in est]
        off_side = float(np.median(off_est))
    else:
        px_per_cm, span_cm = scale_near, None
        off_est = [float(np.degrees(np.arccos(near["axes"][1] / near["axes"][0])))]
        off_side = off_est[0]
    foreshort = 1 / np.cos(np.radians(off_side))
    plate_raw, plate_score = track_plate(fr, seed, near)
    plate_ref = to_ref(plate_raw, Ms)

    # forward = direction the toes point at setup
    toe = mid(ksm, L_BIGTOE, R_BIGTOE)[lo] - mid(ksm, L_HEEL, R_HEEL)[lo]
    fwd = 1.0 if toe[0] >= 0 else -1.0
    cm = lambda px: float(px / px_per_cm)

    # 3. measurements
    vals, detail = {}, {}
    if knee_pass is not None:
        hip_rise = cm(hip[lo, 1] - hip[knee_pass, 1])
        sho_rise = cm(sho[lo, 1] - sho[knee_pass, 1])
        vals["hips_rise_early"] = hip_rise - sho_rise
        detail["hips_rise_early"] = {"frame": knee_pass, "hip_rise": hip_rise, "sho_rise": sho_rise,
                                     "trunk_change": float(trunk[lo] - trunk[knee_pass])}
    hip_pass = next((f for f in range(lo, ev["peak"]) if bar[f, 1] <= hip[f, 1]), ev["second_ext"])
    contact = min(hip_pass, ev["second_ext"])
    xs = fwd * (bar[contact: ev["peak"] + 1, 0] - bar[contact, 0])
    j = int(np.argmax(xs))
    vals["bar_forward_off_hips"] = cm(xs[j]) * foreshort
    detail["bar_forward_off_hips"] = {"frame": contact + j, "from_frame": contact}
    vals["jump_forward"] = cm(fwd * (ank[ev["caught"], 0] - ank[lo, 0])) * foreshort
    detail["jump_forward"] = {"frame": ev["caught"], "from_frame": lo}

    peak_h = cm(bar[lo, 1] - bar[ev["peak"], 1])
    drop = cm(bar[ev["caught"], 1] - bar[ev["peak"], 1])
    turnover_s = (ev["caught"] - ev["second_ext"]) / fps
    standing_h = cm(np.nanmax(ank[:, 1] - ksm[:, NOSE, 1])) + 12.0  # nose sits ~12 cm below the crown

    # plate vs wrist agreement over the pull (bar proxy validation)
    pull = np.arange(lo, min(ev["second_ext"], len(fr) - 1) + 1)
    okp = np.isfinite(plate_ref[pull, 1])
    agree = None
    if okp.sum() > 5:
        pv = np.gradient(lowpass(plate_ref[pull, 1], fps))[okp]
        wv = np.gradient(bar[pull, 1])[okp]
        agree = float(np.corrcoef(pv, wv)[0, 1])

    made = bool(ev["recovered"] < len(fr) - 1 and knee_ang[ev["recovered"]] > 150)
    g = lambda f: s0 + int(f)
    raw = lambda p, f: from_ref(p, Ms[f])
    path = [{"frame": g(f)} | normalise(raw(bar[f], f), W, H) for f in range(phases[0]["startFrame"], len(fr))
            if f <= ev["recovered"]]

    info = {
        "rep_no": rep_no, "start": g(phases[0]["startFrame"]), "end": g(ev["recovered"]), "made": made,
        "phases": [p | {"startFrame": g(p["startFrame"]), "endFrame": g(p["endFrame"])} for p in phases],
        "keys": {kk: g(v) for kk, v in key_frames(ev).items()},
        "events": {kk: (g(v) if not isinstance(v, bool) else v) for kk, v in ev.items()},
        "path": path, "values": vals, "detail": detail, "px_per_cm": px_per_cm, "off_side_deg": off_side, "off_side_estimates": off_est,
        "span_cm": span_cm, "plates": plates, "plate_tracked": int(np.isfinite(plate_raw[:, 0]).sum()),
        "plate_lost_at": g(int(np.where(np.isfinite(plate_raw[:, 0]))[0].max())), "plate_wrist_corr": agree,
        "peak_h": peak_h, "drop": drop, "turnover_s": turnover_s, "standing_h": standing_h,
        "stab_inliers_min": int(min(inliers)) if inliers else 0, "fwd": fwd,
        "severity": max(rules.fired(vals).values(), default=0.0),
        "_ref": {"s0": s0, "Ms": Ms, "ksm": ksm, "bar": bar, "plate_ref": plate_ref, "knee_ang": knee_ang,
                 "hip_ang": hip_ang, "trunk": trunk, "hip": hip, "sho": sho, "ank": ank, "frames": fr,
                 "kraw": kw, "elbow": elbow, "ks": ks[s0:e0], "contact": contact, "knee_pass": knee_pass, "lo": lo},
    }
    return info


LABELS = {"hips_rise_early": "Hips rose early", "bar_forward_off_hips": "Bar forward off hips",
          "jump_forward": "Jumped forward"}
NOTES = {"hips_rise_early": "hips vs shoulders, floor to knee", "bar_forward_off_hips": "after hip contact",
         "jump_forward": "feet, lift-off to catch"}


def build_cue(r, reps, best_rep, W, H):
    vals, det, ref = r["values"], r["detail"], r["_ref"]
    off = r["off_side_deg"]
    angle_note = f"; corrected for a camera ~{off:.0f}° off side-on, so treat as an estimate" if off > 20 else ""
    cue_id = rules.choose_cue(vals)
    fired = rules.fired(vals)
    s0 = ref["s0"]
    meas = []
    for fid in ("hips_rise_early", "bar_forward_off_hips", "jump_forward"):
        v = vals.get(fid)
        if v is None:
            meas.append({"id": fid, "label": LABELS[fid], "value": 0, "unit": "cm", "frame": r["start"],
                         "status": "not_seen", "note": "could not measure"})
            continue
        status = "cue" if fid == cue_id else ("follows" if fid in fired else "normal")
        note = NOTES[fid]
        if rules.RULES[fid]["horizontal"]:
            note += angle_note
        m = {"id": fid, "label": LABELS[fid], "value": round(v, 1), "unit": "cm",
             "frame": s0 + det[fid]["frame"], "status": status, "note": note}
        bv = best_rep["values"].get(fid)
        if best_rep is not r and bv is not None:
            m["best"] = round(bv, 1)
        meas.append(m)
    meas += [
        {"id": "bar_peak_height", "label": "Bar peak height", "value": round(r["peak_h"], 1), "unit": "cm",
         "frame": r["events"]["peak"], "status": "normal", "note": "above lift-off (wrist midpoint)"},
        {"id": "turnover_time", "label": "Extension to catch", "value": round(r["turnover_s"], 2), "unit": "s",
         "frame": r["events"]["second_ext"], "status": "normal", "note": "± 1 frame at 30 fps"},
    ]
    if cue_id is None:
        return meas, None

    sev = fired[cue_id]
    conf = rules.confidence(cue_id, sev, off)
    seen = sum(1 for x in reps if cue_id in rules.fired(x["values"]))
    if seen < len(reps) and conf == "clear":
        conf = "worth_checking"
    d = det[cue_id]
    f = d["frame"]
    Ms = ref["Ms"]
    raw = lambda p, fr: from_ref(p, Ms[fr])
    if cue_id == "hips_rise_early":
        lo = ref["lo"]
        # hip at lift-off vs hip when the bar passes the knee, drawn on the knee-pass frame
        frm, to = raw(ref["hip"][lo], f), raw(ref["hip"][f], f)
        caption = f"hips +{d['hip_rise']:.0f} cm · shoulders +{d['sho_rise']:.0f} cm"
    elif cue_id == "bar_forward_off_hips":
        frm, to = raw(ref["bar"][d["from_frame"]], f), raw(ref["bar"][f], f)
        caption = f"hip · {vals[cue_id]:.0f} cm fwd"
    else:
        frm, to = raw(ref["ank"][d["from_frame"]], f), raw(ref["ank"][f], f)
        caption = f"feet · {vals[cue_id]:.0f} cm fwd"
    conf_text = f"Seen on {seen} of {len(reps)} reps"
    if off > 20:
        conf_text += f", filmed ~{off:.0f}° off side-on: film from the side to confirm"
    cue = {"faultId": cue_id, "text": rules.CUES[cue_id], "why": rules.why_sentence(cue_id, vals),
           "confidence": conf, "confidenceText": conf_text,
           "evidence": {"rep": r["index"], "frame": s0 + f, "from": normalise(frm, W, H), "to": normalise(to, W, H),
                        "value": round(vals[cue_id], 1), "unit": "cm", "caption": caption}}
    return meas, cue
