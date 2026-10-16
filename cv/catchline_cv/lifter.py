import numpy as np

from .pose import L_HIP, L_SHO, L_WRI, R_HIP, R_SHO, R_WRI

BODY = list(range(5, 17))  # shoulders to ankles
MAX_SHIFT = 0.15  # median body-joint move per frame, in box heights; a kip swing moves ~0.03, a swap to another person ~0.3
WRIST_SHIFT = 0.1  # hands on a bar barely move; a spotter's hands sit ~0.35 box heights lower
HIP_SHIFT = 0.1  # the hips travel at most ~0.05 box heights a frame (a snatch drop, a kip swing)
LOST_BAR = 15  # frames with no hands on the bar before the track follows the body alone again (the dismount)


def iou(a, b):
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    return inter / (area(a) + area(b) - inter + 1e-9)


def shift(k0, k1, h):
    """Median distance the body joints moved between two poses, in box heights (inf when too few joints to say)."""
    d = np.linalg.norm(np.asarray(k1)[BODY] - np.asarray(k0)[BODY], axis=1)
    d = d[np.isfinite(d)]
    return float(np.median(d)) / h if len(d) >= 4 else np.inf


def hands_up(k):
    """Wrists clearly above the shoulders: hanging from a bar (or a barbell overhead)."""
    sho, hip = (k[L_SHO] + k[R_SHO]) / 2, (k[L_HIP] + k[R_HIP]) / 2
    wri = (k[L_WRI] + k[R_WRI]) / 2
    t = np.linalg.norm(sho - hip)
    return bool(np.isfinite(t) and np.isfinite(wri[1]) and wri[1] < sho[1] - 0.3 * t)


def top_wrist(k):
    w = k[[L_WRI, R_WRI]]
    return w[np.nanargmin(w[:, 1])]


def select_lifter(people, hanging=False):
    """Track one person through the clip: seed on the largest confident person box (for a bar movement, the largest
    with the hands up on the bar), then follow them frame to frame by box overlap, box size and how far the body
    joints moved. Another person whose box overlaps (a coach spotting at the hips) has their joints somewhere else, so
    a jump of more than MAX_SHIFT box heights per frame is a different person and the frame is left empty instead.
    The caller confirms it is the lifter by checking the wrists travel floor-to-overhead and meet the plate."""
    n = len(people)
    seed_f, seed_i, best = None, None, -1
    for pref in ((True, False) if hanging else (False,)):
        for f, ps in enumerate(people):
            for i, (b, k, s) in enumerate(ps):
                if pref and not hands_up(k):
                    continue
                score = (b[3] - b[1]) * s.mean()
                if score > best:
                    best, seed_f, seed_i = score, f, i
        if seed_f is not None:
            break
    kpts = np.full((n, 26, 2), np.nan)
    scores = np.zeros((n, 26))
    boxes = np.full((n, 4), np.nan)
    if seed_f is None:
        return kpts, scores, boxes
    for direction in (range(seed_f, n), range(seed_f - 1, -1, -1)):
        pb, pk, _ = people[seed_f][seed_i]
        # hanging: the hands stay on the bar while the body swings, and a spotter's hands are at the lifter's hips.
        # The far wrist is often misplaced, so one wrist on the bar is enough; the anchor is the last one seen there.
        bar = top_wrist(pk) if hanging and hands_up(pk) else None
        gap = 0
        for f in direction:
            gap += 1
            h = pb[3] - pb[1]
            g = min(gap, 3)
            cands = []
            for b, k, s in people[f]:
                o, sh = iou(pb, b), shift(pk, k, h)
                if o < 0.3 or sh > MAX_SHIFT * g:
                    continue
                hp = np.linalg.norm((k[L_HIP] + k[R_HIP]) / 2 - (pk[L_HIP] + pk[R_HIP]) / 2) / h
                if hp > HIP_SHIFT * g:
                    continue
                wb = None
                if bar is not None and gap <= LOST_BAR:
                    d = np.linalg.norm(k[[L_WRI, R_WRI]] - bar, axis=1)
                    if not np.nanmin(d, initial=np.inf) <= WRIST_SHIFT * g * h:
                        continue
                    wb = k[[L_WRI, R_WRI]][np.nanargmin(d)]
                    sh += np.nanmin(d) / h
                cands.append(((1 - o) + abs(np.log((b[3] - b[1]) / h)) + 4 * sh, b, k, s, wb))
            if not cands:
                continue
            _, b, k, s, wb = min(cands, key=lambda c: c[0])
            kpts[f], scores[f], boxes[f] = k, s, b
            pb, pk, gap = b, k, 0
            if hanging:
                bar = wb if wb is not None else (top_wrist(k) if hands_up(k) else None)
    return kpts, scores, boxes


def wrist_travel(kpts):
    w = (kpts[:, L_WRI, 1] + kpts[:, R_WRI, 1]) / 2
    return np.nanmax(w) - np.nanmin(w)
