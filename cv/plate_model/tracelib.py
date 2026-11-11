import gzip, json
import numpy as np


def dec(o):
    if isinstance(o, dict):
        if "$nd" in o:
            _, shape, flat = o["$nd"]
            return np.array([np.nan if v is None else v for v in flat], dtype=np.float64).reshape(shape)
        if "$t" in o:
            return [dec(v) for v in o["$t"]]
        return {k: dec(v) for k, v in o.items()}
    if isinstance(o, list):
        return [dec(v) for v in o]
    return o


def load_trace(path):
    t = json.load(gzip.open(path))
    calls = t["calls"]
    sel = dec(next(iter(calls["select_lifter"].values()))[0])
    follows = {}
    for key, outs in (calls.get("follow_plate") or {}).items():
        centres, src, fit, start = dec(outs[0])
        s0, n, seed = (int(v) for v in key.split(":")[:3])
        follows[key] = dict(s0=s0, n=n, seed=seed, centres=np.asarray(centres), src=np.asarray(src), fit=np.asarray(fit), start=start)
    return dict(meta=t["meta"], shape=t["pose"][next(iter(t["pose"]))]["shape"] if isinstance(next(iter(t["pose"].values())), dict) else None, lifter=sel, follows=follows, raw=t)
