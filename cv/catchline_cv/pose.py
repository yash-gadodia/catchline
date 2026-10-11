import numpy as np

from .video import frames

# Halpe26 indices
NOSE, L_SHO, R_SHO, L_ELB, R_ELB, L_WRI, R_WRI = 0, 5, 6, 7, 8, 9, 10
L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANK, R_ANK = 11, 12, 13, 14, 15, 16
L_BIGTOE, R_BIGTOE, L_HEEL, R_HEEL = 20, 21, 24, 25


def run_pose(path, height, mode="balanced"):
    """All people in every frame: list (per frame) of (bbox[4], kpts[26,2], scores[26]) in inference px."""
    from rtmlib import YOLOX, RTMPose, BodyWithFeet

    cfg = BodyWithFeet.MODE[mode]
    det = YOLOX(cfg["det"], model_input_size=cfg["det_input_size"], backend="onnxruntime", device="cpu")
    pose = RTMPose(cfg["pose"], model_input_size=cfg["pose_input_size"], backend="onnxruntime", device="cpu")
    out = []
    shape = None
    for _, img in frames(path, height):
        shape = img.shape
        boxes = det(img)
        people = []
        if len(boxes):
            kpts, scores = pose(img, bboxes=boxes)
            for b, k, s in zip(boxes, kpts, scores):
                people.append((np.asarray(b, float), np.asarray(k, float), np.asarray(s, float)))
        out.append(people)
    return out, shape
