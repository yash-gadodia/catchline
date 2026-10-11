import json
import os
from collections import Counter, defaultdict

from .manifest import clip_id, norm_movement

# 03-fault-taxonomy.md codes -> the snake ids the pipeline emits (rules.py) or will emit
FAULT_ALIASES = {
    "S1": "early_arm_bend", "S2": "hips_rise_early", "S3": "bar_forward_off_hips", "S4": "jump_forward",
    "S5": "incomplete_extension", "S6": "slow_turnover", "S7": "catching_forward", "S8": "catching_high",
    "S9": "excessive_backward_lean", "S10": "bar_far_from_shins", "S11": "rounded_back",
    "S12": "bar_forward_at_knees", "S13": "start_hip_height", "S14": "soft_overhead",
    "S15": "wide_feet_valgus", "S16": "rushing_first_pull",
}
# the labelling tool's field names on the left, the documented schema's on the right
FIELD_ALIASES = {"outcome": "made", "primary": "primary_fault", "secondary": "secondary_fault", "cue": "cue_text"}


def norm_fault(v):
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()
    return FAULT_ALIASES.get(s.upper(), s.lower().replace(" ", "_").replace("-", "_"))


def norm_made(v):
    if isinstance(v, bool) or v is None:
        return v
    s = str(v).strip().lower()
    if s in ("made", "make", "true", "yes", "y", "1"):
        return True
    if s in ("missed", "miss", "false", "no", "n", "0"):
        return False
    return None


def normalise(row):
    r = {FIELD_ALIASES.get(k, k): v for k, v in row.items()}
    rep = r.get("rep")
    return {"clip_id": clip_id(r["clip_id"]), "coach": " ".join(str(r.get("coach", "")).split()).lower(),
            "rep": int(rep) if rep not in (None, "") else 1, "movement": norm_movement(r.get("movement")),
            "made": norm_made(r.get("made")), "primary": norm_fault(r.get("primary_fault")),
            "secondary": norm_fault(r.get("secondary_fault")), "cue": r.get("cue_text"),
            "confidence": r.get("confidence")}


def load(path):
    """Latest row per (clip, coach, rep) wins; skipped rows are dropped."""
    latest = {}
    if not path or not os.path.exists(os.path.expanduser(path)):
        return []
    for line in open(os.path.expanduser(path)):
        if not line.strip():
            continue
        raw = json.loads(line)
        if raw.get("skipped"):
            continue
        r = normalise(raw)
        latest[(r["clip_id"], r["coach"], r["rep"])] = r
    return list(latest.values())


def majority(values):
    """Most common value and its count; (None, 0) on a tie for first."""
    c = Counter(values).most_common()
    if not c or (len(c) > 1 and c[0][1] == c[1][1]):
        return None, 0
    return c[0]


def consensus(rows):
    """Per clip: coaches, provisional (single coach), agreed, and per-rep majority labels.
    With 2+ coaches every rep needs 2 coaches agreeing on the primary fault, else the clip is not agreed."""
    by_clip = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by_clip[r["clip_id"]][r["rep"]].append(r)
    out = {}
    for cid, reps in by_clip.items():
        coaches = {r["coach"] for rs in reps.values() for r in rs}
        multi = len(coaches) >= 2
        agreed, cons = True, {}
        for rep, rs in sorted(reps.items()):
            primary, n = majority([r["primary"] for r in rs])
            if multi and n < 2:
                agreed = False
            made, _ = majority([r["made"] for r in rs if r["made"] is not None])
            secondary, _ = majority([r["secondary"] for r in rs if r["secondary"] is not None])
            movement, _ = majority([r["movement"] for r in rs if r["movement"]])
            cons[rep] = {"made": made, "primary": primary, "secondary": secondary, "movement": movement,
                         "n": len(rs), "primaries": [r["primary"] for r in rs]}
        out[cid] = {"coaches": sorted(coaches), "provisional": not multi, "agreed": agreed, "reps": cons}
    return out


def fleiss_kappa(items):
    """items: list of rating lists (one category per rater; raters per item may vary, >= 2)."""
    items = [i for i in items if len(i) >= 2]
    if not items:
        return None
    totals, p_bar = Counter(), 0.0
    for ratings in items:
        n = len(ratings)
        c = Counter(ratings)
        totals.update(c)
        p_bar += sum(v * (v - 1) for v in c.values()) / (n * (n - 1))
    p_bar /= len(items)
    N = sum(totals.values())
    p_e = sum((v / N) ** 2 for v in totals.values())
    if p_e == 1:
        return 1.0
    return (p_bar - p_e) / (1 - p_e)


def kappa_items(rows):
    """Primary-fault ratings per (clip, rep) with 2+ coaches and every rating present."""
    by = defaultdict(list)
    for r in rows:
        by[(r["clip_id"], r["rep"])].append(r["primary"])
    return [v for v in by.values() if len(v) >= 2 and all(x is not None for x in v)]
