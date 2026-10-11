import numpy as np
from scipy.signal import butter, filtfilt


def angle(a, b, c):
    """Angle ABC in degrees (0..180). Works on single points or arrays of points (..., 2)."""
    a, b, c = (np.asarray(p, float) for p in (a, b, c))
    v1, v2 = a - b, c - b
    cos = np.sum(v1 * v2, axis=-1) / (np.linalg.norm(v1, axis=-1) * np.linalg.norm(v2, axis=-1))
    return np.degrees(np.arccos(np.clip(cos, -1.0, 1.0)))


def trunk_angle(shoulder, hip):
    """Angle of the hip->shoulder line above horizontal, degrees (90 = upright). Image coords, y down."""
    s, h = np.asarray(shoulder, float), np.asarray(hip, float)
    d = s - h
    return np.degrees(np.arctan2(-d[..., 1], np.abs(d[..., 0])))


def fill_nans(x):
    x = np.asarray(x, float).copy()
    idx = np.arange(len(x))
    ok = np.isfinite(x)
    if ok.sum() == 0:
        return x
    x[~ok] = np.interp(idx[~ok], idx[ok], x[ok])
    return x


def lowpass(x, fps, cutoff=6.0):
    """Zero-phase Butterworth low-pass along axis 0, NaNs interpolated first."""
    x = np.asarray(x, float)
    if x.ndim > 1:
        return np.stack([lowpass(x[:, i], fps, cutoff) for i in range(x.shape[1])], axis=1)
    x = fill_nans(x)
    if len(x) < 16 or not np.isfinite(x).all():
        return x
    b, a = butter(2, cutoff / (fps / 2))
    return filtfilt(b, a, x)


def normalise(pt, width, height, ndigits=4):
    """Pixel point -> {x, y} as fractions of the frame (origin top-left), clamped to 0..1."""
    return {"x": round(float(np.clip(pt[0] / width, 0, 1)), ndigits),
            "y": round(float(np.clip(pt[1] / height, 0, 1)), ndigits)}


def apply_affine(M, pts):
    pts = np.asarray(pts, float)
    return pts @ M[:, :2].T + M[:, 2]


def invert_affine(M):
    A = np.vstack([M, [0, 0, 1]])
    return np.linalg.inv(A)[:2]


def rise_ratio(ref_y, other_y):
    """Least-squares slope of other's displacement on ref's (both from their first finite sample), NaNs skipped.
    Two points on one rigid bar rise the same cm, so the px ratio is the ratio of their image scales (depths)."""
    a, b = np.asarray(ref_y, float), np.asarray(other_y, float)
    ok = np.isfinite(a) & np.isfinite(b)
    if ok.sum() < 3:
        return None
    a, b = a[ok] - a[ok][0], b[ok] - b[ok][0]
    den = float(np.sum(a * a))
    return float(np.sum(a * b) / den) if den > 0 else None


def bar_from_wrists(lw, rw, max_gap):
    """Bar centre per frame from the two wrists (n,2). Both hands hold one rigid bar, so filmed side-on (hands
    overlapping) their heights agree; when they differ by more than max_gap px one is a guess (the far hand hides
    behind the plate and the pose model parks it at the knee). Pose scores do not tell which, so keep the wrist that
    continues the bar's previous position."""
    lw, rw = np.asarray(lw, float), np.asarray(rw, float)
    out = (lw + rw) / 2
    for f in range(len(out)):
        if not (np.isfinite(lw[f]).all() and np.isfinite(rw[f]).all()):
            out[f] = lw[f] if np.isfinite(lw[f]).all() else rw[f]
        elif abs(lw[f, 1] - rw[f, 1]) > max_gap and f > 0 and np.isfinite(out[f - 1]).all():
            out[f] = min((lw[f], rw[f]), key=lambda w: np.linalg.norm(w - out[f - 1]))
    return out
