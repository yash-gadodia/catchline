"""Bystander blur from body pose only (14-legal-privacy.md): no face detector, no face landmarks. Head keypoints are
already dropped at the pose step, so the box is grown upwards to cover the head."""
import cv2
import numpy as np


def person_box(box, kpts, scores, min_score=0.3, pad=0.15, head=0.45):
    """Blur box for one person: the extent of their confident body keypoints, padded on every side and grown upwards
    by `head` x the body extent (the head sits above the shoulders). Falls back to the detector box."""
    ok = (np.asarray(scores) > min_score) & np.isfinite(kpts).all(1)
    if ok.sum() >= 4:
        x1, y1 = kpts[ok].min(0)
        x2, y2 = kpts[ok].max(0)
    else:
        x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    s = max(w, h)
    return np.array([x1 - pad * s, y1 - pad * s - head * max(h, 0.5 * s), x2 + pad * s, y2 + pad * s])


def lifter_mask(shape, kpts, scores, width, min_score=0.3):
    """Thick skeleton of the lifter, so a bystander box that overlaps them never blurs the lifter."""
    m = np.zeros(shape[:2], np.uint8)
    ok = (np.asarray(scores) > min_score) & np.isfinite(kpts).all(1)
    pts = kpts[ok]
    if len(pts) >= 3:
        cv2.fillConvexPoly(m, cv2.convexHull(pts.astype(np.int32)), 255)
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(width) | 1, int(width) | 1)))
    return m


def blur_bystanders(img, others, lifter=None, scale=1.0):
    """others: [(box, kpts, scores)] in inference px; scale maps them to img px. lifter: (kpts, scores) or None.
    Returns a copy with every bystander box heavily blurred (irreversible at this kernel), minus the lifter."""
    out = img.copy()
    if not others:
        return out
    H, W = img.shape[:2]
    k = max(31, int(0.06 * H) | 1)
    blurred = cv2.GaussianBlur(cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA), (k // 4 | 1, k // 4 | 1), 0)
    blurred = cv2.resize(blurred, (W, H), interpolation=cv2.INTER_LINEAR)
    m = np.zeros((H, W), np.uint8)
    for b, kp, s in others:
        x1, y1, x2, y2 = (person_box(np.asarray(b) * scale, np.asarray(kp) * scale, s)).astype(int)
        cv2.rectangle(m, (max(0, x1), max(0, y1)), (min(W - 1, x2), min(H - 1, y2)), 255, -1)
    if lifter is not None:
        lk, ls = lifter
        m[lifter_mask((H, W), np.asarray(lk) * scale, ls, 0.04 * H) > 0] = 0
    out[m > 0] = blurred[m > 0]
    return out


def bystanders(people_f, lifter_box, min_iou=0.5):
    """People in one frame that are not the tracked lifter (box IoU with the lifter's box below min_iou)."""
    from .lifter import iou
    if lifter_box is None or not np.isfinite(lifter_box).all():
        return list(people_f)
    return [p for p in people_f if iou(p[0], lifter_box) < min_iou]
