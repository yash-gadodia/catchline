from collections import Counter

from .labels import majority
from .manifest import SUPPORTED

# 15-tech-stack.md 6.1/6.2. Cue metrics only count once coaches agree (kappa) on the primary fault.
TARGETS = [
    ("kappa", ">=", 0.6, "inter-coach Fleiss' kappa on primary fault"),
    ("cue_precision", ">=", 0.8, "CV cue fault == coach primary fault"),
    ("harmful_rate", "<", 0.05, "cue for an absent fault that pushes the wrong way"),
]

# A cue is harmful when the coaches said the cued fault is absent (not the primary or secondary on any rep)
# AND their primary fault is one this cue would make worse. cued fault -> {coach primary: why it is harmful}.
# Provisional: written from 03-fault-taxonomy.md cue directions; needs coach sign-off.
HARMFUL = {
    "jump_forward": {
        "excessive_backward_lean": "'Land where you started' pulls the landing back on a lifter already too far back",
    },
    "catching_forward": {
        "excessive_backward_lean": "'Bar comes to you' moves the catch back on a lifter already behind the bar",
    },
    "bar_forward_off_hips": {
        "excessive_backward_lean": "'Brush the bar up your body' pulls the bar back into a lifter already leaning back",
        "early_arm_bend": "'Brush the bar up your body' invites pulling the bar in with the arms",
    },
    "hips_rise_early": {
        "bar_far_from_shins": "'Chest and bar leave together' lifts the shoulders further behind a bar already out over the toes",
    },
    "excessive_backward_lean": {
        "catching_forward": "'Stay over the bar longer' moves the catch further forward",
        "jump_forward": "'Stay over the bar longer' adds to a forward jump",
    },
}


def ratio(a, b):
    return round(a / b, 4) if b else None


def cv_reps(analysis):
    if not analysis:
        return []
    fps = analysis["video"]["fps"] or 30.0
    return [{"index": r["index"], "start_s": r["startFrame"] / fps, "end_s": r["endFrame"] / fps, "made": r["made"]}
            for r in analysis.get("reps", [])]


def match(n_truth, windows, cv):
    """Pair truth reps (1..n) with CV reps: by time overlap when every truth rep has a window, else in order.
    Returns ({truth_rep: cv_rep}, unmatched cv reps)."""
    pairs = {}
    if windows and len(windows) == n_truth:
        cands = sorted(((min(w[1], c["end_s"]) - max(w[0], c["start_s"]), t + 1, c["index"])
                        for t, w in enumerate(windows) for c in cv), reverse=True)
        used = set()
        for ov, t, ci in cands:
            if ov > 0 and t not in pairs and ci not in used:
                pairs[t] = next(c for c in cv if c["index"] == ci)
                used.add(ci)
    else:
        pairs = {t + 1: c for t, c in enumerate(cv[:n_truth])}
    used = {c["index"] for c in pairs.values()}
    return pairs, [c for c in cv if c["index"] not in used]


def score_clip(clip, result, cons):
    analysis = (result or {}).get("analysis")
    failure = (analysis or {}).get("failure")
    status = (result or {}).get("status", "missing")
    cue = (analysis or {}).get("cue")
    lab = cons.get(clip["id"])
    reps = {k: v for k, v in (lab or {}).get("reps", {}).items() if k > 0}
    n_truth = clip["reps"] if clip["reps"] is not None else (len(reps) if lab else None)
    cv = cv_reps(analysis)
    pairs, fp = match(n_truth or 0, clip["windows"], cv)
    rec = {
        "id": clip["id"], "movement": clip["movement"], "angle": clip["angle"],
        "supported": clip["movement"] in SUPPORTED, "status": status,
        "failure": failure["reason"] if failure else ("crash" if status == "error" else None),
        "labelled": lab is not None, "agreed": bool(lab and lab["agreed"]),
        "provisional": bool(lab and lab["provisional"]), "coaches": (lab or {}).get("coaches", []),
        "truth_reps": n_truth, "cv_reps": len(cv), "fp_reps": len(fp),
        "reps": [{"rep": t, "cv_index": pairs[t]["index"] if t in pairs else None,
                  "made": reps.get(t, {}).get("made"), "cv_made": pairs[t]["made"] if t in pairs else None,
                  "primary": reps.get(t, {}).get("primary")} for t in range(1, (n_truth or 0) + 1)],
        "cue": cue["faultId"] if cue else None,
    }
    primaries = [r["primary"] for r in rec["reps"] if r["primary"] is not None]
    cue_rep = None
    if cue:
        cue_rep = next((r for r in rec["reps"] if r["cv_index"] == cue["evidence"]["rep"]), None)
    coach_primary = cue_rep["primary"] if cue_rep and cue_rep["primary"] else (majority(primaries)[0] or (primaries[0] if primaries else None))
    rec["coach_primary"] = coach_primary
    if cue and coach_primary is not None:
        mentioned = {v for r in reps.values() for v in (r["primary"], r["secondary"]) if v}
        wrong_way = sorted(set(primaries) & set(HARMFUL.get(cue["faultId"], {})))
        rec["cue_correct"] = cue["faultId"] == coach_primary
        rec["harmful"] = cue["faultId"] not in mentioned and bool(wrong_way)
        rec["harm_why"] = HARMFUL[cue["faultId"]][wrong_way[0]] if rec["harmful"] else None
    return rec


def block(recs):
    """Metrics over a list of per-clip records (all assumed scorable)."""
    counted = [r for r in recs if r["truth_reps"] is not None]
    tp = sum(1 for r in counted for x in r["reps"] if x["cv_index"] is not None)
    n_truth = sum(r["truth_reps"] for r in counted)
    n_cv = sum(r["cv_reps"] for r in counted)
    made_pairs = [(x["made"], x["cv_made"]) for r in recs for x in r["reps"] if x["made"] is not None and x["cv_index"] is not None]
    made_conf = Counter(("made" if a else "missed", "made" if b else "missed") for a, b in made_pairs)
    with_reps = [r for r in recs if (r["truth_reps"] or 0) > 0]
    cued = [r for r in recs if r["cue"] and r["coach_primary"] is not None]
    return {
        "clips": len(recs),
        "rep_count_exact": ratio(sum(r["cv_reps"] == r["truth_reps"] for r in counted), len(counted)),
        "rep_recall": ratio(tp, n_truth), "rep_precision": ratio(tp, n_cv),
        "rep_count_mae": ratio(sum(abs(r["cv_reps"] - r["truth_reps"]) for r in counted), len(counted)),
        "truth_reps": n_truth, "cv_reps": n_cv, "matched_reps": tp,
        "made_agreement": ratio(sum(a == b for a, b in made_pairs), len(made_pairs)), "made_n": len(made_pairs),
        "made_confusion": {f"{a}->{b}": v for (a, b), v in sorted(made_conf.items())},
        "abstain_rate": ratio(sum(r["cue"] is None for r in with_reps), len(with_reps)), "abstain_n": len(with_reps),
        "failures": dict(Counter(r["failure"] for r in recs if r["failure"])),
        "cued_with_fault_labels": len(cued),
        "cue_precision": ratio(sum(r["cue_correct"] for r in cued), len(cued)),
        "harmful_rate": ratio(sum(r["harmful"] for r in cued), len(cued)),
    }


def target_status(name, value, kappa_ok):
    op, thr = next((o, t) for n, o, t, _ in TARGETS if n == name)
    if value is None:
        return "not_measured"
    ok = value >= thr if op == ">=" else value < thr
    if name != "kappa" and not kappa_ok:
        return "blocked_by_kappa"
    return "pass" if ok else "fail"


def score(clips, results, cons, kappa):
    per = [score_clip(c, results.get(c["id"]), cons) for c in clips]
    scored = [r for r in per if r["labelled"] and r["agreed"]]
    sup = [r for r in scored if r["supported"]]
    unsup = [r for r in scored if not r["supported"]]
    m = {
        "clips_in_manifest": len(per),
        "labelled": sum(r["labelled"] for r in per),
        "excluded_coach_disagreement": sum(r["labelled"] and not r["agreed"] for r in per),
        "provisional_clips": sum(r["provisional"] for r in scored),
        "pipeline_errors": sum(r["status"] == "error" for r in per),
        "kappa": round(kappa, 4) if kappa is not None else None,
        "supported": block(sup),
        "unsupported_correct_reject": ratio(sum(r["cv_reps"] == 0 for r in unsup), len(unsup)),
        "unsupported_n": len(unsup),
        "per_movement": {mv: block([r for r in scored if r["movement"] == mv])
                         for mv in sorted({r["movement"] or "unknown" for r in scored})},
    }
    cued = [r for r in sup if r["coach_primary"] is not None]
    faults = sorted({r["coach_primary"] for r in cued} | {r["cue"] for r in cued if r["cue"]})
    m["per_fault"] = {f: {"coach_n": sum(r["coach_primary"] == f for r in cued), "cv_n": sum(r["cue"] == f for r in cued),
                          "tp": sum(r["cue"] == f == r["coach_primary"] for r in cued)} for f in faults}
    for v in m["per_fault"].values():
        v["precision"], v["recall"] = ratio(v["tp"], v["cv_n"]), ratio(v["tp"], v["coach_n"])
    m["fault_confusion"] = {f"{a}->{b}": v for (a, b), v in sorted(Counter((r["coach_primary"], r["cue"] or "none") for r in cued).items())}
    kappa_ok = target_status("kappa", m["kappa"], True) == "pass"
    vals = {"kappa": m["kappa"], "cue_precision": m["supported"]["cue_precision"], "harmful_rate": m["supported"]["harmful_rate"]}
    m["targets"] = [{"name": n, "op": o, "threshold": t, "what": w, "value": vals[n], "status": target_status(n, vals[n], kappa_ok)}
                    for n, o, t, w in TARGETS]
    m["gate_pass"] = all(t["status"] == "pass" for t in m["targets"])
    return m, per
