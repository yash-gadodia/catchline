"""Contact sheets of context squares with the labels drawn, for checking labels by eye.
  python sheet.py DATA OUT key [--ids a,b] [--n 8] [--px 224]"""
import json, os, sys, glob
import cv2
import numpy as np

data, out, key = sys.argv[1:4]
ids = sys.argv[sys.argv.index("--ids") + 1].split(",") if "--ids" in sys.argv else None
N = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 8
PX = int(sys.argv[sys.argv.index("--px") + 1]) if "--px" in sys.argv else 224
os.makedirs(out, exist_ok=True)
rows = []
for mf in sorted(glob.glob(f"{data}/meta/*.json")):
    m = json.load(open(mf))
    if ids and m["id"] not in ids:
        continue
    fr = [r for r in m["frames"] if key in r or key == "none"]
    if not fr:
        continue
    pick = [fr[int(i * (len(fr) - 1) / max(1, N - 1))] for i in range(N)]
    tiles = []
    for r in pick:
        img = cv2.imread(f"{data}/ctx/{m['id']}/{r['f']:05d}.jpg")
        c = img.shape[0]
        s = c / r["side"]
        if key in r:
            x, y, rad = [(r[key][0] - r["cx"]) * s + c / 2, (r[key][1] - r["cy"]) * s + c / 2, r[key][2] * s]
            cv2.circle(img, (int(x), int(y)), int(rad), (0, 255, 255), 1, cv2.LINE_AA)
            cv2.circle(img, (int(x), int(y)), 3, (0, 0, 255), -1, cv2.LINE_AA)
        img = cv2.resize(img, (PX, PX), interpolation=cv2.INTER_AREA)
        cv2.putText(img, f"{r['f']}", (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        tiles.append(img)
    row = np.hstack(tiles)
    cv2.putText(row, f"{m['id'][:22]} {key} n={len(fr)}", (4, PX - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
    rows.append(row)
for i in range(0, len(rows), 5):
    cv2.imwrite(f"{out}/{key}_{i // 5:02d}.jpg", np.vstack(rows[i:i + 5]), [cv2.IMWRITE_JPEG_QUALITY, 80])
print(len(rows), "rows")
