import numpy as np

from .pose import L_WRI, R_WRI


def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    return inter / (area(a) + area(b) - inter + 1e-9)


def select_lifter(people):
    """Track one person through the clip: seed on the largest confident person box, follow by box IoU.
    The caller confirms it is the lifter by checking the wrists travel floor-to-overhead and meet the plate."""
    n = len(people)
    seed_f, seed_i, best = None, None, -1
    for f, ps in enumerate(people):
        for i, (b, k, s) in enumerate(ps):
            h = b[3] - b[1]
            score = h * s.mean()
            if score > best:
                best, seed_f, seed_i = score, f, i
    kpts = np.full((n, 26, 2), np.nan)
    scores = np.zeros((n, 26))
    boxes = np.full((n, 4), np.nan)
    if seed_f is None:
        return kpts, scores, boxes
    for direction in (range(seed_f, n), range(seed_f - 1, -1, -1)):
        prev = people[seed_f][seed_i][0]
        for f in direction:
            cands = [(iou(prev, b), b, k, s) for b, k, s in people[f]]
            if not cands:
                continue
            o, b, k, s = max(cands, key=lambda c: c[0])
            if o < 0.3:
                continue
            kpts[f], scores[f], boxes[f] = k, s, b
            prev = b
    return kpts, scores, boxes


def wrist_travel(kpts):
    w = (kpts[:, L_WRI, 1] + kpts[:, R_WRI, 1]) / 2
    return np.nanmax(w) - np.nanmin(w)
