"""Parity of the on-device camera motion (modules/pose-coreml/ios/Stages/CameraMotion.swift) against track.py.

Build the harness (macOS):
    cd modules/pose-coreml && swiftc -O -o /tmp/camera-path ios/PoseCoreMLCore.swift ios/Stages/*.swift harness/camera-path/*.swift

Then, per clip, with its pose cache (.pose.pkl) and a trace recorded by the current code:
    uv run python scripts/camera_parity.py job CLIP POSE_PKL TRACE MOVEMENT --out job.json
    /tmp/camera-path CLIP --job job.json --out result.json [--backend klt|vision-translation|vision-homography]
    uv run python scripts/camera_parity.py compare TRACE result.json MOVEMENT

`compare` prints the camera-path and per-window stabilise differences in px, then replays the pipeline with the
device affines written into the trace and diffs cue, measurements and phases against the trace's own replay.
`reference DUMP_DIR job.json` runs track.py's own OpenCV calls on frames the harness decoded (--dump-gray), which
is what an OpenCV-in-Swift build would give: the decode's share of the difference."""
import argparse
import json
import os
import pickle
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from catchline_cv import movement as mv, pipeline, trace  # noqa: E402
from catchline_cv.pose import L_WRI, R_WRI  # noqa: E402
from catchline_cv.track import IDENT, foreground_mask  # noqa: E402

NAN = 1e30


def lifter_key(tr, movement):
    hanging = mv.FAMILY.get(movement) == "hanging"
    return f"False:{hanging}"


def job(a):
    tr = trace.loads(open(a.trace, "rb").read())
    people = pickle.load(open(a.pose, "rb"))["people"]
    k, ks, boxes = trace.dec(tr["calls"]["select_lifter"][lifter_key(tr, a.movement)][0])
    windows = []
    for key in tr["calls"].get("stabilise", {}):
        s0, n = (int(v) for v in key.split(":"))
        body_h = float(np.nanmedian(boxes[s0:s0 + n, 3] - boxes[s0:s0 + n, 1]))
        wr = np.nan_to_num(k[s0:s0 + n][:, [L_WRI, R_WRI]].reshape(n, 4), nan=NAN)
        windows.append({"s0": s0, "n": n, "scale": 0.12 * body_h, "wristBand": a.movement in ("snatch", "clean", "jerk"),
                        "wrists": wr.tolist()})
    out = {"inferH": pipeline.INFER_H, "smallH": 360, "windows": windows,
           "people": [[[float(v) for v in p[0]] for p in ps] for ps in people]}
    json.dump(out, open(a.out, "w"))
    print(f"job: {len(people)} frames, {len(windows)} windows -> {a.out}")


def corners_px(M, w, h):
    pts = np.array([[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2]], float)
    return pts @ np.asarray(M)[:, :2].T + np.asarray(M)[:, 2]


def path_diff(ref, dev, w, h):
    n = min(len(ref), len(dev))
    d = np.array([np.abs(corners_px(ref[f], w, h) - corners_px(dev[f], w, h)).max() for f in range(n)])
    return d


def summarise(analysis):
    cue = analysis.get("cue") or {}
    out = {"failure": (analysis.get("failure") or {}).get("code"), "cue": cue.get("id") or cue.get("metricId"),
           "pxPerCm": analysis.get("pxPerCm"), "bestRep": analysis.get("bestRepIndex"),
           "measurements": {m["id"]: (m.get("value"), m.get("status")) for m in analysis.get("measurements", [])},
           "phases": [[(p["name"], p["startFrame"], p["endFrame"]) for p in r.get("phases", [])] for r in analysis.get("reps", [])],
           "detected": (analysis.get("detectedMovement") or {}).get("movement")}
    return out


def replay(tr, movement, out):
    os.makedirs(out + "/debug", exist_ok=True)
    with trace.replaying(tr) as rp:
        res = pipeline.run("no-video", f"{out}/analysis.json", f"{out}/kf", "kf", f"{out}/debug", f"{out}/cache",
                           "parity", movement)
    return json.loads(json.dumps(res if isinstance(res, dict) else res[0])), rp.misses


def record(a):
    """A trace of CLIP by the current code, with the pose read from CACHE_DIR/<clip>.pose.pkl."""
    out = a.out + ".work"
    os.makedirs(out + "/debug", exist_ok=True)
    with trace.recording() as rec:
        res = pipeline.run(a.clip, f"{out}/analysis.json", f"{out}/kf", "kf", f"{out}/debug", a.cache, "parity", a.movement)
    analysis = res if isinstance(res, dict) else res[0]
    open(a.out, "wb").write(trace.dumps(rec.trace(analysis)))
    print(f"record: {len(rec.calls.get('stabilise', {}))} windows, cue {(analysis.get('cue') or {}).get('id')} -> {a.out}")


def compare(a):
    tr = trace.loads(open(a.trace, "rb").read())
    res = json.load(open(a.result))
    H = pipeline.INFER_H
    W = int(round(tr["meta"]["width"] * H / tr["meta"]["height"] / 2)) * 2
    pkey = next(iter(tr["calls"]["camera_path"]))
    ref_path = trace.dec(tr["calls"]["camera_path"][pkey][0])
    dev_path = [np.array(m).reshape(2, 3) for m in res["cameraPath"]]
    d = path_diff(ref_path, dev_path, W, H)
    motion = np.array([np.abs(corners_px(M, W, H) - corners_px(IDENT, W, H)).max() for M in ref_path])
    report = {"clip": os.path.basename(a.trace).split(".trace")[0], "backend": res["backend"], "frames": len(ref_path),
              "camera_motion_px": {"median": float(np.median(motion)), "max": float(motion.max())},
              "path_diff_px": {"median": float(np.median(d)), "p95": float(np.percentile(d, 95)), "max": float(d.max())},
              "windows": {}, "timing": res.get("timing")}
    tr2 = json.loads(json.dumps(tr))
    tr2["calls"]["camera_path"][pkey] = [trace.enc([np.array(m).reshape(2, 3) for m in res["cameraPath"]])]
    for key, outs in tr["calls"].get("stabilise", {}).items():
        if key not in res["stabilise"]:
            continue
        Ms, inl = trace.dec(outs[0])
        dMs = [np.array(m).reshape(2, 3) for m in res["stabilise"][key]["Ms"]]
        dd = path_diff(Ms, dMs, W, H)
        report["windows"][key] = {"diff_px": {"median": float(np.median(dd)), "max": float(dd.max())},
                                  "inliers": [int(np.median(inl)) if inl else None, int(np.median(res["stabilise"][key]["inliers"])) if res["stabilise"][key]["inliers"] else None]}
        tr2["calls"]["stabilise"][key] = [trace.enc((dMs, [int(v) for v in res["stabilise"][key]["inliers"]]))]
    base, m0 = replay(tr, a.movement, a.out + "/ref")
    dev, m1 = replay(tr2, a.movement, a.out + "/dev")
    sb, sd = summarise(base), summarise(dev)
    diff = {}
    for k in ("failure", "cue", "bestRep", "detected"):
        if sb[k] != sd[k]:
            diff[k] = [sb[k], sd[k]]
    if sb["pxPerCm"] and sd["pxPerCm"]:
        diff["pxPerCm_rel"] = round(sd["pxPerCm"] / sb["pxPerCm"] - 1, 4)
    md = {}
    for k, (v, st) in sb["measurements"].items():
        v2, st2 = sd["measurements"].get(k, (None, None))
        if v is not None and v2 is not None and (abs(v - v2) > 1e-9 or st != st2):
            md[k] = [v, v2, st, st2]
    diff["measurements"] = md
    pd = []
    for r0, r1 in zip(sb["phases"], sd["phases"]):
        for p0, p1 in zip(r0, r1):
            if p0 != p1:
                pd.append([p0, p1])
    diff["phases"] = pd
    report["same_cue"] = sb["cue"] == sd["cue"] and sb["failure"] == sd["failure"]
    report["downstream"] = diff
    report["misses"] = [len(m0), len(m1)]
    print(json.dumps(report, indent=1))
    if a.report:
        json.dump(report, open(a.report, "w"), indent=1)


def klt_step(prev, cur, mask, max_corners, min_dist, win, levels, thresh):
    p0 = cv2.goodFeaturesToTrack(prev, max_corners, 0.01, min_dist, mask=mask)
    if p0 is None or len(p0) < 12:
        return None
    p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, p0, None, winSize=(win, win), maxLevel=levels)
    ok = st.ravel() == 1
    if ok.sum() < 12:
        return None
    est, inl = cv2.estimateAffinePartial2D(p1[ok], p0[ok], method=cv2.RANSAC, ransacReprojThreshold=thresh)
    return (est, int(inl.sum())) if est is not None else None


def chain(steps):
    out, acc = [IDENT.copy()], np.eye(3)
    for M in steps:
        acc = acc @ np.vstack([M if M is not None else IDENT, [0, 0, 1]])
        out.append(acc[:2])
    return out


def reference(a):
    """track.py's own OpenCV calls on the frames the harness decoded: the OpenCV-in-Swift option."""
    jb = json.load(open(a.job))
    dims = json.load(open(os.path.join(a.dump, "dims.json")))
    sw, sh, n = dims["small"]
    small = np.fromfile(os.path.join(a.dump, "small.gray"), np.uint8).reshape(n, sh, sw)
    s = sh / jb["inferH"]
    steps = []
    for f in range(1, n):
        boxes = [np.asarray(b) * s for b in jb["people"][f - 1]] if f - 1 < len(jb["people"]) else []
        m = foreground_mask(small[f - 1].shape, boxes, None, 0)
        r = klt_step(small[f - 1], small[f], cv2.bitwise_not(m), 300, 6, 15, 2, 1.5)
        steps.append(r[0] if r else None)
    path = [[M[0, 0], M[0, 1], M[0, 2] / s, M[1, 0], M[1, 1], M[1, 2] / s] for M in chain(steps)]
    fw, fh, idx = dims["full"]
    full = {}
    if idx:
        raw = np.fromfile(os.path.join(a.dump, "full.gray"), np.uint8).reshape(len(idx), fh, fw)
        full = dict(zip(idx, raw))
    stab = {}
    for w in jb["windows"]:
        ms, inl = [], []
        for i in range(1, w["n"]):
            f0, f1 = w["s0"] + i - 1, w["s0"] + i
            if f0 not in full or f1 not in full:
                break
            wr = np.array(w["wrists"][i - 1], float)
            wr[wr > 1e29] = np.nan
            m = foreground_mask(full[f0].shape, jb["people"][f0], wr.reshape(2, 2) if w["wristBand"] else None, w["scale"])
            r = klt_step(full[f0], full[f1], cv2.bitwise_not(m), 600, 8, 21, 3, 2.0)
            ms.append(r[0] if r else None)
            if r:
                inl.append(r[1])
        stab[f"{w['s0']}:{w['n']}"] = {"Ms": [M.ravel().tolist() for M in chain(ms)], "inliers": inl}
    json.dump({"backend": "opencv-on-device-frames", "frames": n, "cameraPath": path, "stabilise": stab}, open(a.out, "w"))
    print(f"reference: {n} frames, {len(stab)} windows -> {a.out}")


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
p = sub.add_parser("job"); p.add_argument("clip"); p.add_argument("pose"); p.add_argument("trace"); p.add_argument("movement"); p.add_argument("--out", required=True)
p = sub.add_parser("record"); p.add_argument("clip"); p.add_argument("cache"); p.add_argument("movement"); p.add_argument("--out", required=True)
p = sub.add_parser("compare"); p.add_argument("trace"); p.add_argument("result"); p.add_argument("movement"); p.add_argument("--out", default="/tmp/camera-parity"); p.add_argument("--report")
p = sub.add_parser("reference"); p.add_argument("dump"); p.add_argument("job"); p.add_argument("--out", required=True)
a = ap.parse_args()
{"job": job, "record": record, "compare": compare, "reference": reference}[a.cmd](a)
