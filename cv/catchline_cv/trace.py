"""A lift's trace: the numbers the pipeline read from the clip, kept so an old lift can be re-analysed after the video
is gone (owner decision 16-10-2026: keypoints and bar track only, no faces, no video).

recording() runs the pipeline as normal and keeps every value it took from the video: the probe, the lifter's
keypoints (head points dropped, as at the pose step), the camera path, each window's stabilisation, the plate fits
and the plate track. replaying(trace) runs the same pipeline with those values in place of the video, so everything
after pose (phases, measurements, rules, notes, the cue) is the current code's. With the code unchanged a replay
reproduces the analysis exactly. When the new code asks the video for something the trace does not hold (a rep
window that moved, a plate on another frame), the nearest recorded value stands in and the replay counts a miss.

No keyframe JPEGs are made on a replay; the lift keeps the stills it already has."""
import contextlib
import gzip
import json

import numpy as np

from . import ANALYSIS_VERSION, lifts, pipeline
from .pose import HEAD

TRACE_VERSION = 1


class TraceMissing(Exception):
    """The trace cannot answer a call the pipeline needs (a movement family it was never run for)."""


class Frame(np.ndarray):
    """A decoded frame that remembers its index in the clip, so its plate fits can be keyed by frame."""
    index = -1


class Placeholder:
    """Stands in for a frame on a replay: nothing reads its pixels, everything that would is replayed."""

    def __init__(self, index, shape):
        self.index, self.shape = index, shape


def enc(o):
    if isinstance(o, np.ndarray):
        return {"$nd": [str(o.dtype), list(o.shape), o.ravel().tolist()]}
    if isinstance(o, np.generic):
        return {"$ns": [str(o.dtype), o.item()]}
    if isinstance(o, tuple):
        return {"$t": [enc(v) for v in o]}
    if isinstance(o, list):
        return [enc(v) for v in o]
    if isinstance(o, dict):
        return {k: enc(v) for k, v in o.items()}
    return o


def dec(o):
    if isinstance(o, list):
        return [dec(v) for v in o]
    if isinstance(o, dict):
        if "$nd" in o:
            dtype, shape, flat = o["$nd"]
            return np.array(flat, dtype=dtype).reshape(shape)
        if "$ns" in o:
            return np.dtype(o["$ns"][0]).type(o["$ns"][1])
        if "$t" in o:
            return tuple(dec(v) for v in o["$t"])
        return {k: dec(v) for k, v in o.items()}
    return o


def key(o):
    return json.dumps(enc(o), sort_keys=True)


def dumps(trace):
    return gzip.compress(json.dumps(trace, separators=(",", ":")).encode(), mtime=0)


def loads(data):
    return json.loads(gzip.decompress(data))


# (module, name) the pipeline reaches the video through
TARGETS = [(pipeline, n) for n in ("probe", "load_pose", "select_lifter", "camera_path", "frames", "stabilise",
                                   "find_plates", "refine_plate", "track_plate", "foreground_mask", "export_keyframes")]
TARGETS += [(lifts, n) for n in ("frames", "stabilise", "foreground_mask")]


@contextlib.contextmanager
def patched(funcs):
    saved = [(m, n, getattr(m, n)) for m, n in TARGETS]
    try:
        for m, n in TARGETS:
            if n in funcs:
                setattr(m, n, funcs[n])
        yield
    finally:
        for m, n, f in saved:
            setattr(m, n, f)


class Recorder:
    def __init__(self):
        self.calls = {}
        self.pose_keys = {}
        self.shapes = {}
        self.meta = None

    def put(self, name, k, out):
        self.calls.setdefault(name, {}).setdefault(k, []).append(enc(out))

    def funcs(self):
        orig = {n: getattr(m, n) for m, n in TARGETS if m is pipeline}
        rec = self

        def probe(clip):
            rec.meta = orig["probe"](clip)
            return rec.meta

        def load_pose(clip, cache_dir, two_pass=False, external=None):
            people, shape = orig["load_pose"](clip, cache_dir, two_pass=two_pass, external=external)
            rec.pose_keys[id(people)] = (people, str(two_pass))
            rec.shapes[str(two_pass)] = {"shape": list(shape) if shape is not None else None, "n": len(people)}
            return people, shape

        def pose_key(people):
            return rec.pose_keys[id(people)][1]

        def select_lifter(people, hanging=False):
            k, ks, boxes = orig["select_lifter"](people, hanging=hanging)
            k = k.copy()
            k[:, list(HEAD)] = np.nan
            rec.put("select_lifter", f"{pose_key(people)}:{hanging}", (k, ks, boxes))
            return k, ks, boxes

        def camera_path(clip, people, infer_h):
            out = orig["camera_path"](clip, people, infer_h)
            rec.put("camera_path", pose_key(people), out)
            return out

        def frames(path, height, start=0, count=None, fps=30.0):
            n = 0
            for i, im in orig["frames"](path, height, start, count, fps):
                f = im.view(Frame)
                f.index = i
                n += 1
                yield i, f
            rec.put("frames", f"{height}:{start}:{count}", n)

        def stabilise(fr, masks):
            out = orig["stabilise"](fr, masks)
            rec.put("stabilise", f"{fr[0].index}:{len(fr)}", out)
            return out

        def find_plates(img, *a, **kw):
            out = orig["find_plates"](img, *a, **kw)
            rec.put("find_plates", str(img.index), out)
            return out

        def refine_plate(img, plate):
            k = key(plate)
            out = orig["refine_plate"](img, plate)
            rec.put("refine_plate", k, out)
            return out

        def track_plate(fr, start, plate, stop=None):
            out = orig["track_plate"](fr, start, plate, stop)
            rec.put("track_plate", f"{fr[0].index}:{len(fr)}:{start}:{stop}", out)
            return out

        return {"probe": probe, "load_pose": load_pose, "select_lifter": select_lifter, "camera_path": camera_path,
                "frames": frames, "stabilise": stabilise, "find_plates": find_plates, "refine_plate": refine_plate,
                "track_plate": track_plate}

    def trace(self, analysis=None, pose_source="server"):
        """The trace dict: fps and frame size (meta), the shape pose ran at, the lifter's keypoints, camera path and
        stabilisation, the plate fits and track, plus the scale and the analysis version it produced."""
        for out in self.calls.get("select_lifter", {}).values():
            for o in out:
                k = dec(o)[0]
                assert np.isnan(k[:, list(HEAD)]).all(), "head keypoints must never be stored"
        return {"traceVersion": TRACE_VERSION, "analysisVersion": ANALYSIS_VERSION, "poseSource": pose_source,
                "meta": self.meta, "pose": self.shapes,
                "scale": analysis.get("pxPerCm") if analysis else None, "calls": self.calls}


@contextlib.contextmanager
def recording():
    rec = Recorder()
    with patched(rec.funcs()):
        yield rec


class Replayer:
    def __init__(self, trace):
        if trace.get("traceVersion") != TRACE_VERSION:
            raise TraceMissing(f"trace version {trace.get('traceVersion')}")
        self.t = trace
        self.calls = trace["calls"]
        self.used = {}
        self.misses = []

    def get(self, name, k):
        """The recorded output for this call (in call order for repeats), or None."""
        outs = self.calls.get(name, {}).get(k)
        if not outs:
            return None
        i = self.used.get((name, k), 0)
        self.used[(name, k)] = i + 1
        return dec(outs[min(i, len(outs) - 1)])

    def miss(self, what):
        self.misses.append(what)

    def nearest(self, name, index):
        keys = [int(k) for k in self.calls.get(name, {})]
        return min(keys, key=lambda k: (abs(k - index), k)) if keys else None

    def funcs(self):
        rp = self
        meta = self.t["meta"]

        def probe(clip):
            return dict(meta)

        def load_pose(clip, cache_dir, two_pass=False, external=None):
            p = rp.t["pose"].get(str(two_pass))
            if p is None:
                raise TraceMissing(f"no pose for two_pass={two_pass}")
            people = PeopleStub([] for _ in range(p["n"]))
            people.key = str(two_pass)
            return people, tuple(p["shape"]) if p["shape"] is not None else None

        def select_lifter(people, hanging=False):
            out = rp.get("select_lifter", f"{people.key}:{hanging}")
            if out is None:
                raise TraceMissing(f"no lifter for {people.key}:{hanging}")
            return out

        def camera_path(clip, people, infer_h):
            out = rp.get("camera_path", people.key)
            if out is None:
                raise TraceMissing("no camera path")
            return out

        def frames(path, height, start=0, count=None, fps=30.0):
            n = rp.get("frames", f"{height}:{start}:{count}")
            shape = next(iter(rp.t["pose"].values()))["shape"]
            if n is None:
                rp.miss(f"frames {start}+{count}")
                total = meta.get("frameCount") or next(iter(rp.t["pose"].values()))["n"]
                n = max(0, min(count or total, total - start))
            for i in range(start, start + n):
                yield i, Placeholder(i, tuple(shape))

        def stabilise(fr, masks):
            out = rp.get("stabilise", f"{fr[0].index}:{len(fr)}")
            if out is not None:
                return out
            rp.miss(f"stabilise {fr[0].index}+{len(fr)}")
            return composed(fr[0].index, len(fr)), [0] * max(0, len(fr) - 1)

        def composed(s0, n):
            """Window affines (frame -> window's first frame) from a recorded window that covers it, else from the
            whole-clip camera path."""
            for k, outs in rp.calls.get("stabilise", {}).items():
                a, m = (int(v) for v in k.split(":"))
                if a <= s0 and s0 + n <= a + m:
                    Ms = dec(outs[0])[0]
                    return rebase(Ms[s0 - a: s0 - a + n])
            path = dec(next(iter(rp.calls["camera_path"].values()))[0])
            return rebase([path[min(f, len(path) - 1)] for f in range(s0, s0 + n)])

        def find_plates(img, *a, **kw):
            out = rp.get("find_plates", str(img.index))
            if out is not None:
                return out
            near = rp.nearest("find_plates", img.index)
            rp.miss(f"find_plates {img.index}")
            return dec(rp.calls["find_plates"][str(near)][0]) if near is not None else []

        def refine_plate(img, plate):
            out = rp.get("refine_plate", key(plate))
            if out is None and key(plate) not in rp.calls.get("refine_plate", {}):
                rp.miss(f"refine_plate {img.index}")
            return out

        def track_plate(fr, start, plate, stop=None):
            s0 = fr[0].index
            out = rp.get("track_plate", f"{s0}:{len(fr)}:{start}:{stop}")
            if out is not None:
                return out
            rp.miss(f"track_plate {s0 + start}")
            centres, scores = np.full((len(fr), 2), np.nan), np.full(len(fr), np.nan)
            for k, outs in rp.calls.get("track_plate", {}).items():
                a, m, st = (int(v) for v in k.split(":")[:3])
                c, s = dec(outs[0])
                for f in range(max(s0 + start, a + st), min(s0 + len(fr), a + m)):
                    centres[f - s0], scores[f - s0] = c[f - a], s[f - a]
                break
            centres[start], scores[start] = np.asarray(plate["centre"], float), plate["score"]
            return centres, scores

        return {"probe": probe, "load_pose": load_pose, "select_lifter": select_lifter, "camera_path": camera_path,
                "frames": frames, "stabilise": stabilise, "find_plates": find_plates, "refine_plate": refine_plate,
                "track_plate": track_plate, "foreground_mask": lambda *a, **kw: None,
                "export_keyframes": lambda ctx, jobs: None}


class PeopleStub(list):
    """Per-frame people on a replay: one empty list per frame (only the lifter is kept, as select_lifter's output)."""
    key = ""


def rebase(Ms):
    """Affines frame -> clip reference re-expressed as frame -> the first of these frames."""
    if not Ms:
        return []
    from .geometry import invert_affine
    inv0 = np.vstack([invert_affine(Ms[0]), [0, 0, 1]])
    return [(inv0 @ np.vstack([M, [0, 0, 1]]))[:2] for M in Ms]


@contextlib.contextmanager
def replaying(trace):
    rp = Replayer(trace)
    with patched(rp.funcs()):
        yield rp
