"""Sheets for labelling the plate by hand in two passes, and for checking the labels drawn back.
  python gridsheet.py DATA OUT ID --frames 10,40,...       pass 1: whole crop with a 32 px grid (crop px 0..256)
  python gridsheet.py DATA OUT ID --labels h.json --zoom   pass 2: a 96 px window round each rough label, 8 px grid,
                                                           the label drawn; axes show crop px
  python gridsheet.py DATA OUT ID --labels h.json          check: whole crop with the label drawn
h.json[ID][frame] = [x, y, r, gripped] in crop px, or null when no plate of the lifter's bar is in the crop.
The crop is the 256 px square the model sees (middle of the context square)."""
import json, os, sys
import cv2
import numpy as np

data, out, cid = sys.argv[1:4]
m = json.load(open(f"{data}/meta/{cid}.json"))
labels = json.load(open(sys.argv[sys.argv.index("--labels") + 1])).get(cid, {}) if "--labels" in sys.argv else None
zoom = "--zoom" in sys.argv
frames = [int(f) for f in (labels.keys() if labels is not None else sys.argv[sys.argv.index("--frames") + 1].split(","))]
tag = "zoom" if zoom else "chk" if labels is not None else "grid"
T = 384
os.makedirs(out, exist_ok=True)
tiles = []
for f in frames:
    ctx = cv2.imread(f"{data}/ctx/{cid}/{f:05d}.jpg")
    o = (ctx.shape[0] - 256) // 2
    l = labels[str(f)] if labels is not None else None
    if zoom and l:
        W = max(96.0, 2.6 * l[2])
        x0, y0 = l[0] - W / 2, l[1] - W / 2
        step = 8 if W <= 128 else 16
    else:
        W, x0, y0, step = 256.0, 0.0, 0.0, 32
    k = T / W
    M = np.array([[k, 0, -(x0 + o) * k], [0, k, -(y0 + o) * k]])
    img = cv2.warpAffine(ctx, M, (T, T), flags=cv2.INTER_CUBIC)
    P = lambda x, y: (int(round((x - x0) * k)), int(round((y - y0) * k)))
    if labels is None or (zoom and l):
        g0x, g0y = int(np.ceil(x0 / step)) * step, int(np.ceil(y0 / step)) * step
        for g in range(g0x, int(x0 + W) + 1, step):
            major = g % (step * 2) == 0
            cv2.line(img, P(g, y0), P(g, y0 + W), (0, 255, 255) if major else (0, 150, 150), 1)
            if major: cv2.putText(img, str(g), (P(g, 0)[0] + 2, 11), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0, 255, 255), 1)
        for g in range(g0y, int(y0 + W) + 1, step):
            major = g % (step * 2) == 0
            cv2.line(img, P(x0, g), P(x0 + W, g), (0, 255, 255) if major else (0, 150, 150), 1)
            if major: cv2.putText(img, str(g), (2, P(0, g)[1] - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (0, 255, 255), 1)
    if labels is not None:
        if l:
            cv2.circle(img, P(l[0], l[1]), int(round(l[2] * k)), (0, 255, 0) if l[3] else (255, 200, 0), 1, cv2.LINE_AA)
            cv2.drawMarker(img, P(l[0], l[1]), (0, 0, 255), cv2.MARKER_CROSS, 12, 1)
        else:
            cv2.putText(img, "NONE", (150, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
    cv2.putText(img, f"f{f}", (6, T - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    cv2.rectangle(img, (0, 0), (T - 1, T - 1), (90, 90, 90), 1)
    tiles.append(img)
for i in range(0, len(tiles), 15):
    t = tiles[i:i + 15]
    while len(t) % 5: t.append(np.zeros_like(tiles[0]))
    cv2.imwrite(f"{out}/{cid}_{tag}_{i // 15}.jpg", np.vstack([np.hstack(t[j:j + 5]) for j in range(0, len(t), 5)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
print(cid, len(tiles))
