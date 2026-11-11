"""Picks the training rows after the by-eye review of the label sheets.  python build_train.py DATA [EXTRA.json]
Writes DATA/train.json and DATA/val.json. Rules below are the review's verdicts: which run's labels to trust per clip and
up to which frame. Held-out clips (TEST) never appear. EXTRA.json adds hand or checked labels: {id: {frame: [x, y, r]}} in
crop px (the 256 px middle of the context square)."""
import glob, json, os, sys

data = sys.argv[1]
TEST = {"IMG_0596", "IMG_0975", "IMG_1177", "IMG_1559", "IMG_0830", "IMG_1561", "IMG_1179", "2026-10-05_21B27BAF", "2026-10-05_E0DF8887",
        "yt_fbbuTrspjhE", "2026-09-20_A92852F6-D8FE-4EC2-B049-ED75AA6F05CC", "2026-09-22_3FB05CFF"}
VAL = {"2026-10-04_F8523D6B", "2026-10-04_23B1CEB3", "2026-09-18_F3D1FB48-868E-436E-B4EB-7B454D60A496"}
# id prefix -> (label keys in order of trust, last frame kept, clip weight)
USE = {
    "IMG_0591": (["auto", "tap"], 10 ** 6, 3), "IMG_0976": (["auto", "tap"], 330, 3), "IMG_1178": (["auto"], 480, 3), "IMG_1558": (["auto", "tap"], 420, 3),
    "2026-03-09_08C29B8B": (["auto"], 10 ** 6, 1), "2026-08-26_1193CA88": (["auto"], 10 ** 6, 1), "2026-08-26_4BC95F91": (["auto"], 10 ** 6, 1),
    "2026-08-26_AC99E154": (["auto"], 10 ** 6, 1), "2026-08-26_BAC0A244": (["auto"], 340, 1), "2026-08-26_FF600EFA": (["auto"], 10 ** 6, 1),
    "2026-10-04_100B1719": (["auto"], 10 ** 6, 1), "2026-10-04_23B1CEB3": (["auto"], 10 ** 6, 1), "2026-10-04_59546BD4": (["auto"], 10 ** 6, 1),
    "2026-10-04_DF250CAA": (["auto"], 10 ** 6, 1), "2026-10-04_F8523D6B": (["auto"], 10 ** 6, 1), "snatch-2026-09-20": (["auto"], 10 ** 6, 1),
    "yt_nb4NAMLd_4Y": (["auto"], 10 ** 6, 1), "yt_xOz3maqNte8": (["auto"], 1200, 1), "yt_LN-NVi7oGko": (["auto"], 400, 1), "yt_gD5XGfqdTnY": (["ds"], 500, 1),
}
extra = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
train, val = [], []
for mf in sorted(glob.glob(f"{data}/meta/*.json")):
    m = json.load(open(mf))
    cid = m["id"]
    if cid in TEST:
        continue
    dst = val if cid in VAL else train
    C = 384
    if cid in extra:
        for f, l in extra[cid].items():
            dst.append(dict(img=f"{data}/ctx/{cid}/{int(f):05d}.jpg", p=[l[0] + 64, l[1] + 64, l[2]] if isinstance(l, list) else None, clip=cid, w=extra.get("_w", {}).get(cid, 3), hand=True))
        continue
    if m["set"] in ("gym", "neg"):
        dst += [dict(img=f"{data}/ctx/{cid}/{r['f']:05d}.jpg", p=None, clip=cid, w=1) for r in m["frames"]]
        continue
    if cid not in USE:
        continue
    keys, last, w = USE[cid]
    for r in m["frames"]:
        k = next((k for k in keys if k in r), None)
        if k is None or r["f"] > last:
            continue
        s = C / r["side"]
        dst.append(dict(img=f"{data}/ctx/{cid}/{r['f']:05d}.jpg", p=[(r[k][0] - r["cx"]) * s + C / 2, (r[k][1] - r["cy"]) * s + C / 2, r[k][2] * s], clip=cid, w=w))
json.dump(train, open(f"{data}/train.json", "w"))
json.dump(val, open(f"{data}/val.json", "w"))
for name, rows in (("train", train), ("val", val)):
    clips = {}
    for r in rows:
        c = clips.setdefault(r["clip"], [0, 0]); c[r["p"] is None] += 1
    print(name, "clips", len(clips), "pos", sum(c[0] for c in clips.values()), "neg", sum(c[1] for c in clips.values()))
    for k, c in clips.items(): print("  ", k[:28], c)
