"""Context squares for clips that have no pose trace.
  python extract2.py OUT ds     clips with tracker-made labels in ~/catchline-dataset/labels: square placed round the label
  python extract2.py OUT neg    public pull-up / muscle-up clips: random squares, no plate label (negatives)"""
import glob, json, os, sys
import cv2
import numpy as np

H = os.path.expanduser("~")
CTX, PX = 2.4, 384
out, mode = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(0)


def cut(img, cx, cy, side, path):
    M = np.array([[PX / side, 0, PX / 2 - cx * PX / side], [0, PX / side, PX / 2 - cy * PX / side]])
    cv2.imwrite(path, cv2.warpAffine(img, M, (PX, PX), flags=cv2.INTER_AREA if side > PX else cv2.INTER_LINEAR), [cv2.IMWRITE_JPEG_QUALITY, 82])


def frames(clip, want):
    cap = cv2.VideoCapture(clip)
    f = 0
    while True:
        ok, img = cap.read()
        if not ok or f > max(want):
            return
        if f in want:
            yield f, img
        f += 1


if mode == "ds":
    for lf in sorted(glob.glob(f"{H}/catchline-dataset/labels/*.json")):
        d = json.load(open(lf))
        cid = d["clip_id"]
        lab = {l["frame"]: l for r in d["reps"] for l in r["labels"] if l["frame"] % 2 == 0}
        if not lab or os.path.exists(f"{out}/meta/{cid}.json"):
            continue
        clip = f"{H}/catchline-dataset/{d['file']}"
        os.makedirs(f"{out}/ctx/{cid}", exist_ok=True)
        rows = []
        for f, img in frames(clip, set(lab)):
            l = lab[f]
            s = img.shape[1] / d["width"]
            bh = 2 * l["r"] * s / 0.28
            cx, cy = l["x"] * s + rng.uniform(-0.3, 0.3) * bh, l["y"] * s + rng.uniform(-0.3, 0.3) * bh
            cut(img, cx, cy, CTX * bh, f"{out}/ctx/{cid}/{f:05d}.jpg")
            rows.append(dict(f=f, cx=float(cx), cy=float(cy), side=float(CTX * bh), wrist=False, ds=[l["x"] * s, l["y"] * s, l["r"] * s, 1, l["confidence"]]))
        json.dump(dict(id=cid, set="public", clip=clip, n=len(rows), frames=rows), open(f"{out}/meta/{cid}.json", "w"))
        print(cid, len(rows), flush=True)
else:
    clips = sorted(sum((glob.glob(f"{H}/catchline-dataset/clips/{m}/*.mp4") for m in ("pull_up", "muscle_up", "bar_muscle_up")), []), key=os.path.getsize)
    for clip in clips[3:33]:
        cid = "neg_" + os.path.basename(clip)[:-4]
        if os.path.exists(f"{out}/meta/{cid}.json"):
            continue
        cap = cv2.VideoCapture(clip); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); cap.release()
        if n < 30:
            continue
        os.makedirs(f"{out}/ctx/{cid}", exist_ok=True)
        rows = []
        for f, img in frames(clip, {int(n * (k + 0.5) / 20) for k in range(20)}):
            h, w = img.shape[:2]
            side = rng.uniform(0.6, 1.3) * min(h, w)
            cx, cy = rng.uniform(0.3, 0.7) * w, rng.uniform(0.3, 0.7) * h
            cut(img, cx, cy, side, f"{out}/ctx/{cid}/{f:05d}.jpg")
            rows.append(dict(f=f, cx=float(cx), cy=float(cy), side=float(side), wrist=False))
        json.dump(dict(id=cid, set="neg", clip=clip, n=len(rows), frames=rows), open(f"{out}/meta/{cid}.json", "w"))
        print(cid, len(rows), flush=True)
