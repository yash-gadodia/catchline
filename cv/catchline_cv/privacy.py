"""Bystander blur from body pose only (14-legal-privacy.md): no face detector, no face landmarks. Head keypoints are
already dropped at the pose step, so the head is placed above the shoulders along the torso."""
import cv2
import numpy as np

from .pose import L_HIP, L_SHO, R_HIP, R_SHO

# Halpe26 bones without the head points (dropped at the pose step): the four arm bones first, then shoulders, hips, legs, feet, neck to hip
BONES = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (11, 12), (5, 11), (6, 12), (11, 13), (13, 15), (12, 14), (14, 16),
         (15, 20), (15, 22), (15, 24), (16, 21), (16, 23), (16, 25), (18, 19)]


def _ok(kpts, scores, min_score):
    return (np.asarray(scores) > min_score) & np.isfinite(kpts).all(1)


def body_frame(box, kpts, ok):
    """(torso length, shoulder midpoint, unit 'up' vector) of one person. Without both shoulders and hips the torso
    comes from the detector box (0.3 x its height, or 0.6 x its width for a head-and-shoulders box), the top of the
    body is the highest point, and up is image up."""
    sho = kpts[[L_SHO, R_SHO]][ok[[L_SHO, R_SHO]]]
    hip = kpts[[L_HIP, R_HIP]][ok[[L_HIP, R_HIP]]]
    up = np.array([0.0, -1.0])
    if len(sho) and len(hip):
        d = sho.mean(0) - hip.mean(0)
        t = float(np.hypot(*d))
        if t > 1:
            return t, sho.mean(0), d / t
    t = max(0.3 * float(box[3] - box[1]), 0.6 * float(box[2] - box[0]))
    if len(sho):
        return t, sho.mean(0), up
    pts = kpts[ok]
    top = pts[pts[:, 1].argmin()] if len(pts) else np.array([(box[0] + box[2]) / 2, box[1] + 0.15 * (box[3] - box[1])])
    return t, top, up


def _head(m, sho, up, t, centre, along, across):
    """Head ellipse `centre` torsos above the shoulder midpoint (a head is about half a torso tall). The neck stays
    nearer upright than the torso, so a hinged-over body's head is placed halfway between its torso and image up."""
    if up[1] < 0:
        up = (up + np.array([0.0, -1.0])) / np.hypot(*(up + np.array([0.0, -1.0])))
    c = sho + up * centre * t
    ang = float(np.degrees(np.arctan2(up[1], up[0])))
    cv2.ellipse(m, (int(round(c[0])), int(round(c[1]))), (max(1, int(along * t)), max(1, int(across * t))), ang, 0, 360,
                255, -1)


def bystander_mask(shape, box, kpts, scores, min_score=0.3):
    """Hard mask over one bystander: the hull of every confident keypoint dilated by a quarter torso, plus a head
    ellipse above the shoulders bigger than any head, plus the ellipse inscribed in the detector box (a person half
    hidden behind the lifter may have only a few confident keypoints)."""
    m = np.zeros(shape[:2], np.uint8)
    ok = _ok(kpts, scores, min_score)
    t, sho, up = body_frame(box, kpts, ok)
    if ok.sum() >= 3:
        cv2.fillConvexPoly(m, cv2.convexHull(np.round(kpts[ok]).astype(np.int32)), 255)
        r = max(1, int(0.25 * t))
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    x1, y1, x2, y2 = box
    cv2.ellipse(m, (int((x1 + x2) / 2), int((y1 + y2) / 2)), (int(0.5 * (x2 - x1)), int(0.5 * (y2 - y1))), 0, 0, 360,
                255, -1)
    _head(m, sho, up, t, 0.4, 0.5, 0.45)
    return m


def lifter_mask(shape, box, kpts, scores, min_score=0.3):
    """Hard mask over the lifter's own body: thick bones, the filled torso and the head. Unlike a hull it leaves the
    gaps between the arms and legs open, so whoever stands behind the lifter shows there and gets blurred."""
    m = np.zeros(shape[:2], np.uint8)
    ok = _ok(kpts, scores, min_score)
    t, sho, up = body_frame(box, kpts, ok)
    for i, (a, b) in enumerate(BONES):
        if ok[a] and ok[b]:
            w = max(3, int((0.18 if i < 4 else 0.3) * t))  # arms are thinner than legs
            cv2.line(m, tuple(np.round(kpts[a]).astype(int)), tuple(np.round(kpts[b]).astype(int)), 255, w)
    for j in np.flatnonzero(ok):
        cv2.circle(m, tuple(np.round(kpts[j]).astype(int)), max(2, int(0.13 * t)), 255, -1)
    torso = [j for j in (L_SHO, R_SHO, R_HIP, L_HIP) if ok[j]]
    if len(torso) >= 3:
        cv2.fillConvexPoly(m, cv2.convexHull(np.round(kpts[torso]).astype(np.int32)), 255)
    _head(m, sho, up, t, 0.35, 0.35, 0.3)
    return m


def blur_bystanders(img, others, lifter=None, scale=1.0, min_score=0.3):
    """others: [(box, kpts, scores)] in inference px; scale maps them to img px. lifter: (box, kpts, scores) or None.
    Returns a copy where every bystander is replaced, through a feathered person-shaped mask, by a pixelated then
    blurred copy of the frame (a head spans about four blocks, so it cannot be recovered). The lifter's own mask always
    wins: those pixels are returned unchanged."""
    if not others:
        return img.copy()
    H, W = img.shape[:2]
    m = np.zeros((H, W), np.uint8)
    t = 0.0
    for b, kp, s in others:
        b, kp = np.asarray(b, float) * scale, np.asarray(kp, float) * scale
        m |= bystander_mask((H, W), b, kp, s, min_score)
        t = max(t, body_frame(b, kp, _ok(kp, s, min_score))[0])
    sigma = 0.012 * H  # the 10-90 % ramp of the edge is ~3 % of the image height
    r = int(2 * sigma)  # grown first, so a small far-away person is still fully covered inside the ramp
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    alpha = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), sigma)
    if lifter is not None:
        lb, lk, ls = lifter
        core = lifter_mask((H, W), np.asarray(lb, float) * scale, np.asarray(lk, float) * scale, ls, min_score) > 0
        keep = np.maximum(core, cv2.GaussianBlur(core.astype(np.float32), (0, 0), 0.5 * sigma))
        alpha *= 1 - keep
    block = max(6, int(round(t / 8)))  # a head is about half a torso tall: it spans about four blocks
    small = cv2.resize(img, (max(1, W // block), max(1, H // block)), interpolation=cv2.INTER_AREA)
    blurred = cv2.GaussianBlur(cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), block)
    a = alpha[..., None]
    out = np.round(img * (1 - a) + blurred * a).astype(np.uint8)
    out[alpha <= 0] = img[alpha <= 0]
    return out


def bystanders(people_f, lifter_box, min_iou=0.5):
    """People in one frame that are not the tracked lifter. Only the one detection that is the lifter (the best box
    match, which the tracker copied) is left out; a person standing right behind the lifter overlaps their box and is
    still a bystander."""
    from .lifter import iou
    if lifter_box is None or not np.isfinite(lifter_box).all() or not people_f:
        return list(people_f)
    o = [iou(p[0], lifter_box) for p in people_f]
    i = int(np.argmax(o))
    return [p for j, p in enumerate(people_f) if j != i or o[i] < min_iou]
