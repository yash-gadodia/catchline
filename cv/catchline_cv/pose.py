import numpy as np

from .video import frames

# Halpe26 indices
NOSE, L_SHO, R_SHO, L_ELB, R_ELB, L_WRI, R_WRI = 0, 5, 6, 7, 8, 9, 10
L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK = 11, 12, 13, 14, 15, 16
L_BIGTOE, R_BIGTOE, L_HEEL, R_HEEL = 20, 21, 24, 25
# nose, eyes, ears, head top: dropped straight after inference so no face points are ever cached, measured or stored
HEAD = (0, 1, 2, 3, 4, 17)


def strip_head(people):
    """Drop the head keypoints (NaN, score 0) from per-frame [(box, kpts, scores)]."""
    out = []
    for ps in people:
        row = []
        for b, k, s in ps:
            k, s = np.array(k, float), np.array(s, float)
            k[list(HEAD)] = np.nan
            s[list(HEAD)] = 0.0
            row.append((b, k, s))
        out.append(row)
    return out


def _iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)


def unrotate(people, shape):
    """Map detections made on a 180-degree-rotated frame back to the upright frame. A rotation is not a mirror, so
    anatomical left/right labels stay as they are (no flip_idx swap)."""
    H, W = shape[:2]
    out = []
    for b, k, s in people:
        b = np.array([W - b[2], H - b[3], W - b[0], H - b[1]], float)
        k = np.stack([W - k[:, 0], H - k[:, 1]], 1)
        out.append((b, k, s))
    return out


def merge_passes(upright, rotated, min_iou=0.3):
    """Per person keep whichever pass scored higher (mean keypoint score); unmatched people from either pass are kept.
    This is the two-pass inference for inverted bodies (23-gymnastics.md section 3.2)."""
    out, used = [], set()
    for b, k, s in upright:
        j = max(range(len(rotated)), key=lambda i: _iou(b, rotated[i][0]), default=None)
        if j is not None and j not in used and _iou(b, rotated[j][0]) >= min_iou:
            used.add(j)
            out.append(rotated[j] if rotated[j][2].mean() > s.mean() else (b, k, s))
        else:
            out.append((b, k, s))
    out += [p for i, p in enumerate(rotated) if i not in used]
    return out


def run_pose(path, height, mode="balanced", two_pass=False):
    """All people in every frame: list (per frame) of (bbox[4], kpts[26,2], scores[26]) in inference px, head points
    already dropped. two_pass also runs every frame rotated 180 degrees and keeps the more confident pose per person."""
    import onnxruntime as ort
    from rtmlib import YOLOX, RTMPose, BodyWithFeet

    cfg = BodyWithFeet.MODE[mode]
    det = YOLOX(cfg["det"], model_input_size=cfg["det_input_size"], backend="onnxruntime", device="cpu")
    pose = RTMPose(cfg["pose"], model_input_size=cfg["pose_input_size"], backend="onnxruntime", device="cpu")
    # same CPU provider and default threads as rtmlib, but idle worker threads sleep instead of spinning: on the
    # shared Mini (VM, Spotlight, other agents) spinning threads fight the rest of the box for cores. Same kernels,
    # same numbers; per-frame interleaved A/Bs on 14-10-2026: 1.11x on the Mini, 1.34x on a busy laptop.
    so = ort.SessionOptions()
    so.add_session_config_entry("session.intra_op.allow_spinning", "0")
    det.session = ort.InferenceSession(det.onnx_model, sess_options=so, providers=["CPUExecutionProvider"])
    pose.session = ort.InferenceSession(pose.onnx_model, sess_options=so, providers=["CPUExecutionProvider"])

    def infer(img):
        boxes = det(img)
        if not len(boxes):
            return []
        kpts, scores = pose(img, bboxes=boxes)
        return [(np.asarray(b, float), np.asarray(k, float), np.asarray(s, float)) for b, k, s in zip(boxes, kpts, scores)]

    out = []
    shape = None
    for _, img in frames(path, height):
        shape = img.shape
        people = infer(img)
        if two_pass:
            people = merge_passes(people, unrotate(infer(np.ascontiguousarray(img[::-1, ::-1])), shape))
        out.append(people)
    return strip_head(out), shape
