import json
import os
import pickle
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np

from . import detect
from . import external_pose
from . import movement as mv
from . import outcome
from . import rules
from . import speed
from .geometry import angle, bar_from_wrists, lowpass, normalise, rise_ratio, trunk_angle
from .lifter import select_lifter
from .phases import (SNATCH_PHASES, approaches_camera, catch_depth, find_reps, key_frames, plate_follows_bar,
                     plate_liftoff, segment_snatch)
from .pose import (L_ANK, L_BIGTOE, L_ELB, L_HEEL, R_ELB, L_HIP, L_KNEE, L_SHO, L_WRI, R_ANK, R_BIGTOE, R_HEEL,
                   R_HIP, R_KNEE, R_SHO, R_WRI, run_pose, strip_head)
from .track import (camera_path, find_plates, foreground_mask, from_ref, refine_plate, stabilise, to_ref, to_world,
                    track_plate)
from .video import ClipUnreadable, frames, probe

INFER_H = 1280
PLATE_CM = 45.0
PLATE_SPAN_CM = 150.0  # centre-to-centre of the two outer plates on a 220 cm bar (approx.)
KEYFRAME_H = 1080
PLATE_FIT_SPREAD = 0.15  # setup-frame plate fits further than this from their median are failed fits
SCALE_VS_BODY = (0.75, 1.75)  # near-plate px/cm over the lifter's body px/cm: the plate sits 0-75 cm nearer the camera
BODY_DEPTH_RATIO = (0.75, 1.0)  # bar-centre scale over near-plate scale: the bar centre is never nearer than the plate


def mid(k, a, b):
    return (k[:, a] + k[:, b]) / 2


def load_pose(clip, cache_dir, two_pass=False, external=None):
    """external: the phone's pose (external_pose.py) used instead of RTMPose. Inverted lifts (two_pass) still run
    RTMPose: Vision has not been checked upside down."""
    if external is not None and not two_pass:
        return external_pose.to_people(external, probe(clip), INFER_H)
    os.makedirs(cache_dir, exist_ok=True)
    cache = os.path.join(cache_dir, os.path.basename(clip) + (".2pass" if two_pass else "") + ".pose.pkl")
    if os.path.exists(cache):
        people, shape = pickle.load(open(cache, "rb")).values()
    else:
        people, shape = run_pose(clip, INFER_H, two_pass=two_pass)
        pickle.dump({"people": people, "shape": shape}, open(cache, "wb"))
    return strip_head(people), shape  # caches written before head points were dropped at the pose step


def detect_movement(clip, cache_dir, external=None):
    """Which barbell lift the clip shows (snatch, clean, jerk or unknown) and how sure, from the pose alone. It shares
    the pose cache with run(), so a run that follows costs no second inference."""
    people, _ = load_pose(clip, cache_dir, external=external)
    k, _, _ = select_lifter(people)
    world = to_world(k, camera_path(clip, people, INFER_H))
    return detect.detect(world, probe(clip)["fps"], lifts=True)


def stamp(res, out_json, det):
    analysis = res if isinstance(res, dict) else res[0]
    analysis["detectedMovement"] = {"movement": det["movement"], "confidence": det["confidence"]}
    write(out_json, analysis)
    return res


def run(clip, out_json, assets_dir, asset_prefix, debug_dir, cache_dir, analysis_id, movement="snatch", detected=None,
        external=None):
    t0 = time.time()
    meta = probe(clip)
    fps = meta["fps"]
    people, shape = load_pose(clip, cache_dir, two_pass=movement == "kipping_hspu", external=external)
    t_pose = time.time() - t0
    if shape is None:
        raise ClipUnreadable("no frames decoded")
    H, W = shape[:2]
    n = len(people)
    k, ks, boxes = select_lifter(people, hanging=mv.FAMILY.get(movement) == "hanging")

    def fail(reason, code, message, frame=None):
        # reason picks the app's failure screen; code is the specific refusal, kept in lifts.error to measure them
        return write(out_json, base(analysis_id, meta, n, movement) | {
            "reps": [], "bestRepIndex": 0, "cue": None, "measurements": [],
            "failure": {"reason": reason, "code": code, "message": message} | ({"frame": int(frame)} if frame is not None else {})})

    world = to_world(k, camera_path(clip, people, INFER_H))
    det = detected or detect.detect(world, fps)
    sig = mv.signals(world, fps)
    ok, msg = mv.check(movement, sig)
    if not ok:
        code = "not_available" if movement not in mv.FAMILY else "no_person" if sig is None else "movement_mismatch"
        return stamp(fail("unsupported_movement", code, msg), out_json, det)
    ctx = {"clip": clip, "meta": meta, "people": people, "k": k, "ks": ks, "boxes": boxes, "fps": fps, "H": H, "W": W,
           "n": n, "out_json": out_json, "assets_dir": assets_dir, "asset_prefix": asset_prefix, "debug_dir": debug_dir,
           "analysis_id": analysis_id, "movement": movement, "fail": fail, "t0": t0, "t_pose": t_pose, "world": world}
    if movement == "snatch":
        return stamp(run_snatch(ctx), out_json, det)
    from . import lifts
    return stamp(lifts.run(ctx), out_json, det)


def run_snatch(ctx):
    clip, meta, people, k, ks, boxes, fps, H, W, n = (ctx[x] for x in ("clip", "meta", "people", "k", "ks", "boxes", "fps", "H", "W", "n"))
    out_json, assets_dir, asset_prefix, debug_dir, analysis_id, fail = (ctx[x] for x in ("out_json", "assets_dir", "asset_prefix", "debug_dir", "analysis_id", "fail"))
    t0, t_pose = ctx["t0"], ctx["t_pose"]
    up = lambda y: H - y
    wr_h = up(mid(k, L_WRI, R_WRI)[:, 1])
    reps = find_reps(lowpass(wr_h, fps), lowpass(up(mv.head_y(k)), fps), lowpass(up(mid(k, L_KNEE, R_KNEE)[:, 1]), fps), fps)
    if not reps:
        return fail("unsupported_movement", "no_reps", "No floor-to-overhead lift found in this clip.")

    out_reps, rep_info, not_lifts = [], [], 0
    for ri, (start, end, _) in enumerate(reps):
        info = analyse_rep(clip, meta, people, k, ks, boxes, start, end, fps, H, W, debug_dir, ri + 1)
        not_lifts += info is False
        if info:
            rep_info.append(info)
    if not rep_info and not_lifts:
        return fail("unsupported_movement", "no_reps", "No floor-to-overhead lift found in this clip.")
    if not rep_info:
        return fail("bar_out_of_frame", "no_plate", "Could not find the plates at the start of the lift, so the bar could not be measured.")

    best = max(rep_info, key=lambda r: (r["made"], -r["severity"]))
    for i, r in enumerate(rep_info):
        r["index"] = i + 1
    # the cue comes from the rep where the chosen fault is most severe; the others say whether it repeats
    cue_rep = next((r for r in rep_info if r["outcome"].startswith("missed")), None) or max(rep_info, key=lambda r: r["severity"])
    measurements, cue = build_cue(cue_rep, rep_info, best, W, H)
    cue, no_cue = withhold(cue, cue_rep, measurements)

    keyframes_dir = assets_dir
    os.makedirs(keyframes_dir, exist_ok=True)
    jobs = []
    for r in rep_info:
        kfs = []
        for pi, phase in enumerate(SNATCH_PHASES):
            f = r["keys"][phase]
            name = f"r{r['index']}-{pi + 1}-{phase}.jpg"
            jobs.append((f, os.path.join(keyframes_dir, name)))
            kfs.append({"phase": phase, "frame": int(f), "image": f"{asset_prefix}/{name}"})
        out_reps.append({"index": r["index"], "startFrame": r["start"], "endFrame": r["end"], "made": r["made"],
                         "phases": r["phases"], "keyFrames": kfs, "path": r["path"]})
    export_keyframes(ctx, jobs)

    analysis = base(analysis_id, meta, n) | {
        "pxPerCm": round(cue_rep["px_per_cm"] * KEYFRAME_H / H, 3),
        "reps": out_reps,
        "bestRepIndex": best["index"],
        "cue": cue,
        **({"noCueReason": no_cue} if no_cue else {}),
        "notes": rules.notes("snatch", rep_info, cue),
        "measurements": measurements,
        "failure": None,
    }
    write(out_json, analysis)
    timing = {"pose_s": round(t_pose, 1), "total_s": round(time.time() - t0, 1)}
    with open(os.path.join(debug_dir, "timing.json"), "w") as fh:
        json.dump(timing, fh)
    return analysis, rep_info, timing


def base(analysis_id, meta, n, movement="snatch"):
    vh = KEYFRAME_H
    vw = int(round(meta["width"] * vh / meta["height"]))
    return {"version": 1, "id": analysis_id, "movement": movement,
            "video": {"uri": f"assets/analysis/{analysis_id}", "width": vw, "height": vh, "fps": meta["fps"],
                      "frameCount": meta["frameCount"] or n},
            "traceKind": "hip" if mv.FAMILY.get(movement, "barbell") != "barbell" else "bar"}


def write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=1)
        fh.write("\n")
    return obj


def read_frame(clip, f, fps, height=KEYFRAME_H):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{f / fps:.4f}", "-i", clip, "-frames:v", "1",
                          "-vf", f"scale=-2:{height}", "-f", "image2pipe", "-c:v", "png", "-"], check=True, capture_output=True).stdout
    if not raw and f > 0:
        # variable frame rate: the last frame can be stamped before f / fps, so the seek lands past the end
        return read_frame(clip, f - 1, fps, height)
    return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)


def export_keyframes(ctx, jobs):
    """Keyframe JPEGs, one per (frame, path). The frames are seeked and decoded in parallel: each is its own ffmpeg
    process."""
    fs = [int(min(max(f, 0), ctx["n"] - 1)) for f, _ in jobs]
    with ThreadPoolExecutor(4) as ex:
        imgs = list(ex.map(lambda f: read_frame(ctx["clip"], f, ctx["fps"]), fs))
    for img, (_, path) in zip(imgs, jobs):
        cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 85])


def analyse_rep(clip, meta, people, k, ks, boxes, start, end, fps, H, W, debug_dir, rep_no, kind="snatch"):
    """One floor-to-catch rep. kind 'clean' catches in the front rack (bar at the shoulders, elbows forward) instead
    of an overhead lockout, and the window stops at the end of the rack hold so a following jerk is not the peak."""
    n = len(people)
    s0 = max(0, start - int(2 * fps))
    e0 = min(n, end + (int(1.0 * fps) if kind == "snatch" else 1))
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
    hands_overlap = np.nanmedian(np.linalg.norm(kr[:, L_WRI] - kr[:, R_WRI], axis=1)) < 0.15 * body_h
    if hands_overlap:
        bar = lowpass(bar_from_wrists(kr[:, L_WRI], kr[:, R_WRI], 0.12 * body_h), fps, 6.0)
    else:
        bar = (ksm[:, L_WRI] + ksm[:, R_WRI]) / 2
    knee_ang = (angle(ksm[:, L_HIP], ksm[:, L_KNEE], ksm[:, L_ANK]) + angle(ksm[:, R_HIP], ksm[:, R_KNEE], ksm[:, R_ANK])) / 2
    hip_ang = (angle(ksm[:, L_SHO], ksm[:, L_HIP], ksm[:, L_KNEE]) + angle(ksm[:, R_SHO], ksm[:, R_HIP], ksm[:, R_KNEE])) / 2
    sho, hip = mid(ksm, L_SHO, R_SHO), mid(ksm, L_HIP, R_HIP)
    knee, ank = mid(ksm, L_KNEE, R_KNEE), mid(ksm, L_ANK, R_ANK)
    trunk = trunk_angle(sho, hip)

    elbow = np.minimum(angle(ksm[:, L_SHO], ksm[:, L_ELB], ksm[:, L_WRI]), angle(ksm[:, R_SHO], ksm[:, R_ELB], ksm[:, R_WRI]))
    rack = None
    if kind == "clean":
        from .lifts import rack_mask
        rack = rack_mask(ksm, bar, fps)
    phases, ev = segment_snatch(up(bar[:, 1]), knee_ang, fps, elbow=elbow, catch_mask=rack)
    lo = ev["liftoff"]
    knee_pass = next((f for f in range(lo, ev["peak"]) if bar[f, 1] <= knee[f, 1]), None)
    if knee_pass is not None and not ev["double_knee_bend"]:
        phases, ev = segment_snatch(up(bar[:, 1]), knee_ang, fps, knee_pass=knee_pass, elbow=elbow, catch_mask=rack)

    # 2. plates at setup (sharp, static) -> scale + camera angle; near plate tracked through the pull
    seed = max(0, lo - 3)
    setup_h = float(np.nanmedian(boxes[s0 + max(0, lo - 24): s0 + lo + 1, 3] - boxes[s0 + max(0, lo - 24): s0 + lo + 1, 1]))

    def plates_at(f):
        return [refine_plate(fr[f], p) or p for p in find_plates(fr[f], kw[f, L_WRI], kw[f, R_WRI], body_h, setup_h)]
    plates = plates_at(seed)
    if not plates:
        return None
    samples = [plates_at(f) for f in range(max(0, lo - 24), lo, 3)]
    from .lifts import scale_from_body
    body_scale = scale_from_body(kw)
    scale_ok = True
    for i, pl in enumerate(plates):
        fits = [s[i] for s in [plates] + samples if len(s) == len(plates) and s[i]["side"] == pl["side"]]
        axes, diameter, refined = plate_diameter(fits, body_scale)
        pl["axes"] = axes or pl["axes"]
        pl["diameter_px"] = diameter or max(pl["axes"])
        # an outline held in some setup frame (before the scale band, which is the near plate's: the far plate sits
        # further back and reads smaller)
        pl["refined"] = any("fit_inliers" in q for q in fits)
        scale_ok = scale_ok and (refined or i > 0)  # the far plate only refines the scale; a coarse one was always used
    near = plates[0]
    scale_near = near["diameter_px"] / PLATE_CM
    far = plates[1] if len(plates) > 1 else None
    if far is not None:
        scale_far = far["diameter_px"] / PLATE_CM
        px_per_cm = 2 / (1 / scale_near + 1 / scale_far)
        span_cm = np.linalg.norm(near["centre"] - far["centre"]) / px_per_cm
        # up to three estimates of how far the camera sits off side-on: bar span (both plates refined: a coarse centre
        # can be floor clutter), and each refined plate's ellipse
        span_off = [float(np.degrees(np.arcsin(np.clip(span_cm / PLATE_SPAN_CM, 0, 1))))] if near["refined"] and far["refined"] else []
        off_est = span_off + ellipse_angles(plates)
        scale_method = "harmonic mean of near and far plates"
    else:
        span_cm = None
        off_est = ellipse_angles(plates)
    if not off_est:
        # no plate outline held: the coarse search's ratio grid (0.5-1.0) is not an angle, so the body's is used
        from .lifts import off_side_pose
        pose_off = off_side_pose(kw)
        off_est = [pose_off] if pose_off is not None else []
    off_side = float(np.median(off_est)) if off_est else 0.0
    foreshort = 1 / np.cos(np.radians(off_side))
    plate_raw, plate_score = track_plate(fr, seed, near)
    plate_ref = to_ref(plate_raw, Ms)
    # the wrists rise a few cm while the lifter takes the slack out of the bar; the bar leaves the floor with the plate
    plate_lo = plate_liftoff(plate_ref[: ev["second_ext"], 1], lo, near["axes"][0])
    if plate_lo is not None and plate_lo > lo:
        phases, ev = segment_snatch(up(bar[:, 1]), knee_ang, fps, elbow=elbow, catch_mask=rack, liftoff=plate_lo)
        lo = ev["liftoff"]
        knee_pass = next((f for f in range(lo, ev["peak"]) if bar[f, 1] <= knee[f, 1]), None)
        if knee_pass is not None and not ev["double_knee_bend"]:
            phases, ev = segment_snatch(up(bar[:, 1]), knee_ang, fps, knee_pass=knee_pass, elbow=elbow, catch_mask=rack,
                                        liftoff=plate_lo)
    shin = np.nanmean([np.linalg.norm(kw[:, a] - kw[:, b], axis=1) for a, b in ((L_KNEE, L_ANK), (R_KNEE, R_ANK))], axis=0)
    if not_a_lift(near, plate_ref[:, 1], bar[:, 1], shin, lo, ev["peak"]):
        return False
    depth_ratio = None
    if far is None:
        # side-on, only the near plate is visible and it sits ~75 cm closer to the camera than the lifter.
        # The bar is rigid, so wrist-midpoint px rise / near-plate px rise over the pull = scale at the bar centre / near scale.
        pull_end = min(ev["second_ext"], len(fr) - 1)
        rise = -(plate_ref[pull_end, 1] - plate_ref[lo, 1]) if np.isfinite(plate_ref[pull_end, 1]) else np.nanmax(plate_ref[lo:pull_end + 1, 1]) - np.nanmin(plate_ref[lo:pull_end + 1, 1])
        depth_ratio = rise_ratio(plate_ref[lo: pull_end + 1, 1], bar[lo: pull_end + 1, 1]) if rise > 0.5 * near["axes"][0] else None
        px_per_cm, scale_method = near_bar_scale(scale_near, depth_ratio, body_scale)
    px_per_cm, scale_method, scale_ok = check_scale(px_per_cm, scale_method, scale_ok, scale_near, body_scale)

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
    # feet: median over 0.3 s before lift-off (planted) vs 0.3 s from the catch (landed). Single frames moved with
    # the encoding: the catch frame (elbow lockout) lands +-2 frames while the feet are still travelling.
    w = max(1, int(0.3 * fps))
    feet_from = np.median(ank[max(0, lo - w): lo + 1], axis=0)
    feet_to = np.median(ank[ev["caught"]: ev["caught"] + w + 1], axis=0)
    vals["jump_forward"] = cm(fwd * (feet_to[0] - feet_from[0])) * foreshort
    detail["jump_forward"] = {"frame": ev["caught"], "from_frame": lo, "from": feet_from, "to": feet_to}
    if kind == "clean":
        from .lifts import clean_pull_values
        cv_, cd_ = clean_pull_values(ksm, hip_ang, knee_ang, lo, ev, fps)
        vals.update(cv_)
        detail.update(cd_)

    knee_h = mid(ksm, L_KNEE, R_KNEE)
    depth_end = min(ev["recovered"], ev["hold_end"] - 1)
    depth_f, depth_px, catch_kind = catch_depth(-hip[:, 1], -knee_h[:, 1], knee_ang, ev["caught"], depth_end)
    vals_depth = cm(depth_px)
    peak_h = cm(bar[lo, 1] - bar[ev["peak"], 1])
    drop = cm(bar[ev["caught"], 1] - bar[ev["peak"], 1])
    turnover_s = (ev["caught"] - ev["second_ext"]) / fps
    standing_h = cm(np.nanmax(ank[:, 1] - mv.head_y(ksm))) + 12.0  # the head stand-in sits ~12 cm below the crown

    # plate vs wrist agreement over the pull (bar proxy validation)
    pull = np.arange(lo, min(ev["second_ext"], len(fr) - 1) + 1)
    okp = np.isfinite(plate_ref[pull, 1])
    agree = None
    if okp.sum() > 5:
        pv = np.gradient(lowpass(plate_ref[pull, 1], fps))[okp]
        wv = np.gradient(bar[pull, 1])[okp]
        agree = float(np.corrcoef(pv, wv)[0, 1])

    made = bool(ev["recovered"] < len(fr) - 1 and knee_ang[ev["recovered"]: ev["recovered"] + int(0.5 * fps) + 1].max() > 150)

    # 4. outcome first (26 section 8.1): which way the bar left a missed lift, and the missed-behind causes (8.2)
    midfoot = (mid(ksm, L_BIGTOE, R_BIGTOE) + mid(ksm, L_HEEL, R_HEEL)) / 2
    f_end = int(min(max(ev["caught"], ev["hold_end"] - 1), len(fr) - 1))
    k_back = max(1, int(0.2 * fps))
    bar_vs_mid = cm(fwd * (bar[f_end, 0] - midfoot[f_end, 0])) * foreshort
    bar_vx = cm(fwd * (bar[f_end, 0] - bar[max(0, f_end - k_back), 0])) * foreshort
    if kind == "clean":
        # made = stood up with the bar still in the rack (a power clean barely rides down, so no 90% stand-up rise)
        made = bool((rack[ev["caught"]:] & (knee_ang[ev["caught"]:] > 155) & (hip_ang[ev["caught"]:] > 155)).any())
    # a miss needs the bar to have left the lifter inside the window; a clip that ends mid-hold is not a miss
    released = ev["hold_end"] < len(fr)
    # part of the rep is not in the clip: it starts after the setup, or ends with the bar still held short of a make
    cut_off = bool((s0 == 0 and lo < int(0.3 * fps)) or (s0 + len(fr) >= n and not released and not made))
    outcome_kind = outcome.classify(made, bar_vs_mid, bar_vx) if made or released else "unknown"
    lean = lambda f: 90.0 - float(trunk[f])
    ahead = lambda f: fwd * (sho[f, 0] - hip[f, 0]) > 0
    vx = np.gradient(fwd * bar[:, 0]) * fps / px_per_cm * foreshort
    swing_f = contact + int(np.argmax(xs))
    miss = {"bar_vs_midfoot": bar_vs_mid, "bar_vx": bar_vx, "frame": f_end,
            "fwd_excursion": vals["bar_forward_off_hips"],
            "pvx_minus": float(np.min(vx[swing_f: min(len(fr), ev["caught"] + int(0.3 * fps)) + 1])),
            "hip_past_ankle": cm(fwd * (hip[ev["second_ext"], 0] - ank[ev["second_ext"], 0])) * foreshort,
            "trunk_back": 0.0 if ahead(ev["peak"]) else lean(ev["peak"]),
            "foot_dx": vals["jump_forward"],
            "trunk_fwd_catch": lean(ev["caught"]) if ahead(ev["caught"]) else 0.0,
            "max_hip": float(np.max(hip_ang[lo: ev["peak"] + 1])),
            "bar_behind": -cm(fwd * (bar[ev["peak"], 0] - sho[ev["peak"], 0])) * foreshort,
            "midfoot": midfoot[f_end], "bar": bar[f_end]}
    if outcome_kind == "missed_behind":
        # the forward step after a miss behind is the bail, not a jump forward
        vals["jump_forward"] = None
    g = lambda f: s0 + int(f)
    raw = lambda p, f: from_ref(p, Ms[f])
    path = [{"frame": g(f)} | normalise(raw(bar[f], f), W, H) for f in range(phases[0]["startFrame"], len(fr))
            if f <= ev["recovered"]]

    sp = speed.peak_up_speed(bar[:, 1], fps, px_per_cm, ev["liftoff"], ev["caught"])
    # the bar is the wrist midpoint: a snatch whose "peak" never clears the shoulders lost the hands overhead, and
    # everything measured from it reads normal (IMG_7428 called clean with the bar peaking at chest height)
    bar_lost = bool(kind == "snatch" and bar[ev["peak"], 1] > sho[ev["peak"], 1])
    info = {
        "bar_lost": bar_lost,
        "rep_no": rep_no, "start": g(phases[0]["startFrame"]), "end": g(ev["recovered"]), "made": made,
        "phases": [p | {"startFrame": g(p["startFrame"]), "endFrame": g(p["endFrame"])} for p in phases],
        "keys": {kk: g(v) for kk, v in key_frames(ev).items()},
        "events": {kk: (g(v) if not isinstance(v, bool) else v) for kk, v in ev.items()},
        "path": path, "values": vals, "detail": detail, "px_per_cm": px_per_cm, "off_side_deg": off_side, "off_side_estimates": off_est,
        "span_cm": span_cm, "plates": plates, "scale_method": scale_method, "scale_ok": scale_ok, "depth_ratio": depth_ratio,
        "catch_depth": vals_depth, "catch_depth_frame": g(depth_f), "catch_kind": catch_kind,
        "catch_knee_min": float(np.min(knee_ang[ev["caught"]: max(ev["caught"], depth_end) + 1])), "plate_tracked": int(np.isfinite(plate_raw[:, 0]).sum()),
        "plate_lost_at": g(int(np.where(np.isfinite(plate_raw[:, 0]))[0].max())), "plate_wrist_corr": agree,
        "peak_h": peak_h, "drop": drop, "turnover_s": turnover_s, "standing_h": standing_h,
        "bar_speed": (sp[0], g(sp[1])) if sp else None,
        "cut_off": cut_off, "hands_overlap": bool(hands_overlap), "stab_inliers_min": int(min(inliers)) if inliers else 0, "fwd": fwd,
        "severity": max(rules.fired(vals).values(), default=0.0), "outcome": outcome_kind, "miss": miss,
        "_ref": {"s0": s0, "Ms": Ms, "ksm": ksm, "bar": bar, "plate_ref": plate_ref, "knee_ang": knee_ang,
                 "hip_ang": hip_ang, "trunk": trunk, "hip": hip, "sho": sho, "ank": ank, "frames": fr,
                 "kraw": kw, "elbow": elbow, "ks": ks[s0:e0], "contact": contact, "knee_pass": knee_pass, "lo": lo},
    }
    return info


def not_a_lift(near, plate_y, bar_y, shin, liftoff, peak):
    """The hands went overhead but the plate stayed down, the person walked up to the camera, or the bar never rose
    from lift-off (1fec9d79: the lifter at the phone, keypoint scores 0.04-0.16, peak = lift-off). The plate test
    only counts with a near plate whose outline held in a setup frame (refined): a plate only the coarse search found
    can be floor clutter that never moves (e4fe6d08, filmed ~70 deg off side-on with the real plates near edge-on:
    0 of 3 setup fits refined, rose 0.17 of the hands). IMG_0074's cap fix had 4 of 9 refined and still reads as no lift."""
    return bool((near.get("refined") and plate_follows_bar(plate_y, bar_y, liftoff, peak, near["diameter_px"]) is False)
                or approaches_camera(shin, liftoff, peak) or peak <= liftoff)


def ellipse_angles(plates):
    """Camera angle off side-on (degrees) from each plate with at least one refined fit: minor/major = cos. A plate
    only the coarse search found has its ratio from find_plates' 0.5-1.0 grid, so its 60 or 0 degrees is a grid step
    (or a person's body taken for a plate), not a measurement."""
    return [float(np.degrees(np.arccos(min(1.0, p["axes"][1] / p["axes"][0])))) for p in plates if p.get("refined")]


def plate_diameter(fits, body_scale=None):
    """(axes, diameter px, refined) of one plate from its fits over the setup frames; (None, None, False) when none
    is plausible. A 45 cm plate is SCALE_VS_BODY times the lifter's own scale, so a fit outside that band (the coarse
    search returning a patch of floor ~2.5x the plate when refining failed) is dropped first.
    The axes (for the camera angle) are the median of the rest, as single-frame fits wander ~7% on static frames.
    The diameter (the scale) comes from the refined fits only, whose outline held: on a camo or speckled plate the
    coarse disc search reads 25-40% large. Their median, after dropping any more than PLATE_FIT_SPREAD off it, of the
    larger axis: a refined fit loses extent to the floor or a shadow, so the shorter axis is the damaged one."""
    if body_scale:
        lo, hi = (PLATE_CM * body_scale * x for x in SCALE_VS_BODY)
        fits = [q for q in fits if lo <= max(q["axes"]) <= hi]
    if not fits:
        return None, None, False
    axes = tuple(float(v) for v in np.median([q["axes"] for q in fits], axis=0))
    refined = [q for q in fits if "fit_inliers" in q]
    if not refined:
        return axes, max(axes), False
    d = np.array([max(q["axes"]) for q in refined])
    keep = np.abs(d / np.median(d) - 1) <= PLATE_FIT_SPREAD
    return axes, float(np.median(d[keep])), True


def near_bar_scale(scale_near, depth_ratio, body_scale):
    """(px per cm at the bar centre, method) from the near plate alone. The plate sits nearer the camera than the bar
    centre; the plate's rise against the wrists' (depth_ratio) says by how much, and without it the lifter's body,
    which is at the bar's depth (21B27BAF: the plate itself rose 132-138 cm to the peak; near plate alone read 111-116,
    with the body's depth 136-143)."""
    if depth_ratio is not None and 0.2 < depth_ratio <= 1.2:
        return scale_near * depth_ratio, f"near plate x parallax depth ratio {depth_ratio:.2f}"
    if body_scale:
        return (scale_near * float(np.clip(body_scale / scale_near, *BODY_DEPTH_RATIO)),
                "near plate only (no parallax), depth from the lifter's body")
    return scale_near, "near plate only (no parallax: plate rise too small or lost)"


def check_scale(px_per_cm, method, plate_ok, scale_near, body_scale):
    """(px per cm, method, ok). The lifter's size is the cross-check: a plate scale far from the body's (a floor patch
    fitted as the plate) is not used, the body's is. Either that or a plate no refined fit held marks the cue low
    confidence; a plausible coarse plate is still a better scale than the body, which a cut-off lifter shrinks."""
    if body_scale and not SCALE_VS_BODY[0] <= scale_near / body_scale <= SCALE_VS_BODY[1]:
        return body_scale, "body segments (plate fit unreliable)", False
    return px_per_cm, method, plate_ok


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
            meas.append({"id": fid, "label": LABELS[fid], "value": 0, "unit": "cm", "frame": r["start"], "status": "not_seen",
                         "note": "not judged: the step forward was the bail" if r["outcome"] == "missed_behind" and fid == "jump_forward"
                         else "could not measure"})
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
        {"id": "catch_depth", "label": "Catch depth", "value": round(abs(r["catch_depth"]), 1), "unit": "cm",
         "frame": r["catch_depth_frame"], "status": "normal",
         "note": f"{r['catch_kind']} catch, hip {'below' if r['catch_depth'] > 0 else 'above'} knee, knee {r['catch_knee_min']:.0f}°"},
        {"id": "turnover_time", "label": "Extension to catch", "value": round(r["turnover_s"], 2), "unit": "s",
         "frame": r["events"]["second_ext"], "status": "normal", "note": "± 1 frame at 30 fps"},
        speed.measurement(r),
    ]
    if r["outcome"] == "missed_behind":
        return miss_behind_card(r, meas, W, H)
    if r["outcome"] == "missed_forward":
        # earliest window that fired is the cause (26 section 3), not the most severe
        f_ = rules.gate(set(fired))
        cue_id = min(f_, key=lambda k: rules.RULES[k]["order"]) if f_ else None
        if cue_id is None:
            return meas, miss_card(r, "missed_forward", meas, W, H)
    if cue_id is None:
        return meas, None

    sev = fired[cue_id]
    seen = sum(1 for x in reps if cue_id in rules.fired(x["values"]))
    conf = rules.rep_confidence(rules.confidence(cue_id, sev, off), seen, len(reps))
    if not r["scale_ok"]:
        # sized from the body (no plate outline held, common in real gym footage): never "clear", but a fault well
        # past its threshold is still worth checking. Holding every such cue back left 5 of 5 lifts on 18 Oct with none.
        conf = "worth_checking" if conf != "low" and sev >= 1.5 else "low"
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
        frm, to = raw(d["from"], f), raw(d["to"], f)
        caption = f"feet · {vals[cue_id]:.0f} cm fwd"
    conf_text = f"Seen on {seen} of {len(reps)} reps"
    if off > 20:
        conf_text += f", filmed ~{off:.0f}° off side-on: film from the side to confirm"
    if not r["scale_ok"]:
        conf_text += ", sized from your body because the plate could not be measured"
    why = rules.why_sentence(cue_id, vals, det[cue_id])
    if r["outcome"] == "missed_forward":
        meas.append({"id": "outcome", "label": "Missed forward", "value": round(r["miss"]["bar_vs_midfoot"], 1), "unit": "cm",
                     "frame": s0 + r["miss"]["frame"], "status": "normal", "note": "bar vs mid-foot when it left you (+ = in front)"})
        why = f"Missed forward. The bar left you {r['miss']['bar_vs_midfoot']:.0f} cm in front of mid-foot. Earliest thing I can see: {why[0].lower()}{why[1:]}"
    cue = {"faultId": cue_id, "text": rules.CUES[cue_id], "why": why,
           "confidence": conf, "confidenceText": conf_text,
           "evidence": {"rep": r["index"], "frame": s0 + f, "from": normalise(frm, W, H), "to": normalise(to, W, H),
                        "value": round(vals[cue_id], 1), "unit": "cm", "caption": caption}}
    return meas, cue


OUTCOMES = {"missed_forward", "missed_behind", "missed", "jerk_forward", "jerk_back", "could_not_stand"}


def withhold(cue, r, meas):
    """(cue, noCueReason). The owner's rule (42 Q4): always show the path, phases and timing, cue only when confident.
    A low-confidence cue, or any cue on a rep the clip cut off, is held back with the reason, and the rows it rested
    on stop claiming to be the cue (off side-on, the horizontal ones are not judged at all)."""
    if r.get("bar_lost"):
        for m in meas:
            if m["status"] == "cue":
                m["status"] = "normal"
        return None, {"code": "bar_lost"}
    if cue is None or (cue["confidence"] != "low" and not r.get("cut_off")):
        return cue, None
    fid = cue["faultId"]
    off = r.get("off_side_deg")
    horizontal = lambda i: i == "outcome" or i in OUTCOMES or rules.RULES.get(i, {}).get("horizontal", False)
    if r.get("cut_off"):
        reason = {"code": "rep_cut_off"}
    elif off is not None and off > 20 and horizontal(fid):
        reason = {"code": "off_side_on", "offSideDeg": int(round(off))}
    elif fid in OUTCOMES:
        reason = {"code": "unclear_miss"}
    elif not r.get("scale_ok", True):
        reason = {"code": "plate_hidden"}
    else:
        reason = {"code": "low_confidence"}
    for m in meas:
        if m["status"] == "cue":
            m["status"] = "follows" if m["id"] in rules.RULES else "normal"
        if reason["code"] == "off_side_on" and horizontal(m["id"]) and m["status"] != "not_seen":
            m["status"], m["note"] = "not_seen", f"not judged: filmed ~{off:.0f}° off side-on"
    return None, reason


def miss_card(r, kind, meas, W, H, cause=None, sev=0.0):
    """The cue card for a missed rep with no measured cause, or a missed-behind cause (26 sections 8.2, 8.4, 8.5)."""
    m = r["miss"]
    Ms, s0, f = r["_ref"]["Ms"], r["_ref"]["s0"], m["frame"]
    raw = lambda p: from_ref(p, Ms[f])
    off = r["off_side_deg"]
    if kind == "missed_behind":
        hips_text = (f"your hips drove {m['hip_past_ankle']:.0f} cm past your ankles at the top" if m["hip_past_ankle"] > 6
                     else f"you leaned {m['trunk_back']:.0f} deg back at the top of the pull" if m["trunk_back"] > 10
                     else f"your feet jumped {abs(m['foot_dx'] or 0):.0f} cm back")
        why = outcome.behind_copy(m["bar_vs_midfoot"], cause, {"fwd": m["fwd_excursion"], "hips_text": hips_text,
                                                               "trunk": m["trunk_fwd_catch"], "behind": m["bar_behind"]})
        text = rules.CUES[outcome.CAUSE_CUE[cause]] if cause in outcome.CAUSE_CUE else "Film one more rep from the side."
    else:
        why = (f"Missed forward. The bar left you {m['bar_vs_midfoot']:.0f} cm in front of mid-foot. I can't tell why from "
               "this clip: nothing in the pull was outside its window. Film one more rep, or a lighter make, and I'll compare.")
        text = "Film one more rep from the side."
    # one rep: the outcome is visible, a cause only counts at 1.5x its band (26 section 8.4)
    conf = "worth_checking" if cause in outcome.CAUSE_CUE and sev >= 1.5 and (off is None or off <= 20) else "low"
    conf_text = "One missed rep" + (f", filmed ~{off:.0f}° off side-on: film from the side to confirm" if off and off > 20 else "")
    meas.append({"id": "outcome", "label": "Missed " + ("behind" if kind == "missed_behind" else "forward"),
                 "value": round(m["bar_vs_midfoot"], 1), "unit": "cm", "frame": s0 + f, "status": "cue",
                 "note": "bar vs mid-foot when it left you (+ = in front)"})
    return {"faultId": kind, "text": text, "why": why, "confidence": conf, "confidenceText": conf_text,
            "evidence": {"rep": r["index"], "frame": s0 + f, "from": normalise(raw(m["midfoot"]), W, H),
                         "to": normalise(raw(m["bar"]), W, H), "value": round(m["bar_vs_midfoot"], 1), "unit": "cm",
                         "caption": f"bar {abs(m['bar_vs_midfoot']):.0f} cm {'behind' if m['bar_vs_midfoot'] < 0 else 'in front of'} mid-foot"}}


def miss_behind_card(r, meas, W, H):
    m = r["miss"]
    cause, sev = outcome.behind_cause(m["fwd_excursion"], m["pvx_minus"], m["hip_past_ankle"], m["trunk_back"],
                                      m["foot_dx"], m["trunk_fwd_catch"], m["max_hip"], m["bar_behind"])
    return meas, miss_card(r, "missed_behind", meas, W, H, cause, sev)
