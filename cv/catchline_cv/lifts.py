"""Clean, jerk and the v1 gymnastics movements. The snatch keeps its own path in pipeline.py; the clean reuses its
per-rep analysis (plates, stabilisation, phases) with a front-rack catch."""
import json
import os
import time

import numpy as np

from . import gym
from . import movement as mv
from . import rules
from . import speed
from .geometry import angle, bar_from_wrists, lowpass, normalise, trunk_angle
from .phases import find_jerk_reps, find_rack_reps, jerk_key_frames, segment_jerk
from .pose import (L_ANK, L_BIGTOE, L_ELB, L_HEEL, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_BIGTOE, R_ELB, R_HEEL, R_HIP,
                   R_KNEE, R_SHO, R_WRI)
from .track import foreground_mask, from_ref, stabilise, to_ref
from .video import frames

SEGMENTS_CM = 132.0  # shoulder-hip + hip-knee + knee-ankle joint centres for a ~170 cm adult (+/- ~8% across people)


def mid(k, a, b):
    return (k[:, a] + k[:, b]) / 2


def elbows(k):
    return angle(k[:, L_SHO], k[:, L_ELB], k[:, L_WRI]), angle(k[:, R_SHO], k[:, R_ELB], k[:, R_WRI])


def facing(k):
    """+1 when the lifter faces image-right (toes ahead of heels), else -1."""
    d = mid(k, L_BIGTOE, R_BIGTOE)[:, 0] - mid(k, L_HEEL, R_HEEL)[:, 0]
    m = np.nanmedian(d) if np.isfinite(d).any() else 0.0
    return 1.0 if m >= 0 else -1.0


def scale_from_body(k):
    """px per cm from body segment lengths (the straightest 10% of frames), for clips with no plate to measure."""
    segs = []
    for s, h, kn, a in ((L_SHO, L_HIP, L_KNEE, L_ANK), (R_SHO, R_HIP, R_KNEE, R_ANK)):
        segs.append(np.linalg.norm(k[:, s] - k[:, h], axis=1) + np.linalg.norm(k[:, h] - k[:, kn], axis=1)
                    + np.linalg.norm(k[:, kn] - k[:, a], axis=1))
    total = np.nanmean(np.stack(segs), axis=0)
    return float(np.nanpercentile(total, 90) / SEGMENTS_CM) if np.isfinite(total).any() else None


def off_side_pose(k):
    """Camera angle off side-on from how far apart the left and right shoulders and hips sit in x (they overlap
    side-on). Joint-centre widths ~0.7 (shoulders) and ~0.5 (hips) of the torso length."""
    t = mv.torso_px(k)
    if not np.isfinite(t) or t <= 0:
        return None
    ds = np.nanmedian(np.abs(k[:, L_SHO, 0] - k[:, R_SHO, 0])) / (0.7 * t)
    dh = np.nanmedian(np.abs(k[:, L_HIP, 0] - k[:, R_HIP, 0])) / (0.5 * t)
    return float(np.degrees(np.mean([np.arcsin(min(1.0, ds)), np.arcsin(min(1.0, dh))])))


def rack_mask(k, bar, fps):
    """Front rack: the bar (wrist midpoint) at shoulder height, wrists above the elbows, elbows forward of the
    shoulders. Filmed front-on the elbows' forward reach is invisible, so that test is dropped there."""
    t = mv.torso_px(k)
    sho = mid(k, L_SHO, R_SHO)
    ely = np.nanmean(np.stack([k[:, L_ELB, 1], k[:, R_ELB, 1]]), axis=0)
    elx = np.nanmean(np.stack([k[:, L_ELB, 0], k[:, R_ELB, 0]]), axis=0)
    at_sho = np.abs(bar[:, 1] - sho[:, 1]) < 0.35 * t
    above_elbows = ely > bar[:, 1] + 0.05 * t
    off = off_side_pose(k)
    fwd = facing(k)
    forward = fwd * (elx - sho[:, 0]) > 0.1 * t if off is None or off < 60 else np.ones(len(k), bool)
    m = at_sho & above_elbows & forward
    # one-frame pose flickers should not split a rack hold
    sm = np.convolve(m.astype(float), np.ones(5) / 5, mode="same") >= 0.6
    return sm


def clean_pull_values(ksm, hip_ang, knee_ang, lo, ev, fps):
    """Early arm bend (03 MVP #4, 160 deg for the clean) and cut pull (MVP #6) over lift-off .. bar peak.
    Both elbows must bend (max of the two angles) so an occluded far arm cannot fake a bend."""
    el = np.fmax(*elbows(ksm))
    peak = ev["peak"]
    brk = gym.sustained_below(el, 160.0, lo, peak)
    brk = peak if brk is None else brk
    hip_full = lo + int(np.nanargmax(hip_ang[lo:peak + 1]))
    vals = {"early_arm_bend": (hip_full - brk) / fps, "incomplete_extension": 170.0 - float(np.nanmax(hip_ang[lo:peak + 1]))}
    det = {"early_arm_bend": {"frame": brk, "from_frame": brk, "to_frame": hip_full, "kp": "elbow"},
           "incomplete_extension": {"frame": hip_full, "from_frame": hip_full, "to_frame": hip_full, "kp": "hip",
                                    "hip_max": float(np.nanmax(hip_ang[lo:peak + 1])), "knee_max": float(np.nanmax(knee_ang[lo:peak + 1]))}}
    return vals, det


# ---------------------------------------------------------------- shared helpers

def load_window(ctx, s0, e0, wrist_band=False):
    fps, H = ctx["fps"], ctx["H"]
    fr = [im for _, im in frames(ctx["clip"], H, s0, e0 - s0, fps)]
    e0 = s0 + len(fr)
    kw = ctx["k"][s0:e0]
    body_h = np.nanmedian(ctx["boxes"][s0:e0, 3] - ctx["boxes"][s0:e0, 1])
    masks = [foreground_mask(im.shape, [p[0] for p in ctx["people"][s0 + i]],
                             kw[i, [L_WRI, R_WRI]] if wrist_band else None, 0.12 * body_h) for i, im in enumerate(fr)]
    Ms, inliers = stabilise(fr, masks)
    kr = np.stack([to_ref(kw[:, j], Ms) for j in range(26)], axis=1)
    ksm = lowpass(kr.reshape(len(fr), -1), fps, 6.0).reshape(len(fr), 26, 2)
    return fr, e0, kw, kr, ksm, Ms, body_h


def write_out(ctx, rep_info, extra_fields=None):
    from .pipeline import KEYFRAME_H, base, export_keyframes, write
    movement = ctx["movement"]
    best = max(rep_info, key=lambda r: (r["made"], -r["severity"]))
    for i, r in enumerate(rep_info):
        r["index"] = i + 1
    measurements, cue, cue_rep = build(movement, rep_info, best, ctx["W"], ctx["H"])
    os.makedirs(ctx["assets_dir"], exist_ok=True)
    out_reps, jobs = [], []
    for r in rep_info:
        kfs = []
        for pi, (phase, f) in enumerate(r["keys"].items()):
            name = f"r{r['index']}-{pi + 1}-{phase}.jpg"
            jobs.append((f, os.path.join(ctx["assets_dir"], name)))
            kfs.append({"phase": phase, "frame": int(f), "image": f"{ctx['asset_prefix']}/{name}"})
        out_reps.append({"index": r["index"], "startFrame": r["start"], "endFrame": r["end"], "made": r["made"],
                         "phases": r["phases"], "keyFrames": kfs, "path": r["path"]})
    export_keyframes(ctx, jobs)
    analysis = base(ctx["analysis_id"], ctx["meta"], ctx["n"], movement) | {
        "reps": out_reps, "bestRepIndex": best["index"], "cue": cue, "notes": rules.notes(movement, rep_info, cue),
        "measurements": measurements, "failure": None}
    if cue_rep["px_per_cm"]:
        analysis = {**analysis, "pxPerCm": round(cue_rep["px_per_cm"] * KEYFRAME_H / ctx["H"], 3)}
        order = ["version", "id", "movement", "video", "traceKind", "pxPerCm", "reps", "bestRepIndex", "cue", "notes",
                 "measurements", "failure"]
        analysis = {kk: analysis[kk] for kk in order if kk in analysis}
    write(ctx["out_json"], analysis)
    timing = {"pose_s": round(ctx["t_pose"], 1), "total_s": round(time.time() - ctx["t0"], 1)}
    with open(os.path.join(ctx["debug_dir"], "timing.json"), "w") as fh:
        json.dump(timing, fh)
    return analysis, rep_info, timing


LABELS = {
    "hips_rise_early": ("Hips rose early", "hips vs shoulders, floor to knee"),
    "bar_forward_off_hips": ("Bar forward off hips", "after hip contact"),
    "jump_forward": ("Jumped forward", "feet, lift-off to catch"),
    "early_arm_bend": ("Early arm bend", "elbows bent before the hips finished (+ = early)"),
    "incomplete_extension": ("Extension short", "hip angle short of 170° at the top of the pull"),
    "forward_dip": ("Bar forward in dip", "bar, dip start to dip bottom"),
    "press_out": ("Press-out", "elbow straightening after the hips' lowest point"),
    "chest_dive": ("Chest forward in catch", "trunk lean from vertical when landing"),
    "bar_forward_overhead": ("Bar forward overhead", "bar vs shoulders at lockout"),
    "leg_kip": ("Knee bend in the swing", "knee range, arch to top"),
    "early_arm_pull": ("Arms before hips", "elbow bend before the hip snap (+ = early)"),
    "no_push_away": ("Push-away at the top", "shoulders back off the bar in 0.4 s"),
    "bmu_early_pull": ("Hips under bar at the pull", "when the elbows start to bend"),
    "hips_low_transition": ("Hips under bar at transition", "highest hip point before the elbows go over"),
    "chicken_wing": ("Elbow timing gap", "time between the two elbows crossing the bar"),
    "hspu_banana": ("Hips off the body line", "hip vs shoulder-ankle line at lockout (+ = away from the wall)"),
    "hspu_kip_timing": ("Tuck before the kick", "knees above the hips at the deepest tuck"),
}


def build(movement, reps, best_rep, W, H):
    """Measurements and the set-level cue for the non-snatch movements."""
    cue_id, seen = rules.choose_set_cue(movement, [r["values"] for r in reps])
    cue_rep = max(reps, key=lambda r: rules.fired(r["values"]).get(cue_id, 0.0)) if cue_id else best_rep
    missed = next((x for x in reps if x.get("outcome", "make") not in ("make", "unknown")), None)
    if missed is not None:
        # a miss gets its own card (26 section 8.1); its cause is the earliest window that fired (section 3)
        cue_rep = missed
        f_ = rules.gate(set(rules.fired(missed["values"])))
        cue_id = min(f_, key=lambda k: rules.RULES[k]["order"]) if f_ else None
        seen = sum(1 for x in reps if cue_id in rules.fired(x["values"])) if cue_id else 0
    r = cue_rep
    fired = rules.fired(r["values"])
    off = r["off_side_deg"]
    angle_note = f"; filmed ~{off:.0f}° off side-on, so treat as an estimate" if off is not None and off > 20 else ""
    meas = []
    for fid in rules.FAULTS[movement]:
        label, note = LABELS[fid]
        unit = rules.RULES[fid]["unit"]
        v = r["values"].get(fid)
        if v is None:
            meas.append({"id": fid, "label": label, "value": 0, "unit": unit, "frame": r["start"], "status": "not_seen",
                         "note": "could not measure"})
            continue
        status = "cue" if fid == cue_id else ("follows" if fid in fired else "normal")
        if rules.RULES[fid]["horizontal"]:
            note += angle_note
        m = {"id": fid, "label": label, "value": round(float(v), 2 if unit == "s" else 1), "unit": unit,
             "frame": r["s0"] + int(r["detail"][fid]["frame"]), "status": status, "note": note}
        bv = best_rep["values"].get(fid)
        if best_rep is not r and bv is not None:
            m["best"] = round(float(bv), 2 if unit == "s" else 1)
        meas.append(m)
    meas += r["extra_meas"]
    kind = r.get("outcome", "make")
    if kind == "missed_behind":
        from .pipeline import miss_behind_card
        return (*miss_behind_card(r, meas, W, H), cue_rep)
    if kind in ("could_not_stand", "jerk_back") or (kind != "make" and cue_id is None):
        return meas, outcome_card(r, kind, meas, W, H), cue_rep
    if cue_id is None:
        return meas, None, cue_rep
    sev = fired[cue_id]
    conf = rules.rep_confidence(rules.confidence(cue_id, sev, off), seen, len(reps)) if r.get("scale_ok", True) else "low"
    d = r["detail"][cue_id]
    f = int(d["frame"])
    ref = r["_ref"]
    raw = lambda p, fr: from_ref(p, ref["Ms"][fr])
    v = r["values"][cue_id]
    unit = rules.RULES[cue_id]["unit"]
    conf_text = f"Seen on {seen} of {len(reps)} reps"
    if off is not None and off > 20:
        conf_text += f", filmed ~{off:.0f}° off side-on: film from the side to confirm"
    why = rules.why_sentence(cue_id, r["values"], r["detail"][cue_id])
    if kind != "make":
        why = f"{OUTCOME_HEAD[kind](r['outcome_value'])} Earliest thing I can see: {why[0].lower()}{why[1:]}"
    cue = {"faultId": cue_id, "text": rules.CUES[cue_id], "why": why,
           "confidence": conf, "confidenceText": conf_text,
           "evidence": {"rep": r["index"], "frame": r["s0"] + f,
                        "from": normalise(raw(d["from"], f), W, H), "to": normalise(raw(d["to"], f), W, H),
                        "value": round(float(v), 2 if unit == "s" else 1), "unit": unit, "caption": d["caption"]}}
    return meas, cue, cue_rep


OUTCOME_HEAD = {
    "missed_forward": lambda v: f"Missed forward. The bar left you {v:.0f} cm in front of mid-foot.",
    "jerk_forward": lambda v: f"Jerk dumped forward. The bar locked out {v:.0f} cm in front of your shoulder line.",
    "missed": lambda v: "Missed.",
}


def outcome_card(r, kind, meas, W, H):
    """Cards for a miss with no fault to blame: the stuck clean ladder (26 section 2.6), the jerk dumped back (2.8),
    or an honest "can't tell" (8.5)."""
    v, f = r["outcome_value"], int(r["outcome_frame"])
    o = r["outcome_detail"]
    if kind == "could_not_stand":
        if o["trunk"] > 25:
            text = "Elbows up, chest up through the bar."
            why = (f"Could not stand up. Your chest was {o['trunk']:.0f} deg forward at the bottom of the clean, "
                   "so the bar pulled you over.")
        else:
            text = "Build the front squat at this weight."
            why = ("Could not stand up. The bar was racked and your chest stayed up, so this was strength at this weight, "
                   "not a new technique fault.")
    elif kind == "jerk_back":
        text = "Drive straight up first, then split."
        why = f"Jerk dumped back. The bar finished {abs(v):.0f} cm behind your shoulder line" + (
            f", with your torso leaning {o['trunk_back']:.0f} deg back as you landed." if o.get("trunk_back", 0) > 10 else ".")
    else:
        text = "Film one more rep from the side."
        why = f"{OUTCOME_HEAD.get(kind, OUTCOME_HEAD['missed'])(v)} I can't tell why from this clip; film one more rep and I'll compare."
    off = r["off_side_deg"]
    meas.append({"id": "outcome", "label": kind.replace("_", " ").capitalize(), "value": round(float(v), 1), "unit": "cm",
                 "frame": r["s0"] + f, "status": "cue", "note": o.get("note", "")})
    ref = r["_ref"]
    raw = lambda p: from_ref(p, ref["Ms"][f])
    return {"faultId": kind, "text": text, "why": why, "confidence": "low" if (off or 0) > 20 else "worth_checking",
            "confidenceText": "One missed rep" + (f", filmed ~{off:.0f}° off side-on" if off and off > 20 else ""),
            "evidence": {"rep": r["index"], "frame": r["s0"] + f, "from": normalise(raw(o["from"]), W, H),
                         "to": normalise(raw(o["to"]), W, H), "value": round(float(v), 1), "unit": "cm", "caption": o.get("caption", "")}}


def rep_info(ctx, rep_no, s0, fr, Ms, ksm, kw, trace, phases, keys, events, values, detail, extra, px_per_cm, off, made,
             end, lines=None, inliers=None):
    W, H = ctx["W"], ctx["H"]
    g = lambda f: s0 + int(f)
    a = phases[0]["startFrame"]
    path = [{"frame": g(f)} | normalise(from_ref(trace[f], Ms[f]), W, H) for f in range(a, min(len(fr), end + 1))
            if np.isfinite(trace[f]).all()]
    hip_ang = (angle(ksm[:, L_SHO], ksm[:, L_HIP], ksm[:, L_KNEE]) + angle(ksm[:, R_SHO], ksm[:, R_HIP], ksm[:, R_KNEE])) / 2
    knee_ang = (angle(ksm[:, L_HIP], ksm[:, L_KNEE], ksm[:, L_ANK]) + angle(ksm[:, R_HIP], ksm[:, R_KNEE], ksm[:, R_ANK])) / 2
    for dd in detail.values():
        dd.setdefault("caption", "")
    return {
        "rep_no": rep_no, "s0": s0, "start": g(a), "end": g(end), "made": bool(made),
        "phases": [p | {"startFrame": g(p["startFrame"]), "endFrame": g(p["endFrame"])} for p in phases],
        "keys": {kk: g(v) for kk, v in keys.items()},
        "events": {kk: g(v) for kk, v in events.items() if v is not None and not isinstance(v, bool)},
        "path": path, "values": values, "detail": detail, "extra_meas": extra, "px_per_cm": px_per_cm,
        "off_side_deg": off, "plates": [], "fwd": 1.0,
        "severity": max(rules.fired(values).values(), default=0.0),
        "_ref": {"s0": s0, "Ms": Ms, "ksm": ksm, "bar": trace, "plate_ref": np.full_like(trace, np.nan),
                 "knee_ang": knee_ang, "hip_ang": hip_ang, "elbow": np.fmax(*elbows(ksm)), "frames": fr, "kraw": kw, "ks": ctx["ks"][s0:s0 + len(fr)],
                 "lines": lines or []},
    }


# ---------------------------------------------------------------- clean

def run_clean(ctx):
    from .pipeline import analyse_rep
    k, fps, H = ctx["k"], ctx["fps"], ctx["H"]
    up = lambda y: H - y
    wr = mid(k, L_WRI, R_WRI)
    rack = rack_mask(lowpass(k.reshape(len(k), -1), fps).reshape(k.shape), lowpass(wr, fps), fps)
    reps = find_rack_reps(lowpass(up(wr[:, 1]), fps), lowpass(up(mid(k, L_KNEE, R_KNEE)[:, 1]), fps), rack, fps)
    if not reps:
        return ctx["fail"]("unsupported_movement", "No clean found: the bar never went from the floor to a front-rack hold.")
    infos = []
    for ri, (start, end, _) in enumerate(reps):
        r = analyse_rep(ctx["clip"], ctx["meta"], ctx["people"], k, ctx["ks"], ctx["boxes"], start, end, fps, H, ctx["W"],
                        ctx["debug_dir"], ri + 1, kind="clean")
        if r is not None:
            infos.append(clean_info(ctx, r))
    if not infos:
        return ctx["fail"]("bar_out_of_frame", "Could not find the plates at the start of the lift, so the bar could not be measured.")
    return write_out(ctx, infos)


def clean_info(ctx, r):
    """Adapt the snatch-style rep record to the generic builder: evidence points per fault and the extra rows."""
    ref = r["_ref"]
    s0 = ref["s0"]
    lo = ref["lo"]
    det = r["detail"]
    ksm = ref["ksm"]
    for fid, d in det.items():
        f = d["frame"]
        if fid == "hips_rise_early":
            d.update({"from": ref["hip"][lo], "to": ref["hip"][f], "caption": f"hips +{d['hip_rise']:.0f} cm · shoulders +{d['sho_rise']:.0f} cm"})
        elif fid == "bar_forward_off_hips":
            d.update({"from": ref["bar"][d["from_frame"]], "to": ref["bar"][f], "caption": f"hip · {r['values'][fid]:.0f} cm fwd"})
        elif fid == "jump_forward":
            d.update({"caption": f"feet · {r['values'][fid]:.0f} cm fwd"})
        elif fid == "early_arm_bend":
            e = mid(ksm, L_ELB, R_ELB)
            d.update({"from": e[d["from_frame"]], "to": ref["hip"][d["to_frame"]], "caption": f"elbows bend {r['values'][fid]:.2f} s early"})
        elif fid == "incomplete_extension":
            d.update({"from": ref["sho"][f], "to": ref["hip"][f], "caption": f"hip {d['hip_max']:.0f}° at the top"})
    ev = r["events"]
    r["s0"] = s0
    m = r["miss"]
    r["outcome_value"], r["outcome_frame"] = m["bar_vs_midfoot"], m["frame"]
    r["outcome_detail"] = {"from": m["midfoot"], "to": m["bar"], "note": "bar vs mid-foot when it left you (+ = in front)",
                           "caption": f"bar {abs(m['bar_vs_midfoot']):.0f} cm {'behind' if m['bar_vs_midfoot'] < 0 else 'in front of'} mid-foot"}
    if not r["made"]:
        # stuck clean ladder (26 section 2.6): racked, then the hips never open past 120 deg
        b = ev["catch_bottom"] - s0
        t = mv.torso_px(ksm)
        racked = abs(ref["bar"][b, 1] - ref["sho"][b, 1]) < 0.35 * t
        if racked and np.nanmax(ref["hip_ang"][b:]) < 120:
            lean = 90.0 - float(ref["trunk"][b]) if r["fwd"] * (ref["sho"][b, 0] - ref["hip"][b, 0]) > 0 else 0.0
            r["outcome"] = "could_not_stand"
            r["outcome_frame"] = b
            r["outcome_value"] = r["catch_depth"]
            r["outcome_detail"] = {"from": ref["hip"][b], "to": ref["sho"][b], "trunk": lean,
                                   "note": "racked, then the hips never opened past 120°", "caption": f"chest {lean:.0f}° forward"}
    r["extra_meas"] = [
        {"id": "bar_peak_height", "label": "Bar peak height", "value": round(r["peak_h"], 1), "unit": "cm",
         "frame": ev["peak"], "status": "normal", "note": "above lift-off (wrist midpoint)"},
        {"id": "catch_depth", "label": "Catch depth", "value": round(abs(r["catch_depth"]), 1), "unit": "cm",
         "frame": r["catch_depth_frame"], "status": "normal",
         "note": f"{r['catch_kind']} clean, hip {'below' if r['catch_depth'] > 0 else 'above'} knee, knee {r['catch_knee_min']:.0f}°"},
        {"id": "turnover_time", "label": "Extension to rack", "value": round(r["turnover_s"], 2), "unit": "s",
         "frame": ev["second_ext"], "status": "normal", "note": "± 1 frame at 30 fps"},
        speed.measurement(r),
    ]
    return r


# ---------------------------------------------------------------- jerk

def run_jerk(ctx):
    k, fps, H = ctx["k"], ctx["fps"], ctx["H"]
    up = lambda y: H - y
    t = mv.torso_px(k)
    wr = lowpass(up(mid(k, L_WRI, R_WRI)[:, 1]), fps)
    sho = lowpass(up(mid(k, L_SHO, R_SHO)[:, 1]), fps)
    head = lowpass(up(mv.head_y(k, t)), fps)
    reps = find_jerk_reps(np.abs(wr - sho) < 0.35 * t, wr > head, fps)
    if not reps:
        return ctx["fail"]("unsupported_movement", "No jerk found: the bar never went from the shoulders to overhead.")
    px_body = scale_from_body(k)
    if not px_body:
        return ctx["fail"]("too_far", "Could not measure the lifter's body to scale the clip.")
    infos = []
    for ri, (start, end, _) in enumerate(reps):
        infos.append(jerk_rep(ctx, ri + 1, start, end, px_body))
    return write_out(ctx, infos)


def jerk_rep(ctx, rep_no, start, end, px_per_cm):
    fps = ctx["fps"]
    n = ctx["n"]
    s0 = max(0, start - int(0.3 * fps))
    e0 = min(n, end + int(0.5 * fps))
    fr, e0, kw, kr, ksm, Ms, body_h = load_window(ctx, s0, e0, wrist_band=True)
    t = mv.torso_px(ksm)
    overlap = np.nanmedian(np.linalg.norm(kr[:, L_WRI] - kr[:, R_WRI], axis=1)) < 0.15 * body_h
    bar = lowpass(bar_from_wrists(kr[:, L_WRI], kr[:, R_WRI], 0.12 * body_h), fps, 6.0) if overlap else mid(ksm, L_WRI, R_WRI)
    knee_ang = (angle(ksm[:, L_HIP], ksm[:, L_KNEE], ksm[:, L_ANK]) + angle(ksm[:, R_HIP], ksm[:, R_KNEE], ksm[:, R_ANK])) / 2
    el = np.fmax(*elbows(ksm))
    o = start - s0
    phases, ev = segment_jerk(-bar[o:, 1], knee_ang[o:], el[o:], fps)
    phases = [p | {"startFrame": p["startFrame"] + o, "endFrame": p["endFrame"] + o} for p in phases]
    ev = {kk: v + o for kk, v in ev.items()}
    fwd = facing(ksm[ev["dip_start"]: ev["leave"] + 1]) if ev["leave"] > ev["dip_start"] else facing(ksm)
    off = off_side_pose(ksm)
    fs = 1 / np.cos(np.radians(min(off or 0.0, 60.0)))
    cm = lambda px: float(px / px_per_cm)
    sho, hip = mid(ksm, L_SHO, R_SHO), mid(ksm, L_HIP, R_HIP)
    ank_l, ank_r = ksm[:, L_ANK], ksm[:, R_ANK]
    ds, db, land, rec = ev["dip_start"], ev["dip_bottom"], ev["land"], ev["recovered"]
    lock = min(rec, len(fr) - 1)
    vals, det = {}, {}
    vals["forward_dip"] = cm(fwd * (bar[db, 0] - bar[ds, 0])) * fs
    det["forward_dip"] = {"frame": db, "from": bar[ds], "to": bar[db], "caption": f"dip · {vals['forward_dip']:.0f} cm fwd"}
    # press-out (26 section 8.3, the rulebook): the elbows still straightening after the hips reach their lowest point
    hip_h = -hip[:, 1]
    hm = land + int(np.argmin(hip_h[land: min(len(fr), land + int(0.6 * fps) + 1)]))
    rise = np.where(hip_h[hm:] > hip_h[hm] + 0.05 * t)[0]
    he = hm + (int(rise[0]) if len(rise) else 0)
    vals["press_out"] = float(np.max(el[hm:he + 1]) - el[hm]) if el[hm] < 165 else 0.0
    det["press_out"] = {"frame": hm, "from": mid(ksm, L_ELB, R_ELB)[hm], "to": bar[hm], "elbow_land": float(el[hm]),
                        "caption": f"elbow {el[hm]:.0f}° at the bottom, +{vals['press_out']:.0f}° after"}
    lean = 90.0 - float(trunk_angle(sho[land], hip[land]))
    lean_fwd = fwd * (sho[land, 0] - hip[land, 0]) > 0
    vals["chest_dive"] = lean if lean_fwd else -lean
    det["chest_dive"] = {"frame": land, "from": hip[land], "to": sho[land], "caption": f"chest {vals['chest_dive']:.0f}° forward"}
    vals["bar_forward_overhead"] = cm(fwd * (bar[lock, 0] - sho[lock, 0])) * fs
    det["bar_forward_overhead"] = {"frame": lock, "from": sho[lock], "to": bar[lock], "caption": f"bar · {vals['bar_forward_overhead']:.0f} cm fwd"}
    sep = np.abs(fwd * (ank_l[:, 0] - ank_r[:, 0]))
    leg = np.nanmedian(np.linalg.norm(hip - mid(ksm, L_ANK, R_ANK), axis=1))
    catch_sep = float(np.nanmax(sep[land: lock + 1])) if lock >= land else 0.0
    style = "split" if catch_sep > 0.3 * leg else "push"
    rack_h = float(np.median(-bar[o: o + max(3, int(0.3 * fps)), 1]))
    extra = [
        {"id": "dip_depth", "label": "Dip depth", "value": round(cm(rack_h - (-bar[db, 1])), 1), "unit": "cm",
         "frame": s0 + db, "status": "normal", "note": "bar drop from the rack"},
        {"id": "catch_style", "label": "Foot split", "value": round(cm(catch_sep), 1), "unit": "cm",
         "frame": s0 + land, "status": "normal", "note": f"{style} jerk (ankles apart front to back)"},
        {"id": "lockout_elbow", "label": "Lockout elbow", "value": round(float(el[lock]), 1), "unit": "deg",
         "frame": s0 + lock, "status": "normal", "note": "standard: arms straight overhead"},
        {"id": "dip_knee", "label": "Knee bend in the dip", "value": round(float(knee_ang[ds] - knee_ang[db]), 1), "unit": "deg",
         "frame": s0 + db, "status": "normal",
         "note": "under ~10° there is no leg drive: a press, not a jerk" if knee_ang[ds] - knee_ang[db] < 10 else "dip and drive"},
    ]
    made = bool(rec < len(fr) - 1 and el[lock] >= 155)
    ov = vals["bar_forward_overhead"]
    kind = "make" if made else ("jerk_forward" if ov > 5 else "jerk_back" if ov < -8 else "missed")
    tb = lean if not lean_fwd else 0.0
    out = {"outcome": kind, "outcome_value": ov, "outcome_frame": lock,
           "outcome_detail": {"from": sho[lock], "to": bar[lock], "trunk_back": tb, "note": "bar vs shoulder line at lockout (+ = in front)",
                              "caption": f"bar {abs(ov):.0f} cm {'behind' if ov < 0 else 'in front of'} shoulders"}}
    return rep_info(ctx, rep_no, s0, fr, Ms, ksm, kw, bar, phases, jerk_key_frames(ev), ev, vals, det, extra,
                    px_per_cm, off, made, rec) | {"fwd": fwd} | out


# ---------------------------------------------------------------- gymnastics

def run_gym(ctx):
    movement, k, fps, H = ctx["movement"], ctx["k"], ctx["fps"], ctx["H"]
    up = lambda y: H - y
    t = mv.torso_px(k)
    sho = lowpass(up(mid(ctx["world"], L_SHO, R_SHO)[:, 1]), fps)  # camera motion removed: reps are body travel
    px_per_cm = scale_from_body(k)
    if not px_per_cm:
        return ctx["fail"]("too_far", "Could not measure the athlete's body to scale the clip.")
    rel = sho - lowpass(up(mid(ctx["world"], L_WRI, R_WRI)[:, 1]), fps)  # shoulders above the hands, px
    if movement == "kipping_hspu":
        # a rep bottoms out with the shoulders near the hands (head on the floor) and tops out arms-length above
        cyc = [c for c in gym.cycle_tops(-sho, t, fps, prominence=0.3) if rel[c[1]] < 0.4 * t]
        name = "handstand push-up"
    else:
        # a rep gets the shoulders up near the bar (a dead hang has them ~1 torso under the hands) with the arms bent;
        # kip swings do neither. A muscle-up has two shoulder peaks (the pull, then the press to support) with no
        # return to the hang between them: one rep.
        # pull-up top: shoulders within ~0.35 torso of the hands (chin near the bar); muscle-up top: shoulders
        # clearly above the hands (support). Swing peaks that do neither are not reps.
        el = lowpass(np.fmin(*elbows(k)), fps)
        top_min = -0.35 * t if movement == "kipping_pull_up" else 0.2 * t
        cyc = [c for c in gym.cycle_tops(sho, t, fps, prominence=0.4)
               if rel[c[1]] > top_min and np.nanmin(el[max(0, c[1] - int(0.5 * fps)): c[1] + int(0.5 * fps) + 1]) < 120]
        cyc = gym.merge_cycles(cyc, sho, rel, -0.75 * t)
        name = "pull" if movement == "kipping_pull_up" else "muscle-up"
    if not cyc:
        return ctx["fail"]("unsupported_movement", f"No {name} reps found in this clip.")
    if movement != "kipping_hspu" and any(gym.shoulders_cut_off(k, a, b, H) for a, _, b in cyc):
        return ctx["fail"]("clip_cut_off", "The bar and the top of the rep are out of the frame. Film with the bar and "
                                           "some space above it in view.")
    infos = []
    for ri, (a, top, b) in enumerate(cyc):
        last = ri == len(cyc) - 1
        r = (hspu_rep if movement == "kipping_hspu" else hang_rep)(ctx, ri + 1, a, top, b, px_per_cm, last)
        if r is not None:
            infos.append(r)
    if not infos:
        return ctx["fail"]("unsupported_movement", f"No {name} reps found in this clip.")
    return write_out(ctx, infos)


def hang_rep(ctx, rep_no, a, top, b, px_per_cm, last):
    movement, fps, n = ctx["movement"], ctx["fps"], ctx["n"]
    s0 = max(0, a - int(0.6 * fps))
    e0 = min(n, b + int(0.2 * fps) + 1)
    fr, e0, kw, kr, ksm, Ms, body_h = load_window(ctx, s0, e0)
    t_px = mv.torso_px(ksm)
    T, B = top - s0, min(b - s0, len(fr) - 1)
    sho, hip, knee = mid(ksm, L_SHO, R_SHO), mid(ksm, L_HIP, R_HIP), mid(ksm, L_KNEE, R_KNEE)
    wri = mid(ksm, L_WRI, R_WRI)
    hanging = wri[:, 1] < sho[:, 1] - 0.3 * t_px
    if hanging.sum() < 3:
        return None
    bar_y = float(np.median(wri[hanging, 1]) - 0.12 * t_px)
    bar_x = float(np.median(wri[hanging, 0]))
    bar_h = -bar_y
    fwd = facing(ksm[hanging]) if hanging.any() else 1.0
    off = off_side_pose(ksm)
    fs = 1 / np.cos(np.radians(min(off or 0.0, 60.0)))
    cm = lambda px: float(px / px_per_cm)
    legs_fwd = fwd * (knee[:, 0] - hip[:, 0])
    hip_ang = (angle(ksm[:, L_SHO], ksm[:, L_HIP], ksm[:, L_KNEE]) + angle(ksm[:, R_SHO], ksm[:, R_HIP], ksm[:, R_KNEE])) / 2
    knee_ang = (angle(ksm[:, L_HIP], ksm[:, L_KNEE], ksm[:, L_ANK]) + angle(ksm[:, R_HIP], ksm[:, R_KNEE], ksm[:, R_ANK])) / 2
    el = np.fmax(*elbows(ksm))
    kip = gym.kip_events(legs_fwd, hip_ang, el, 0, T)
    vals, det = {}, {}
    lines = [("h", bar_y)]
    if movement == "kipping_pull_up":
        vals["leg_kip"] = float(np.nanmax(knee_ang[kip["arch_start"]:T + 1]) - np.nanmin(knee_ang[kip["arch_start"]:T + 1]))
        kf = kip["arch_start"] + int(np.nanargmin(knee_ang[kip["arch_start"]:T + 1]))
        det["leg_kip"] = {"frame": kf, "from": hip[kf], "to": knee[kf], "caption": f"knees through {vals['leg_kip']:.0f}°"}
        vals["early_arm_pull"] = (kip["hip_open"] - kip["elbow_break"]) / fps
        eb = kip["elbow_break"]
        det["early_arm_pull"] = {"frame": eb, "from": mid(ksm, L_ELB, R_ELB)[eb], "to": hip[kip["hip_open"]],
                                 "caption": f"elbows {vals['early_arm_pull']:+.2f} s before hips"}
        if not last:
            vals["no_push_away"] = cm(gym.push_away(fwd * sho[:, 0], T, fps)) * fs
            det["no_push_away"] = {"frame": T, "from": sho[T], "to": np.array([bar_x, bar_y]),
                                   "caption": f"push-away {vals['no_push_away']:.0f} cm"}
        else:
            vals["no_push_away"] = None
        chin = cm(-sho[T, 1] - bar_h) + 12.0
        made = chin > 0
        extra = [{"id": "chin_over_bar", "label": "Chin over bar (est.)", "value": round(chin, 1), "unit": "cm",
                  "frame": ctx_frame(s0, T), "status": "normal",
                  "note": "estimated from the shoulders (+12 cm); no head points are kept"},
                 {"id": "swing", "label": "Swing", "value": round(cm(np.nanmax(fwd * hip[:T + 1, 0]) - np.nanmin(fwd * hip[:T + 1, 0])) * fs, 1),
                  "unit": "cm", "frame": ctx_frame(s0, T), "status": "normal", "note": "hip travel front to back"}]
        phases = gym.kip_phases(kip, B)
        keys = {"arch": kip["arch_start"], "hollow": kip["hollow_start"], "hip_drive": kip["hip_open"], "recovery": T}
        events = {kk: v for kk, v in kip.items()}
    else:
        ev = gym.bmu_events(kip, -ksm[:, L_ELB, 1], -ksm[:, R_ELB, 1], -sho[:, 1], el, bar_h, t_px, B)
        eb = kip["elbow_break"]
        vals["bmu_early_pull"] = cm(bar_h - (-hip[eb, 1]))
        det["bmu_early_pull"] = {"frame": eb, "from": np.array([hip[eb, 0], bar_y]), "to": hip[eb],
                                 "caption": f"hips {vals['bmu_early_pull']:.0f} cm under bar"}
        upto = ev["cross"] if ev["cross"] is not None else T
        hp = int(np.nanargmax(-hip[: upto + 1, 1]))
        vals["hips_low_transition"] = cm(bar_h - (-hip[hp, 1]))
        det["hips_low_transition"] = {"frame": hp, "from": np.array([hip[hp, 0], bar_y]), "to": hip[hp],
                                      "caption": f"hips peak {vals['hips_low_transition']:.0f} cm under"}
        ksw = ctx["ks"][s0:s0 + len(fr)]
        # B3: time between the two elbows crossing the bar line (each elbow's own first frame over it)
        crossings = []
        for j in (L_ELB, R_ELB):
            over = np.where(-ksm[kip["hip_open"]:B + 1, j, 1] > bar_h)[0]
            crossings.append(kip["hip_open"] + int(over[0]) if len(over) else None)
        if None not in crossings and all(ksw[c, j] > 0.5 for c, j in zip(crossings, (L_ELB, R_ELB))):
            c0, c1 = min(crossings), max(crossings)
            vals["chicken_wing"] = (c1 - c0) / fps
            late = "left" if crossings[0] > crossings[1] else "right"
            det["chicken_wing"] = {"frame": c1, "from": ksm[c0, L_ELB if crossings[0] == c0 else R_ELB],
                                   "to": ksm[c1, L_ELB if crossings[0] == c1 else R_ELB], "gap_s": (c1 - c0) / fps,
                                   "side": late if c1 > c0 else "late",
                                   "caption": f"{late} elbow {int(round((c1 - c0) / fps * 100)) * 10} ms later"}
        else:
            vals["chicken_wing"] = None
        lock_el = float(np.nanmax(el[ev["support"]:B + 1])) if ev["support"] is not None else float(np.nanmax(el[T:B + 1]))
        over = cm(np.nanmax(-sho[:B + 1, 1]) - bar_h)
        made = ev["lockout"] is not None
        extra = [{"id": "support_lockout", "label": "Lockout in support", "value": round(lock_el, 1), "unit": "deg",
                  "frame": ctx_frame(s0, ev["lockout"] if ev["lockout"] is not None else T), "status": "normal",
                  "note": "standard: elbows straight (≥160°) with shoulders over the bar"},
                 {"id": "shoulders_over_bar", "label": "Shoulders over bar", "value": round(over, 1), "unit": "cm",
                  "frame": ctx_frame(s0, T), "status": "normal", "note": "highest shoulder point vs the bar line"}]
        phases = gym.bmu_phases(ev, B)
        keys = {p["name"]: p["startFrame"] for p in phases}
        events = {kk: v for kk, v in ev.items()}
    return rep_info(ctx, rep_no, s0, fr, Ms, ksm, kw, hip, phases, keys, events, vals, det, extra, px_per_cm, off,
                    made, B, lines=lines) | {"fwd": fwd}


def ctx_frame(s0, f):
    return int(s0 + f)


def hspu_rep(ctx, rep_no, top0, bottom, top1, px_per_cm, last):
    fps, n = ctx["fps"], ctx["n"]
    s0 = max(0, top0 - int(0.3 * fps))
    e0 = min(n, top1 + int(0.3 * fps) + 1)
    fr, e0, kw, kr, ksm, Ms, body_h = load_window(ctx, s0, e0)
    T0, T1 = top0 - s0, min(top1 - s0, len(fr) - 1)
    sho, hip, ank, wri = mid(ksm, L_SHO, R_SHO), mid(ksm, L_HIP, R_HIP), mid(ksm, L_ANK, R_ANK), mid(ksm, L_WRI, R_WRI)
    inverted = ank[:, 1] < sho[:, 1]
    if inverted[T0:T1 + 1].mean() < 0.5:
        return None
    wall_dir = 1.0 if np.nanmedian(ank[inverted, 0] - wri[inverted, 0]) >= 0 else -1.0
    hip_ang = (angle(ksm[:, L_SHO], ksm[:, L_HIP], ksm[:, L_KNEE]) + angle(ksm[:, R_SHO], ksm[:, R_HIP], ksm[:, R_KNEE])) / 2
    knee_ang = (angle(ksm[:, L_HIP], ksm[:, L_KNEE], ksm[:, L_ANK]) + angle(ksm[:, R_HIP], ksm[:, R_KNEE], ksm[:, R_ANK])) / 2
    el = np.fmax(*elbows(ksm))
    ev = gym.hspu_events(-sho[:, 1], hip_ang, knee_ang, el, T0, T1, fps)
    off = off_side_pose(ksm)
    fs = 1 / np.cos(np.radians(min(off or 0.0, 60.0)))
    cm = lambda px: float(px / px_per_cm)
    lk = ev["lockout"]
    vals, det = {}, {}
    vals["hspu_banana"] = cm(gym.chord_offset(sho[lk], hip[lk], ank[lk], -wall_dir)) * fs
    det["hspu_banana"] = {"frame": lk, "from": (sho[lk] + ank[lk]) / 2, "to": hip[lk], "caption": f"hips {vals['hspu_banana']:.0f} cm off line"}
    # H1 (25 section 4): how far the knees stayed above the hips at the deepest tuck before the kick
    knee = mid(ksm, L_KNEE, R_KNEE)
    a_, b_ = T0, max(T0, ev["drive"])
    gap = -(knee[a_:b_ + 1, 1] - hip[a_:b_ + 1, 1])
    tf = a_ + int(np.nanargmin(gap))
    vals["hspu_kip_timing"] = cm(gap[tf - a_])
    det["hspu_kip_timing"] = {"frame": tf, "from": hip[tf], "to": knee[tf], "caption": f"knees {vals['hspu_kip_timing']:.0f} cm above hips"}
    timing = gym.timing_error(ev["drive"], ev["press"], fps)
    wall_x = float(np.nanpercentile(wall_dir * ksm[T0:T1 + 1, [L_HEEL, R_HEEL], 0], 95)) * wall_dir
    extra = [{"id": "lockout_elbow", "label": "Lockout elbow", "value": round(float(el[lk]), 1), "unit": "deg",
              "frame": s0 + lk, "status": "normal", "note": "standard: arms straight at the top (≥160°)"},
             {"id": "tuck_hip", "label": "Tuck", "value": round(float(hip_ang[ev["tuck"]]), 1), "unit": "deg",
              "frame": s0 + ev["tuck"], "status": "normal", "note": "tightest hip angle before the drive (<90° = full tuck)"},
             {"id": "drive_press", "label": "Drive to press", "value": round((ev["press"] - ev["drive"]) / fps, 2), "unit": "s",
              "frame": s0 + ev["press"], "status": "normal",
              "note": "press after the leg drive; 0 to 0.25 s is in time" + ("" if timing == 0 else f" ({timing:.2f} s outside)")},
             {"id": "bottom_depth", "label": "Shoulders above hands at bottom", "value": round(cm(wri[ev['bottom'], 1] - sho[ev['bottom'], 1]), 1),
              "unit": "cm", "frame": s0 + ev["bottom"], "status": "normal", "note": "smaller = deeper (head to the floor)"}]
    phases = gym.hspu_phases(ev)
    keys = {"tuck": ev["tuck"], "drive": ev["drive"], "press": ev["press"], "lockout": lk}
    made = bool(el[lk] >= 160)
    return rep_info(ctx, rep_no, s0, fr, Ms, ksm, kw, hip, phases, keys, ev, vals, det, extra, px_per_cm, off, made,
                    T1, lines=[("v", wall_x)]) | {"fwd": wall_dir}


def run(ctx):
    m = ctx["movement"]
    if m == "clean":
        return run_clean(ctx)
    if m == "jerk":
        return run_jerk(ctx)
    return run_gym(ctx)
