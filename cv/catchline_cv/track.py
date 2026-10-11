import cv2
import numpy as np

from .geometry import apply_affine, invert_affine

IDENT = np.array([[1.0, 0, 0], [0, 1.0, 0]])


def _band_mask(shape, p, q, half_width, extend):
    """Mask (255) of a thick segment through p->q extended by `extend` x |pq| on both ends."""
    m = np.zeros(shape[:2], np.uint8)
    p, q = np.asarray(p, float), np.asarray(q, float)
    d = q - p
    a, b = p - extend * d, q + extend * d
    cv2.line(m, tuple(int(v) for v in a), tuple(int(v) for v in b), 255, int(2 * half_width))
    return m


def foreground_mask(shape, boxes, wrists, scale):
    m = np.zeros(shape[:2], np.uint8)
    for b in boxes:
        x1, y1, x2, y2 = b
        pw, ph = 0.15 * (x2 - x1), 0.08 * (y2 - y1)
        cv2.rectangle(m, (int(x1 - pw), int(y1 - ph)), (int(x2 + pw), int(y2 + ph)), 255, -1)
    if wrists is not None and np.isfinite(wrists).all():
        m |= _band_mask(shape, wrists[0], wrists[1], scale, 3.0)
    return m


def stabilise(frames, fg_masks):
    """Camera motion from background KLT. Returns per-frame 2x3 affine mapping frame f px -> frame 0 px."""
    to_ref = [IDENT.copy()]
    prev = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
    inliers = []
    for f in range(1, len(frames)):
        cur = cv2.cvtColor(frames[f], cv2.COLOR_BGR2GRAY)
        bg = cv2.bitwise_not(fg_masks[f - 1])
        p0 = cv2.goodFeaturesToTrack(prev, 600, 0.01, 8, mask=bg)
        M = IDENT.copy()
        if p0 is not None and len(p0) >= 12:
            p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, p0, None, winSize=(21, 21), maxLevel=3)
            ok = st.ravel() == 1
            if ok.sum() >= 12:
                est, inl = cv2.estimateAffinePartial2D(p1[ok], p0[ok], method=cv2.RANSAC, ransacReprojThreshold=2.0)
                if est is not None:
                    M = est
                    inliers.append(int(inl.sum()))
        # frame f -> frame f-1 -> ... -> 0
        A = np.vstack([to_ref[-1], [0, 0, 1]]) @ np.vstack([M, [0, 0, 1]])
        to_ref.append(A[:2])
        prev = cur
    return to_ref, inliers


def plate_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    dark = hsv[..., 2] < 75
    green = (hsv[..., 0] > 35) & (hsv[..., 0] < 90) & (hsv[..., 1] > 90) & (hsv[..., 2] > 40)
    m = ((dark | green) * 255).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)))
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))


def _ellipse_offsets(major, ratio, tilt=0.0):
    th = np.linspace(0, 2 * np.pi, 24, endpoint=False)
    r_in = np.repeat([0.15, 0.35, 0.55, 0.75, 0.9], len(th))
    th_in = np.tile(th, 5)
    th2 = np.linspace(0, 2 * np.pi, 36, endpoint=False)
    r_out = np.repeat([1.12, 1.25], len(th2))
    th_out = np.tile(th2, 2)
    a, b = major / 2 * ratio, major / 2
    def pts(r, t):
        x, y = r * a * np.cos(t), r * b * np.sin(t)
        c, s = np.cos(tilt), np.sin(tilt)
        return np.stack([c * x - s * y, s * x + c * y], -1)
    return pts(r_in, th_in), pts(r_out, th_out)


def _sample(mask, pts):
    H, W = mask.shape
    x = np.round(pts[..., 0]).astype(int)
    y = np.round(pts[..., 1]).astype(int)
    ok = (x >= 0) & (x < W) & (y >= 0) & (y < H)
    v = np.zeros(x.shape, float)
    v[ok] = mask[y[ok], x[ok]] > 0
    return v, ok


def ellipse_search(mask, centres, majors, ratios):
    """Best vertical-major ellipse over candidate centres/sizes. Score = fill inside - fill in an outer ring."""
    best = (-1.0, None)
    centres = np.asarray(centres, float)
    for M in majors:
        for q in ratios:
            ins, ring = _ellipse_offsets(M, q)
            vi, oki = _sample(mask, centres[:, None, :] + ins[None])
            vo, _ = _sample(mask, centres[:, None, :] + ring[None])
            score = vi.mean(1) - vo.mean(1) - 0.5 * (1 - oki.mean(1))
            j = int(np.argmax(score))
            if score[j] > best[0]:
                best = (float(score[j]), {"centre": centres[j].copy(), "axes": (float(M), float(M * q)), "score": float(score[j])})
    return best[1]


def find_plates(img, wrist_a, wrist_b, body_h):
    """Plates on the wrist line beyond either hand. Returns [near, far] dicts (near = larger), or fewer if not found."""
    m = plate_mask(img)
    wa, wb = np.asarray(wrist_a, float), np.asarray(wrist_b, float)
    d = wb - wa
    L = np.linalg.norm(d)
    u, nrm = d / L, np.array([-d[1], d[0]]) / L
    majors = np.linspace(0.12, 0.5, 20) * body_h
    ratios = np.linspace(0.5, 1.0, 6)
    out = []
    for side, ts in (("a", np.linspace(-3.0, -0.15, 50)), ("b", np.linspace(1.15, 4.0, 50))):
        cands = [wa + t * d + o * nrm * L for t in ts for o in np.linspace(-0.4, 0.4, 9)]
        p = ellipse_search(m, cands, majors, ratios)
        if p:
            g = np.linspace(-0.06, 0.06, 9) * p["axes"][0]
            M0, q0 = p["axes"][0], p["axes"][1] / p["axes"][0]
            p = ellipse_search(m, [p["centre"] + [dx, dy] for dx in g for dy in g],
                               M0 * np.linspace(0.92, 1.08, 9), np.clip(q0 + np.linspace(-0.1, 0.1, 11), 0.3, 1.0))
        if p and p["score"] > 0.5:
            p["side"] = side
            out.append(p)
    return sorted(out, key=lambda p: -p["axes"][0])


def track_plate(frames, start, plate, stop=None):
    """Re-detect the plate ellipse every frame near a constant-velocity prediction (blur keeps the dark disc).
    Returns centres (n,2) and scores, NaN where lost (score low or disc leaves the frame)."""
    n = len(frames) if stop is None else stop
    centres = np.full((len(frames), 2), np.nan)
    scores = np.full(len(frames), np.nan)
    M0, m0 = plate["axes"]
    c, v = plate["centre"].astype(float), np.zeros(2)
    centres[start], scores[start] = c, plate["score"]
    for f in range(start + 1, n):
        pred = c + v
        g = np.linspace(-0.3, 0.3, 13) * M0
        cands = [pred + [dx, dy] for dx in g for dy in g]
        p = ellipse_search(plate_mask(frames[f]), cands, M0 * np.array([0.92, 1.0, 1.08]), [m0 / M0 * k for k in (0.9, 1.0, 1.1)])
        if p is None or p["score"] < 0.45 or p["centre"][1] - p["axes"][0] / 2 < 0:
            break
        v = p["centre"] - c
        c = p["centre"]
        centres[f], scores[f] = c, p["score"]
    return centres, scores


def to_ref(points, Ms):
    """Map per-frame points (n,2) into reference-frame px."""
    return np.array([apply_affine(M, p[None])[0] if np.isfinite(p).all() else [np.nan, np.nan]
                     for M, p in zip(Ms, points)])


def from_ref(point, M):
    return apply_affine(invert_affine(M), np.asarray(point, float)[None])[0]
