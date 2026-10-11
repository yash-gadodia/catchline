import os
import subprocess

import cv2
import numpy as np

from .track import from_ref

BONES = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14),
         (14, 16), (15, 24), (15, 20), (16, 25), (16, 21), (0, 18), (18, 5), (18, 6)]
PHASE_COL = {"setup": (200, 200, 200), "first_pull": (0, 200, 255), "transition": (0, 255, 255),
             "second_pull": (0, 255, 0), "turnover": (255, 200, 0), "catch": (255, 0, 255), "recovery": (0, 128, 255),
             "drive": (0, 255, 0), "arch": (255, 128, 0), "hollow": (0, 200, 255), "hip_drive": (0, 255, 0),
             "support": (255, 0, 255), "lockout": (255, 255, 0), "tuck": (0, 200, 255), "press": (255, 0, 255),
             "hang": (200, 200, 200)}


def phase_at(phases, f):
    for p in phases:
        if p["startFrame"] <= f <= p["endFrame"]:
            return p["name"]
    return ""


def draw(r, i):
    ref = r["_ref"]
    s0, Ms = ref["s0"], ref["Ms"]
    im = ref["frames"][i].copy()
    k, sc = ref["kraw"][i], ref["ks"][i]
    for a, b in BONES:
        if sc[a] > 0.3 and sc[b] > 0.3:
            cv2.line(im, tuple(int(v) for v in k[a]), tuple(int(v) for v in k[b]), (255, 255, 255), 2)
    lo = r["phases"][0]["startFrame"] - s0
    pts = [from_ref(ref["bar"][j], Ms[i]) for j in range(lo, i + 1)]
    for a, b in zip(pts, pts[1:]):
        cv2.line(im, tuple(int(v) for v in a), tuple(int(v) for v in b), (0, 0, 255), 3)
    pr = ref["plate_ref"][i]
    if np.isfinite(pr).all():
        c = from_ref(pr, Ms[i])
        ax = r["plates"][0]["axes"]
        cv2.ellipse(im, ((float(c[0]), float(c[1])), (ax[1], ax[0]), 0), (0, 255, 255), 2)
        cv2.circle(im, tuple(int(v) for v in c), 5, (0, 255, 255), -1)
    for kind, v in ref.get("lines", []):
        if kind == "h":
            a, b = from_ref((0, v), Ms[i]), from_ref((im.shape[1], v), Ms[i])
        else:
            a, b = from_ref((v, 0), Ms[i]), from_ref((v, im.shape[0]), Ms[i])
        cv2.line(im, tuple(int(x) for x in a), tuple(int(x) for x in b), (0, 255, 0), 2)
    name = phase_at(r["phases"], s0 + i)
    cv2.rectangle(im, (0, 0), (im.shape[1], 70), (0, 0, 0), -1)
    cv2.putText(im, f"f{s0 + i} {name}", (14, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.5, PHASE_COL.get(name, (255, 255, 255)), 3)
    return im


def render_video(r, path, fps):
    fr = r["_ref"]["frames"]
    h, w = fr[0].shape[:2]
    end = min(len(fr), r["events"]["recovered"] - r["_ref"]["s0"] + 15)
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}",
                             "-r", str(fps), "-i", "-", "-vf", "scale=-2:960", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                             "-crf", "23", path], stdin=subprocess.PIPE)
    for i in range(end):
        proc.stdin.write(draw(r, i).tobytes())
    proc.stdin.close()
    proc.wait()


def contact_sheet(r, path, extra=()):
    s0 = r["_ref"]["s0"]
    frames = sorted(set(list(r["keys"].values()) + list(extra)))
    tiles = []
    for f in frames:
        im = draw(r, f - s0)
        label = [p for p, v in r["keys"].items() if v == f]
        if label:
            cv2.putText(im, "KEY " + ",".join(label), (14, im.shape[0] - 30), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 0, 255), 3)
        tiles.append(cv2.resize(im, (360, 640)))
    while len(tiles) % 5:
        tiles.append(np.zeros_like(tiles[0]))
    rows = [np.hstack(tiles[i:i + 5]) for i in range(0, len(tiles), 5)]
    cv2.imwrite(path, np.vstack(rows))


def signal_plot(r, path):
    ref = r["_ref"]
    s0 = ref["s0"]
    n = len(ref["frames"])
    W, H = 1400, 700
    img = np.full((H, W, 3), 255, np.uint8)
    xs = lambda f: int(40 + (f) / max(1, n - 1) * (W - 80))
    for p in r["phases"]:
        a, b = xs(p["startFrame"] - s0), xs(p["endFrame"] - s0)
        cv2.rectangle(img, (a, 0), (b, H), tuple(int(c * 0.35 + 255 * 0.65) for c in PHASE_COL[p["name"]]), -1)
        cv2.putText(img, p["name"], (a + 2, 20 + 18 * (SN.index(p["name"]) % 3)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    series = [(-ref["bar"][:, 1] / r["px_per_cm"], (0, 0, 255), "bar height cm"),
              (-ref["plate_ref"][:, 1] / r["px_per_cm"], (0, 160, 160), "near plate cm"),
              (ref["knee_ang"], (255, 0, 0), "knee deg"), (ref["hip_ang"], (0, 140, 0), "hip deg"),
              (ref["bar"][:, 0] * r["fwd"] / r["px_per_cm"], (150, 0, 150), "bar fwd cm"),
              (ref["elbow"], (120, 120, 120), "elbow deg")]
    for li, (y, col, label) in enumerate(series):
        ok = np.isfinite(y)
        if ok.sum() < 2:
            continue
        lo_, hi_ = np.nanmin(y), np.nanmax(y)
        ys = lambda v: int(H - 40 - (v - lo_) / max(1e-6, hi_ - lo_) * (H - 120))
        pts = np.array([(xs(f), ys(y[f])) for f in range(n) if ok[f]], np.int32)
        cv2.polylines(img, [pts], False, col, 2)
        cv2.putText(img, f"{label} [{lo_:.0f}..{hi_:.0f}]", (W - 330, 90 + 22 * li), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2)
    for name, f in r["events"].items():
        if isinstance(f, bool):
            continue
        cv2.line(img, (xs(f - s0), 60), (xs(f - s0), H - 30), (0, 0, 0), 1)
        cv2.putText(img, f"{name}:{f}", (xs(f - s0) + 2, H - 10 - 14 * (list(r["events"]).index(name) % 2)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 0), 1)
    cv2.imwrite(path, img)


SN = list(PHASE_COL)


def keyframe_sheet(keyframes_dir, path, cols=6, tile_h=480):
    """The exported (bystander-blurred) keyframes in one image, to check what would actually be stored."""
    names = sorted(f for f in os.listdir(keyframes_dir) if f.endswith(".jpg"))
    tiles = []
    for n in names:
        im = cv2.imread(os.path.join(keyframes_dir, n))
        im = cv2.resize(im, (int(im.shape[1] * tile_h / im.shape[0]), tile_h))
        cv2.putText(im, n[:-4], (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        tiles.append(im)
    if not tiles:
        return
    w = max(t.shape[1] for t in tiles)
    tiles = [cv2.copyMakeBorder(t, 0, 0, 0, w - t.shape[1], cv2.BORDER_CONSTANT) for t in tiles]
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    cv2.imwrite(path, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]))
