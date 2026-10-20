"""Compare a trace the phone (or the macOS harness) wrote with the server's trace of the same clip.

    uv run python scripts/trace_parity.py device.trace.json.gz tests/fixtures/traces/<clip>.trace.json.gz [--pose device.pose.json]

Per recorded call: the lifter (frames where both picked someone, keypoint distance p50 / p95 / max in inference px,
boxes), the camera path (translation and scale drift per frame), the stabilise windows, the plate fits and the plate
track. With --pose, the harness's pose JSON is run through the Python select_lifter (external_pose.to_people) and
compared with the Swift Lifter.swift output in the device trace: the same people in, so the pick must match frame for
frame. Then the device trace is replayed through the pipeline (trace.replaying) and the analysis compared with the
server trace's replay: the cue, phases and measurements must agree once every stage has landed."""
import argparse
import json
import os
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from catchline_cv import external_pose, pipeline, trace  # noqa: E402
from catchline_cv.lifter import select_lifter  # noqa: E402
from catchline_cv.pose import HEAD  # noqa: E402


def load(path):
    with open(path, "rb") as fh:
        return trace.loads(fh.read())


def first(tr, name):
    calls = tr["calls"].get(name, {})
    return {k: trace.dec(v[0]) for k, v in calls.items()}


def stats(d):
    d = d[np.isfinite(d)]
    if not len(d):
        return "no finite values"
    return f"p50 {np.percentile(d, 50):.2f}  p95 {np.percentile(d, 95):.2f}  max {d.max():.2f} px (n={len(d)})"


def compare_lifter(a, b, label):
    (ka, sa, ba), (kb, sb, bb) = a, b
    n = min(len(ka), len(kb))
    picked_a, picked_b = np.isfinite(ba[:n, 0]), np.isfinite(bb[:n, 0])
    both = picked_a & picked_b
    print(f"{label}: frames {len(ka)} vs {len(kb)}; picked {picked_a.sum()} vs {picked_b.sum()}, both {both.sum()}, "
          f"only first {(picked_a & ~picked_b).sum()}, only second {(~picked_a & picked_b).sum()}")
    body = [j for j in range(26) if j not in HEAD]
    d = np.linalg.norm(ka[:n][:, body] - kb[:n][:, body], axis=2)[both]
    print(f"  keypoints {stats(d.ravel())}")
    print(f"  boxes     {stats(np.abs(ba[:n] - bb[:n])[both].ravel())}")
    print(f"  scores    max |diff| {np.nanmax(np.abs(sa[:n] - sb[:n])[both]):.3f}")
    assert np.isnan(ka[:, list(HEAD)]).all(), "head points in the trace"


def compare_paths(a, b):
    n = min(len(a), len(b))
    a, b = np.array(a[:n]), np.array(b[:n])
    print(f"camera_path: {len(a)} vs {len(b)} frames; translation |diff| {stats(np.linalg.norm(a[:, :, 2] - b[:, :, 2], axis=1))}; "
          f"scale |diff| max {np.abs(a[:, 0, 0] - b[:, 0, 0]).max():.5f}")


def replay(tr, movement):
    out = tempfile.mkdtemp()
    os.makedirs(os.path.join(out, "debug"))
    with trace.replaying(tr) as rp:
        res = pipeline.run("no-video", os.path.join(out, "analysis.json"), os.path.join(out, "kf"), "kf",
                           os.path.join(out, "debug"), os.path.join(out, "cache"), "parity", movement)
    return json.loads(json.dumps(res if isinstance(res, dict) else res[0])), rp.misses


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("device")
    ap.add_argument("server")
    ap.add_argument("--pose", help="the harness --pose-json output, to check Lifter.swift against lifter.py")
    ap.add_argument("--movement", default="snatch")
    a = ap.parse_args()
    dev, srv = load(a.device), load(a.server)
    print("meta device", dev["meta"])
    print("meta server", srv["meta"])
    print("pose  device", dev["pose"], " server", srv["pose"])

    dl, sl = first(dev, "select_lifter"), first(srv, "select_lifter")
    for k in sl:
        if k in dl:
            compare_lifter(dl[k], sl[k], f"select_lifter[{k}] device vs server")
        else:
            print(f"select_lifter[{k}]: missing in the device trace")
    if a.pose:
        pose = external_pose.load(a.pose)
        people, _ = external_pose.to_people(pose, dev["meta"], pipeline.INFER_H)
        for k in dl:
            hanging = k.endswith(":True")
            compare_lifter(dl[k], select_lifter(people, hanging=hanging), f"Lifter.swift vs lifter.py on the same pose (hanging={hanging})")

    dp, sp = first(dev, "camera_path"), first(srv, "camera_path")
    for k in sp:
        if k in dp:
            compare_paths(dp[k], sp[k])
        else:
            print("camera_path: missing in the device trace")

    for name in ("frames", "stabilise", "find_plates", "refine_plate", "track_plate"):
        d, s = first(dev, name), first(srv, name)
        print(f"{name}: device keys {sorted(d)[:6]}{'...' if len(d) > 6 else ''}  server keys {sorted(s)[:6]}{'...' if len(s) > 6 else ''}")
        for k in s:
            if k not in d:
                continue
            if name == "stabilise":
                Ma, Mb = np.array(d[k][0]), np.array(s[k][0])
                print(f"  {k}: translation |diff| {stats(np.linalg.norm(Ma[:, :, 2] - Mb[:, :, 2], axis=1))}; inliers device {d[k][1][:5]} server {s[k][1][:5]}")
            elif name == "track_plate":
                ca, cb = d[k][0], s[k][0]
                print(f"  {k}: tracked device {np.isfinite(ca[:, 0]).sum()} server {np.isfinite(cb[:, 0]).sum()}; centre |diff| {stats(np.linalg.norm(ca - cb, axis=1))}")
            elif name == "find_plates":
                pa, pb = d[k], s[k]
                print(f"  frame {k}: device {[(p['side'], [round(float(v), 1) for v in p['centre']], [round(v, 1) for v in p['axes']]) for p in pa]} "
                      f"server {[(p['side'], [round(float(v), 1) for v in p['centre']], [round(v, 1) for v in p['axes']]) for p in pb]}")
            elif name == "refine_plate":
                pa, pb = d[k], s[k]
                print(f"  {k[:60]}...: device {pa and [round(float(v), 1) for v in pa['centre']]} server {pb and [round(float(v), 1) for v in pb['centre']]}")
            else:
                print(f"  {k}: device {d[k]} server {s[k]}")

    print("\nreplay of the device trace through the Python pipeline:")
    try:
        analysis, misses = replay(dev, a.movement)
    except trace.TraceMissing as e:
        print(f"  cannot replay yet: {e}")
        return
    ref, _ = replay(srv, a.movement)
    print(f"  misses: {misses}")
    for key in ("failure", "cue", "noCueReason", "pxPerCm", "bestRepIndex"):
        same = analysis.get(key) == ref.get(key)
        print(f"  {key}: {'same' if same else 'DIFFERS'}  device={json.dumps(analysis.get(key))[:120]}  server={json.dumps(ref.get(key))[:120]}")
    for ra, rb in zip(analysis.get("reps", []), ref.get("reps", [])):
        print(f"  rep {ra['index']}: phases device {[(p['name'], p['startFrame']) for p in ra['phases']]}")
        print(f"         phases server {[(p['name'], p['startFrame']) for p in rb['phases']]}")
    ma = {m["id"]: m["value"] for m in analysis.get("measurements", [])}
    mb = {m["id"]: m["value"] for m in ref.get("measurements", [])}
    for k in mb:
        print(f"  {k}: device {ma.get(k)} server {mb[k]}")


if __name__ == "__main__":
    main()
