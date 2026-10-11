import glob
import os
import re

FOLDER_MOVEMENT = {
    "power-snatch": "power_snatch",
    "snatch": "snatch",
    "bar-muscle-up": "bar_muscle_up",
    "kipping-pull-up": "kipping_pull_up",
    "ring-muscle-up": "ring_muscle_up",
    "wall-walk": "wall_walk",
}
# movements the pipeline analyses; everything else should come back as a failure (correct reject)
SUPPORTED = {"snatch", "power_snatch"}
VIDEO_EXT = (".mov", ".mp4", ".m4v")


def norm_movement(s):
    if s is None:
        return None
    s = re.sub(r"[\s-]+", "_", str(s).strip().lower())
    return s


def clip_id(s):
    return os.path.splitext(os.path.basename(str(s)))[0]


def parse_result(s):
    s = (s or "").strip().lower()
    if s.startswith("made"):
        return True
    if s.startswith("missed"):
        return False
    return None


def parse_windows(s):
    out = []
    for part in (s or "").split(","):
        a, _, b = part.strip().partition("-")
        try:
            out.append([float(a), float(b)])
        except ValueError:
            pass
    return out


def parse_index(path):
    root = os.path.dirname(os.path.abspath(path))
    clips = []
    for line in open(path).read().splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 13 or cells[0] in ("Angle", "") or cells[0].startswith("---"):
            continue
        m = re.search(r"\]\(([^)]+)\)", cells[4])
        if not m:
            continue
        rel = m.group(1)
        clips.append({
            "id": clip_id(rel),
            "path": os.path.join(root, rel),
            "movement": FOLDER_MOVEMENT.get(rel.split("/")[0], norm_movement(cells[1])),
            "angle": cells[0],
            "reps": int(cells[5]) if cells[5].isdigit() else None,
            "made": parse_result(cells[6]),
            "result": cells[6],
            "windows": parse_windows(cells[11]),
        })
    return clips


def from_video(path):
    folder = re.sub(r"-\d{4}-\d{2}-\d{2}$", "", clip_id(path))
    return {"id": clip_id(path), "path": os.path.abspath(path), "movement": FOLDER_MOVEMENT.get(folder),
            "angle": None, "reps": None, "made": None, "result": None, "windows": []}


def load(paths):
    """paths: INDEX.md files, video files or globs. Later duplicates of a clip id are dropped."""
    clips, seen = [], set()
    for p in paths:
        p = os.path.expanduser(p)
        if p.endswith(".md"):
            found = parse_index(p)
        else:
            found = [from_video(f) for f in sorted(glob.glob(p)) if f.lower().endswith(VIDEO_EXT)]
        for c in found:
            if c["id"] not in seen:
                seen.add(c["id"])
                clips.append(c)
    return clips


def provisional_labels(clips, coach="index-provisional"):
    """One row per rep from the manifest's movement + made/missed; no fault labels (primary_fault is null,
    which means 'not labelled', not 'no fault'). A clip with 0 reps gets one rep-0 row."""
    rows = []
    for c in clips:
        for rep in range(1, c["reps"] + 1) if c["reps"] else [0]:
            rows.append({"clip_id": c["id"], "coach": coach, "rep": rep, "movement": c["movement"],
                         "made": c["made"] if rep else None, "primary_fault": None, "secondary_fault": None,
                         "cue_text": None, "confidence": None, "source": c["result"]})
    return rows
