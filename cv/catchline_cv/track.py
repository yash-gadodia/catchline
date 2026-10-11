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


def _best_plate(m, cands, majors, ratios, prefer_large=False):
    if prefer_large:
        # fill scores are size-free, so a small dark blob (a shadow, the rim beside a light hub) can outscore the
        # real plate; side-on the near plate is the big disc under the hands: take the largest close-scoring fit
        fits = [q for q in (ellipse_search(m, cands, [M], ratios) for M in majors) if q]
        top = max((q["score"] for q in fits), default=-1)
        p = max((q for q in fits if q["score"] >= top - 0.15), key=lambda q: q["axes"][0], default=None)
    else:
        p = ellipse_search(m, cands, majors, ratios)
    if p:
        g = np.linspace(-0.06, 0.06, 9) * p["axes"][0]
        M0, q0 = p["axes"][0], p["axes"][1] / p["axes"][0]
        p = ellipse_search(m, [p["centre"] + [dx, dy] for dx in g for dy in g],
                           M0 * np.linspace(0.92, 1.08, 9), np.clip(q0 + np.linspace(-0.1, 0.1, 11), 0.3, 1.0))
    return p if p and p["score"] > 0.5 else None


def find_plates(img, wrist_a, wrist_b, body_h, setup_h=None):
    """Plates on the wrist line beyond either hand. Returns [near, far] dicts (near = larger), or fewer if not found.
    Side-on (hands overlap) or when the line search finds nothing: one near plate from a box around the hands,
    sized by the lifter's box height at setup (crouched, so roughly the plate's own scale)."""
    m = plate_mask(img)
    wa, wb = np.asarray(wrist_a, float), np.asarray(wrist_b, float)
    d = wb - wa
    L = np.linalg.norm(d)
    ratios = np.linspace(0.5, 1.0, 6)
    out = []
    if L >= 0.35 * body_h:
        nrm = np.array([-d[1], d[0]]) / L
        for side, ts in (("a", np.linspace(-3.0, -0.15, 50)), ("b", np.linspace(1.15, 4.0, 50))):
            cands = [wa + t * d + o * nrm * L for t in ts for o in np.linspace(-0.4, 0.4, 9)]
            p = _best_plate(m, cands, np.linspace(0.12, 0.5, 20) * body_h, ratios)
            if p:
                p["side"] = side
                out.append(p)
    if not out:
        c = (wa + wb) / 2
        sh = setup_h or body_h
        cands = [c + [dx * sh, dy * sh] for dx in np.linspace(-0.5, 0.5, 31) for dy in np.linspace(-0.1, 0.8, 28)]
        p = _best_plate(m, cands, np.linspace(0.15, 1.3, 30) * sh, ratios, prefer_large=True)
        if p:
            p["side"] = "near"
            out.append(p)
    return sorted(out, key=lambda p: -p["axes"][0])


def ellipse_residual(pts, centre, axes, tilt_deg):
    """|normalised radius - 1| of points against an ellipse (cv2.fitEllipse convention: axes are full widths)."""
    t = np.radians(tilt_deg)
    d = np.asarray(pts, float) - centre
    x = d[:, 0] * np.cos(t) + d[:, 1] * np.sin(t)
    y = -d[:, 0] * np.sin(t) + d[:, 1] * np.cos(t)
    return np.abs(np.sqrt((x / (axes[0] / 2)) ** 2 + (y / (axes[1] / 2)) ** 2) - 1)


def refine_plate(img, plate):
    """Re-fit a coarse plate ellipse to the plate's own outline. The dark mask also catches the plate's floor shadow
    and the lifter's shoes; an opening removes thin attachments and a RANSAC ellipse fit ignores the rest
    (and the bright sleeve notch). A thick kernel cuts shadows but erases a thin ring around a change plate, so both
    scales are tried and the fit that explains more of its outline wins.
    Returns the plate with axes = (vertical, horizontal) full lengths, or None."""
    m = plate_mask(img)
    fits = [f for f in (_refine(m, plate, kf) for kf in (0.6, 0.35)) if f is not None]
    return max(fits, key=lambda f: f["fit_inliers"]) if fits else None


def _refine(m, plate, kf, iters=300, tol=0.035, seed=0):
    r = plate["axes"][1] / 2
    k = max(5, int(kf * r) | 1)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    c = np.asarray(plate["centre"], float)
    roi = np.zeros_like(m)
    cv2.circle(roi, (int(c[0]), int(c[1])), int(1.4 * plate["axes"][0] / 2), 255, -1)
    m &= roi
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cs:
        return None
    pts = max(cs, key=lambda q: cv2.pointPolygonTest(q, tuple(float(v) for v in c), True)).reshape(-1, 2).astype(float)
    if len(pts) < 20:
        return None
    rng = np.random.default_rng(seed)
    best, best_in = None, 0
    for _ in range(iters):
        s = pts[rng.choice(len(pts), 6, replace=False)]
        try:
            (ex, ey), (w, h), ang = cv2.fitEllipse(s.astype(np.float32))
        except cv2.error:
            continue
        if not (0.5 * r < min(w, h) / 2 and max(w, h) / 2 < 2.0 * r) or np.hypot(ex - c[0], ey - c[1]) > r:
            continue
        n_in = int((ellipse_residual(pts, (ex, ey), (w, h), ang) < tol).sum())
        if n_in > best_in:
            best, best_in = ((ex, ey), (w, h), ang), n_in
    if best is None or best_in < 0.4 * len(pts):
        return None
    inl = pts[ellipse_residual(pts, *best) < tol]
    (ex, ey), (w, h), ang = cv2.fitEllipse(inl.astype(np.float32))
    # vertical / horizontal extent of the fitted ellipse
    t = np.radians(ang)
    a, b = w / 2, h / 2
    half_w = np.sqrt((a * np.cos(t)) ** 2 + (b * np.sin(t)) ** 2)
    half_h = np.sqrt((a * np.sin(t)) ** 2 + (b * np.cos(t)) ** 2)
    out = dict(plate)
    out.update({"centre": np.array([ex, ey]), "axes": (float(2 * half_h), float(2 * half_w)),
                "fit_inliers": best_in / len(pts)})
    return out


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


def camera_path(clip, people, infer_h, small_h=360):
    """Whole-clip camera motion, cheaply: background KLT on frames decoded small, people masked by their boxes.
    Returns per-frame 2x3 affines mapping inference-px points in frame f to frame 0 (inference px)."""
    from .video import frames
    s = small_h / infer_h
    S, Si = np.diag([s, s, 1.0]), np.diag([1 / s, 1 / s, 1.0])
    out, prev, acc = [], None, np.eye(3)
    for f, img in frames(clip, small_h):
        cur = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        if prev is not None:
            m = foreground_mask(cur.shape, [np.asarray(p[0]) * s for p in people[f - 1]] if f - 1 < len(people) else [], None, 0)
            p0 = cv2.goodFeaturesToTrack(prev, 300, 0.01, 6, mask=cv2.bitwise_not(m))
            M = IDENT.copy()
            if p0 is not None and len(p0) >= 12:
                p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, cur, p0, None, winSize=(15, 15), maxLevel=2)
                ok = st.ravel() == 1
                if ok.sum() >= 12:
                    est, _ = cv2.estimateAffinePartial2D(p1[ok], p0[ok], method=cv2.RANSAC, ransacReprojThreshold=1.5)
                    if est is not None:
                        M = est
            acc = acc @ np.vstack([M, [0, 0, 1]])
        out.append((Si @ acc @ S)[:2])
        prev = cur
    return out


def to_world(k, Ms):
    """Map (n, J, 2) keypoints through per-frame affines (frames past the end of Ms keep the last one)."""
    out = np.full_like(k, np.nan)
    for f in range(len(k)):
        M = Ms[min(f, len(Ms) - 1)]
        out[f] = k[f] @ M[:, :2].T + M[:, 2]
    return out
