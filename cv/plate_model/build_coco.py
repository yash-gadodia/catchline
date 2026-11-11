"""The same training rows as PlateNet, as a whole-frame COCO set for a full-frame detector (RF-DETR).
  python build_coco.py DATA OUT [--every 2]
One class, "plate": the near plate's circle as a box. Frames from plate-free clips carry no box. Images are symlinks to
DATA/full (640 px frames)."""
import json, os, sys

data, out = sys.argv[1:3]
every = int(sys.argv[sys.argv.index("--every") + 1]) if "--every" in sys.argv else 2
metas = {}
for split, src in (("train", "train"), ("valid", "val"), ("test", "val")):
    rows = json.load(open(f"{data}/{src}.json"))
    rows = [r for i, r in enumerate(rows) if i % every == 0 or r.get("hand")]
    os.makedirs(f"{out}/{split}", exist_ok=True)
    images, anns = [], []
    for r in rows:
        cid = r["clip"]; f = int(os.path.basename(r["img"])[:-4])
        full = f"{data}/full/{cid}/{f:05d}.jpg"
        if not os.path.exists(full):
            continue
        if cid not in metas:
            m = json.load(open(f"{data}/meta/{cid}.json"))
            metas[cid] = ({x["f"]: x for x in m["frames"]}, json.load(open(f"{data}/full/{cid}/size.json")))
        by, size = metas[cid]
        name = f"{cid}_{f:05d}.jpg"
        if not os.path.exists(f"{out}/{split}/{name}"):
            os.symlink(os.path.abspath(full), f"{out}/{split}/{name}")
        s = size["scale"]
        images.append(dict(id=len(images) + 1, file_name=name, width=round(size["W"] * s), height=round(size["H"] * s)))
        if r["p"] is not None:
            row = by[f]
            k = row["side"] / 384
            x, y, rad = ((r["p"][0] - 192) * k + row["cx"]) * s, ((r["p"][1] - 192) * k + row["cy"]) * s, r["p"][2] * k * s
            anns.append(dict(id=len(anns) + 1, image_id=len(images), category_id=1, bbox=[x - rad, y - rad, 2 * rad, 2 * rad], area=4 * rad * rad, iscrowd=0))
    json.dump(dict(images=images, annotations=anns, categories=[dict(id=1, name="plate", supercategory="none")]), open(f"{out}/{split}/_annotations.coco.json", "w"))
    print(split, len(images), "images", len(anns), "boxes")
