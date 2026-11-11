"""Cuts wrist-centred context squares out of clips and writes them as small JPEGs with the labels the rule tracker gives.
  python extract.py OUT [--only id,id] [--stride 2]
A context square is CTX body heights wide (body height = the lifter box, median over the clip), centred between the
wrists, saved at PX pixels. The crop the model sees at inference is the middle NOM/CTX of it."""
import glob, json, os, sys
import cv2
import numpy as np
from tracelib import load_trace

H = os.path.expanduser("~")
CTX, NOM, PX = 2.4, 1.6, 384
L_WRI, R_WRI = 9, 10


def sources():
    out = []
    for p in sorted(glob.glob(f"{H}/catchline-v40/photos/IMG_*.MOV")):
        i = os.path.basename(p)[:-4]
        out.append(dict(id=i, set="phone", clip=p, runs={"auto": f"{H}/catchline-v40/out4/{i}", "tap": f"{H}/catchline-v40-plate/r1/{i}"}))
    for p in open(f"{H}/catchline-v40-plate/all.txt").read().split():
        i = os.path.basename(p).rsplit(".", 1)[0]
        if os.path.exists(f"{H}/catchline-v40-plate/v12/{i}/trace.json.gz"):
            out.append(dict(id=i, set="public" if i.startswith("yt_") else "owner", clip=p, runs={"auto": f"{H}/catchline-v40-plate/v12/{i}"}))
    for l in open(f"{H}/catchline-v40-plate/base/rows.jsonl"):
        r = json.loads(l)
        if r.get("kind") == "hip":
            p = [c for c in open(f"{H}/catchline-v40-plate/all.txt").read().split() if os.path.basename(c).rsplit(".", 1)[0] == r["id"]]
            if p:
                out.append(dict(id=r["id"], set="gym", clip=p[0], runs={"auto": f"{H}/catchline-v40-plate/base/{r['id']}"}))
    return out


def fill(v):
    v = v.copy()
    idx = np.arange(len(v))
    for c in range(v.shape[1]):
        ok = np.isfinite(v[:, c])
        v[:, c] = np.interp(idx, idx[ok], v[ok, c]) if ok.sum() >= 2 else np.nan
    return v


def run_labels(d, n, shape):
    """frame -> [x, y, r, src] in trace px, for frames the run's final path reads off the plate"""
    if not os.path.exists(f"{d}/trace.json.gz"):
        return {}, None
    t = load_trace(f"{d}/trace.json.gz")
    if not os.path.exists(f"{d}/analysis.json"):
        return {}, t
    a = json.load(open(f"{d}/analysis.json"))
    Ht, Wt = t["shape"][0], t["shape"][1]
    lab = {}
    for rep in a.get("reps") or []:
        for p in rep.get("path") or []:
            if p.get("src") != "plate":
                continue
            f = p["frame"]
            best = None
            for fo in t["follows"].values():
                j = f - fo["s0"]
                if 0 <= j < fo["n"] and fo["src"][j] in (1, 2) and np.isfinite(fo["centres"][j]).all():
                    dd = float(np.hypot(*(fo["centres"][j] - [p["x"] * Wt, p["y"] * Ht])))
                    if best is None or dd < best[0]:
                        best = (dd, fo["centres"][j], fo["fit"][j], int(fo["src"][j]))
            if best and best[0] < 0.5 * best[2][0]:
                lab[f] = [float(best[1][0]), float(best[1][1]), float(best[2][0] / 2), best[3], float(best[2][1])]
    return lab, t


def main():
    out = sys.argv[1]
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    stride = int(sys.argv[sys.argv.index("--stride") + 1]) if "--stride" in sys.argv else 2
    os.makedirs(f"{out}/ctx", exist_ok=True)
    for s in sources():
        if only and s["id"] not in only:
            continue
        if os.path.exists(f"{out}/meta/{s['id']}.json"):
            continue
        labs, tr = {}, None
        for name, d in s["runs"].items():
            l, t = run_labels(d, 0, None)
            labs[name] = l
            tr = tr or t
        if tr is None:
            print("no trace", s["id"]); continue
        Ht = tr["shape"][0]
        k, sc, boxes = tr["lifter"]
        n = len(k)
        bodyH = float(np.nanmedian(boxes[:, 3] - boxes[:, 1]))
        seen = np.isfinite(k[:, [L_WRI, R_WRI]]).all(axis=2).any(axis=1)
        mid = fill(np.nanmean(k[:, [L_WRI, R_WRI]], axis=1)) if seen.sum() >= 2 else None
        if mid is None or not np.isfinite(bodyH):
            print("no wrists", s["id"]); continue
        cap = cv2.VideoCapture(s["clip"])
        os.makedirs(f"{out}/ctx/{s['id']}", exist_ok=True)
        rows, f = [], 0
        while f < n:
            ok, img = cap.read()
            if not ok:
                break
            if f % stride == 0:
                sf = img.shape[0] / Ht
                side = CTX * bodyH * sf
                cx, cy = mid[f] * sf
                M = np.array([[PX / side, 0, PX / 2 - cx * PX / side], [0, PX / side, PX / 2 - cy * PX / side]])
                ctx = cv2.warpAffine(img, M, (PX, PX), flags=cv2.INTER_AREA, borderValue=(0, 0, 0))
                cv2.imwrite(f"{out}/ctx/{s['id']}/{f:05d}.jpg", ctx, [cv2.IMWRITE_JPEG_QUALITY, 82])
                row = dict(f=f, cx=float(cx), cy=float(cy), side=float(side), wrist=bool(seen[f]), kp=[[None if not np.isfinite(v) else round(float(v * sf), 1) for v in k[f, j]] for j in (L_WRI, R_WRI)])
                for name, l in labs.items():
                    if f in l:
                        x, y, r, src, rim = l[f]
                        row[name] = [round(x * sf, 1), round(y * sf, 1), round(r * sf, 1), src, round(rim, 2)]
                rows.append(row)
            f += 1
        os.makedirs(f"{out}/meta", exist_ok=True)
        json.dump(dict(id=s["id"], set=s["set"], clip=s["clip"], W=img.shape[1] if ok else None, n=n, bodyH=bodyH, frames=rows), open(f"{out}/meta/{s['id']}.json", "w"))
        print(s["id"], s["set"], "frames", len(rows), {name: sum(name in r for r in rows) for name in labs}, flush=True)


if __name__ == "__main__":
    main()
