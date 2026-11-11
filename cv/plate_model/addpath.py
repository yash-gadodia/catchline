"""Adds the rule tracker's drawn path point to the extracted meta: autop / tapp = [x, y] in decoded-frame px for frames
whose final path point has src 'plate' (what the app draws), next to auto / tap (the raw follow centre and size).
  python addpath.py DATA"""
import glob, json, os, sys

H = os.path.expanduser("~")
data = sys.argv[1]
for mf in sorted(glob.glob(f"{data}/meta/*.json")):
    m = json.load(open(mf))
    cid = m["id"]
    runs = {"autop": f"{H}/catchline-v40/out4/{cid}" if cid.startswith("IMG") else f"{H}/catchline-v40-plate/v12/{cid}", "tapp": f"{H}/catchline-v40-plate/r1/{cid}"}
    by = {r["f"]: r for r in m["frames"]}
    n = {}
    for key, d in runs.items():
        if not os.path.exists(f"{d}/analysis.json") or "W" not in m:
            continue
        a = json.load(open(f"{d}/analysis.json"))
        W = m["W"]; Hh = W * a["video"]["height"] / a["video"]["width"]
        for rep in a.get("reps") or []:
            for p in rep.get("path") or []:
                if p["frame"] in by:
                    by[p["frame"]][key] = [p["x"] * W, p["y"] * Hh, p.get("src")]
                    n[key + ":" + str(p.get("src"))] = n.get(key + ":" + str(p.get("src")), 0) + 1
    json.dump(m, open(mf, "w"))
    if n: print(cid, n)
