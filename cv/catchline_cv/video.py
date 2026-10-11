import json
import subprocess

import numpy as np


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,nb_frames:stream_side_data=rotation",
         "-of", "json", path],
        check=True, capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]
    rot = 0
    for sd in s.get("side_data_list", []):
        if "rotation" in sd:
            rot = int(sd["rotation"])
    w, h = int(s["width"]), int(s["height"])
    if abs(rot) % 180 == 90:
        w, h = h, w
    num, den = s["r_frame_rate"].split("/")
    return {"width": w, "height": h, "fps": float(num) / float(den),
            "frameCount": int(s.get("nb_frames", 0)), "rotation": rot}


def frames(path, height, start=0, count=None, fps=30.0):
    """Yield (index, BGR frame) with rotation applied (ffmpeg autorotates) scaled to `height` px tall."""
    meta = probe(path)
    w = int(round(meta["width"] * height / meta["height"] / 2)) * 2
    cmd = ["ffmpeg", "-v", "error"]
    if start:
        # half a frame early: iPhone timestamps (600 timescale) put frame `start` just before start / fps, and an
        # exact seek then skipped it (the window began one frame late on the original, not on a re-encode)
        cmd += ["-ss", f"{(start - 0.5) / fps:.4f}"]
    cmd += ["-i", path]
    if count:
        cmd += ["-frames:v", str(count)]
    cmd += ["-vf", f"scale={w}:{height}", "-pix_fmt", "bgr24", "-f", "rawvideo", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = w * height * 3
    i = start
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield i, np.frombuffer(buf, np.uint8).reshape(height, w, 3)
            i += 1
    finally:
        proc.stdout.close()
        proc.wait()
