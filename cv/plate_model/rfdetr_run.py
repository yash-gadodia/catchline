"""RF-DETR Nano (Apache 2.0 code and weights) as the full-frame alternative to PlateNet.
  python rfdetr_run.py train COCO_DIR OUT [epochs]
  python rfdetr_run.py predict DATA WEIGHTS HAND.json OUT.json     boxes on the 640 px frames -> [[conf, x, y, r], ...]
                                                                   per frame in decoded-frame px, for evaltest.py --preds"""
import glob, json, os, sys

if __name__ == "__main__":
    from rfdetr import RFDETRNano
    if sys.argv[1] == "train":
        model = RFDETRNano()
        model.train(dataset_dir=sys.argv[2], output_dir=sys.argv[3], epochs=int(sys.argv[4]) if len(sys.argv) > 4 else 8, batch_size=8,
                    grad_accum_steps=1, num_workers=2, tensorboard=False, progress_bar=None)
    else:
        from PIL import Image
        data, weights, hand, out = sys.argv[2:6]
        model = RFDETRNano(pretrain_weights=weights)
        want = {cid: {int(f) for f in d} for cid, d in json.load(open(hand)).items()}
        for cid in ("IMG_1179", "2026-09-20_A92852F6-D8FE-4EC2-B049-ED75AA6F05CC", "2026-09-22_3FB05CFF"):
            want[cid] = {int(os.path.basename(p)[:-4]) for p in glob.glob(f"{data}/full/{cid}/*.jpg")}
        if os.path.exists(os.path.expanduser("~/catchline-plate-data/label1/manifest.json")):
            for m in json.load(open(os.path.expanduser("~/catchline-plate-data/label1/manifest.json"))):
                want.setdefault(m["clip"], set()).add(m["frame"])
        res = {}
        for cid, fs in want.items():
            if not os.path.exists(f"{data}/full/{cid}/size.json"):
                continue
            s = json.load(open(f"{data}/full/{cid}/size.json"))["scale"]
            res[cid] = {}
            for f in sorted(fs):
                p = f"{data}/full/{cid}/{f:05d}.jpg"
                if not os.path.exists(p):
                    continue
                d = model.predict(Image.open(p).convert("RGB"), threshold=0.05)
                c = sorted(zip(d.confidence.tolist(), d.xyxy.tolist()), reverse=True)[:5]
                res[cid][str(f)] = [[cf, (b[0] + b[2]) / 2 / s, (b[1] + b[3]) / 2 / s, max(b[2] - b[0], b[3] - b[1]) / 2 / s] for cf, b in c]
        json.dump(res, open(out, "w"))
        print({k: len(v) for k, v in res.items()})
