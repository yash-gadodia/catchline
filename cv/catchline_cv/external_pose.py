"""Body pose computed on the phone (modules/pose-coreml: the same YOLOX + RTMPose models as pose.run_pose, in Core ML)
turned back into run_pose's output, so the pipeline skips its own inference. The upload is '<clip_path>.pose.json':

    {"source": "rtmpose-coreml", "fps", "width", "height",
     "frames": [{"t", "people": [{"box": [x1, y1, x2, y2], "kp": [[x, y, score] | null] * 26}], "lifter"?}]}

in pixels of the upright frame at `height` px tall (1280, run_pose's INFER_H). Head points (0-4, 17) arrive as null:
the phone drops them as strip_head does here. The phone's `lifter` index is informational: the pipeline runs
select_lifter over everyone, exactly as for its own pose."""
import json

import numpy as np


def load(path):
    with open(path) as fh:
        return json.load(fh)


def person(p, s):
    k = np.full((26, 2), np.nan)
    sc = np.zeros(26)
    for j, v in enumerate(p["kp"]):
        if v is not None:
            k[j], sc[j] = (v[0] * s, v[1] * s), v[2]
    return np.asarray(p["box"], float) * s, k, sc


def to_people(pose, meta, infer_h):
    """(people, shape) as pose.run_pose returns them at infer_h: per video frame a list of (box, kpts[26,2],
    scores[26]). Frames line up by index when the phone sent one per video frame, else by round(t x fps)."""
    w = int(round(meta["width"] * infer_h / meta["height"] / 2)) * 2
    s = infer_h / pose["height"]
    src = pose["frames"]
    n = meta.get("frameCount") or len(src)
    idx = range(n) if len(src) == n else [min(n - 1, int(round(f["t"] * meta["fps"]))) for f in src]
    people = [[] for _ in range(n)]
    for i, f in zip(idx, src):
        people[i] = [person(p, s) for p in f["people"]]
    return people, (infer_h, w, 3)
