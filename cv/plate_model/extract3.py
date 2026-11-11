"""Second pass over the clips: whole frames at 640 px (for the full-frame detector) for every frame that is trained or
tested on, and context squares for the owner's labelled frames (~/catchline-plate-data/label1/manifest.json), which fall
on frames the first pass skipped.  python extract3.py DATA HAND.json"""
import json, os, sys
import cv2
import numpy as np
from extract import CTX, PX, L_WRI, R_WRI, fill, run_labels, sources

H = os.path.expanduser("~")
data, hand = sys.argv[1], json.load(open(sys.argv[2]))
want = {}
for name in ("train", "val"):
    for r in json.load(open(f"{data}/{name}.json")):
        want.setdefault(r["clip"], set()).add(int(os.path.basename(r["img"])[:-4]))
for cid, d in hand.items():
    want.setdefault(cid, set()).update(int(f) for f in d)
owner = {}
for m in json.load(open(f"{H}/catchline-plate-data/label1/manifest.json")):
    owner.setdefault(m["clip"], set()).add(m["frame"])
for cid in ("IMG_1179", "2026-09-20_A92852F6-D8FE-4EC2-B049-ED75AA6F05CC", "2026-09-22_3FB05CFF"):
    want.setdefault(cid, set()).update(r["f"] for r in json.load(open(f"{data}/meta/{cid}.json"))["frames"][::3])
src = {s["id"]: s for s in sources()}
for cid in sorted(set(want) | set(owner)):
    mf = f"{data}/meta/{cid}.json"
    if not os.path.exists(mf) or os.path.exists(f"{data}/full/{cid}/size.json"):
        continue
    m = json.load(open(mf))
    by = {r["f"]: r for r in m["frames"]}
    need = want.get(cid, set()) | owner.get(cid, set())
    add = sorted(owner.get(cid, set()) - set(by))
    tr = None
    if add and cid in src:
        labs = {}
        for name, d in src[cid]["runs"].items():
            labs[name], t = run_labels(d, 0, None)
            tr = tr or t
        k, sc, boxes = tr["lifter"]
        bodyH = float(np.nanmedian(boxes[:, 3] - boxes[:, 1]))
        seen = np.isfinite(k[:, [L_WRI, R_WRI]]).all(axis=2).any(axis=1)
        mid = fill(np.nanmean(k[:, [L_WRI, R_WRI]], axis=1))
    os.makedirs(f"{data}/full/{cid}", exist_ok=True)
    cap = cv2.VideoCapture(m["clip"])
    f, size = 0, None
    while f <= max(need):
        ok, img = cap.read()
        if not ok:
            break
        if f in need:
            h, w = img.shape[:2]
            s = 640 / max(h, w)
            size = dict(W=w, H=h, scale=s)
            cv2.imwrite(f"{data}/full/{cid}/{f:05d}.jpg", cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 85])
            if f in add and tr is not None and f < len(k):
                sf = h / tr["shape"][0]
                side = CTX * bodyH * sf
                cx, cy = mid[f] * sf
                M = np.array([[PX / side, 0, PX / 2 - cx * PX / side], [0, PX / side, PX / 2 - cy * PX / side]])
                cv2.imwrite(f"{data}/ctx/{cid}/{f:05d}.jpg", cv2.warpAffine(img, M, (PX, PX), flags=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 82])
                row = dict(f=f, cx=float(cx), cy=float(cy), side=float(side), wrist=bool(seen[f]), owner=True)
                for name, l in labs.items():
                    if f in l:
                        x, y, r, sr, rim = l[f]
                        row[name] = [round(x * sf, 1), round(y * sf, 1), round(r * sf, 1), sr, round(rim, 2)]
                m["frames"].append(row)
        f += 1
    if size:
        m["frames"].sort(key=lambda r: r["f"])
        m["H"] = size["H"]; m["W"] = size["W"]
        json.dump(m, open(mf, "w"))
        json.dump(size, open(f"{data}/full/{cid}/size.json", "w"))
    print(cid, "full", len(need), "owner frames added", len(add), flush=True)
