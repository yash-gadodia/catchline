"""Lifter keypoint parity between two catchline-harness pose runs over the same clips.

    harness pose <clip> --models <dir> --out A_<name>.trace.json.gz --pose-json A_<name>.pose.json 2> A_<name>.log
    python3 cv/scripts/pose_parity.py <dir> A B

Per clip: frames where both runs found a lifter (and where only one did), the distance between the two runs' lifter
keypoints (score >= 0.3 in A, head points excluded, px in the 1280 px frame) at p50 / p95 / max, and the harness's
pose-pass ms/frame (decode + upright + detect + pose + camera) for each run."""
import glob
import json
import math
import os
import re
import sys


def pct(a, q):
    a = sorted(a)
    return a[min(len(a) - 1, int(q * len(a)))] if a else float("nan")


def ms(path):
    m = re.search(r"pose pass ms/frame: decode (\d+)\s+upright (\d+)\s+detect (\d+)\s+pose (\d+).*camera (\d+)", open(path).read())
    return sum(map(int, m.groups())) if m else None


root, a, b = sys.argv[1:4]
everything = []
print("clip frames both only_a only_b p50px p95px maxpx ms_a ms_b")
for path in sorted(glob.glob(os.path.join(root, f"{a}_*.pose.json"))):
    name = os.path.basename(path)[len(a) + 1 : -len(".pose.json")]
    A, B = json.load(open(path)), json.load(open(os.path.join(root, f"{b}_{name}.pose.json")))
    err, both, only_a, only_b = [], 0, 0, 0
    for fa, fb in zip(A["frames"], B["frames"]):
        la, lb = fa.get("lifter"), fb.get("lifter")
        if la is None or lb is None:
            only_a += la is not None
            only_b += lb is not None
            continue
        both += 1
        for ka, kb in zip(fa["people"][la]["kp"], fb["people"][lb]["kp"]):
            if ka is not None and kb is not None and ka[2] >= 0.3:
                err.append(math.hypot(ka[0] - kb[0], ka[1] - kb[1]))
    everything += err
    print(name, len(A["frames"]), both, only_a, only_b, f"{pct(err, .5):.2f} {pct(err, .95):.2f} {max(err, default=0):.2f}",
          ms(os.path.join(root, f"{a}_{name}.log")), ms(os.path.join(root, f"{b}_{name}.log")))
print(f"all: {len(everything)} keypoints, p50 {pct(everything, .5):.2f} px, p95 {pct(everything, .95):.2f} px, p99 {pct(everything, .99):.2f} px")
