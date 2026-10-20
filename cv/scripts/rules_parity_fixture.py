"""Write src/analysis/device/rules-parity.json: synthetic rule inputs with rules.py's outputs, which
src/analysis/device/rules.test.ts asserts rules.ts reproduces exactly. Run: cd cv && uv run python scripts/rules_parity_fixture.py"""
import json
import random
from pathlib import Path

from catchline_cv import rules
from catchline_cv.pipeline import cue_confidence

OUT = Path(__file__).resolve().parents[2] / "src/analysis/device/rules-parity.json"
rng = random.Random(20261018)
# exact multiples of the threshold (k/8) make rounded-severity ties, the threshold itself and PRESENT boundaries
STEPS = [k / 8 for k in range(0, 25)]


def value(fid):
    thr = rules.RULES[fid]["threshold"]
    roll = rng.random()
    if roll < 0.12:
        return None
    if roll < 0.55:
        return thr * rng.choice(STEPS)
    if roll < 0.65:
        return round(rng.uniform(-thr, 3 * thr), 2)
    return rng.uniform(-0.5 * thr, 2.5 * thr)


def values(movement):
    ids = rules.FAULTS[movement]
    out = {fid: value(fid) for fid in ids}
    if rng.random() < 0.15:
        del out[rng.choice(ids)]
    return out


def detail(fid):
    d = {}
    if rng.random() < 0.7:
        d.update({"trunk_change": rng.uniform(0, 30), "hip_max": rng.uniform(150, 185), "elbow_land": rng.uniform(140, 181),
                  "gap_s": rng.choice([None, rng.uniform(0, 0.4), 0.125, 0.135])})
    if rng.random() < 0.5:
        d["side"] = rng.choice(["left", "right"])
    return d


def rep(movement):
    vals = values(movement)
    return {"values": vals, "detail": {fid: detail(fid) for fid in vals if rng.random() < 0.8}}


def fmt_cases():
    vals = [0, 0.005, 0.015, 0.025, 0.125, 0.135, 0.145, 0.455, 1.5, 2.5, 3.5, -2.5, -0.5, 0.5, 1, 2, 3, 5, 7, 4.999,
            -0.004, 13.4, 179.9, 0.1, 0.45, 0.115, 0.105, 0.095, 0.285, 1e-9, -1e-9]
    vals += [rng.uniform(-50, 200) for _ in range(150)] + [rng.uniform(0, 1) for _ in range(100)]
    vals += [k / 8 for k in range(-40, 120)] + [k / 4 for k in range(-20, 200)] + [k / 200 for k in range(0, 200)]
    return [{"value": v, "unit": u, "out": rules.fmt(v, u)} for v in vals for u in ("s", "deg", "cm")]


def main():
    movements = list(rules.FAULTS)
    cases = {"fmt": fmt_cases(), "severity": [], "fired": [], "gate": [], "chooseCue": [], "chooseSetCue": [], "notes": [],
             "confidence": [], "repConfidence": [], "whySentence": [], "cueConfidence": [], "onScreen": [],
             "confirmedOffSide": []}
    for fid in rules.RULES:
        thr = rules.RULES[fid]["threshold"]
        for v in [thr, thr * 0.5, thr * 1.5, thr * 2, 0.0, -thr, thr * 3.7, rng.uniform(-thr, 3 * thr)]:
            cases["severity"].append({"fid": fid, "v": v, "out": rules.severity(fid, v)})

    for _ in range(600):
        m = rng.choice(movements)
        vals = values(m)
        cases["fired"].append({"values": vals, "out": rules.fired(vals)})
        cases["chooseCue"].append({"values": vals, "out": rules.choose_cue(vals)})
    # hand edges: thresholds exactly, the gating pairs, a cause at exactly PRESENT, nothing measured
    edges = [
        {"bar_forward_off_hips": 10.0, "jump_forward": 8.0},
        {"bar_forward_off_hips": 5.0, "jump_forward": 9.0},
        {"bar_forward_off_hips": 4.999, "jump_forward": 9.0},
        {"bar_forward_off_hips": None, "jump_forward": 9.0},
        {"hips_rise_early": 4.0, "early_arm_bend": 0.2},
        {"hips_rise_early": 8.0, "early_arm_bend": 0.1, "bar_crash": 25.0},
        {"hips_rise_early": 12.0, "slow_turnover": 0.675, "bar_crash": 37.5},
        {"hips_low_transition": 15.0, "chicken_wing": 0.24},
        {"hspu_banana": 5.0, "hspu_kip_timing": 20.0},
        {"no_push_away": 4.0}, {"no_push_away": 0.0}, {"no_push_away": 4.01}, {"no_push_away": -4.0},
        {}, {"jump_forward": None}, {"press_out": 15.0, "chest_dive": 15.0, "forward_dip": 4.0, "bar_forward_overhead": 6.0},
        {"leg_kip": 75.0, "early_arm_pull": 0.195, "no_push_away": 2.0},
    ]
    for vals in edges:
        cases["fired"].append({"values": vals, "out": rules.fired(vals)})
        cases["chooseCue"].append({"values": vals, "out": rules.choose_cue(vals)})
    gate_sets = [sorted(rules.fired(c["values"])) for c in cases["fired"][:200]] + [list(g) for g in rules.GATES]
    gate_sets += [["hips_rise_early", "early_arm_bend", "bar_forward_off_hips", "jump_forward"], []]
    cases["gate"] = [{"ids": ids, "out": sorted(rules.gate(set(ids)))} for ids in gate_sets]

    for _ in range(400):
        m = rng.choice(movements)
        reps = [rep(m) for _ in range(rng.randint(1, 5))]
        fid, n = rules.choose_set_cue(m, [r["values"] for r in reps])
        cases["chooseSetCue"].append({"movement": m, "reps": [r["values"] for r in reps], "out": [fid, n]})
        roll = rng.random()
        if roll < 0.1:
            cue = None
        elif roll < 0.2:
            other = rng.choice(rules.FAULTS[m])
            cue = {"faultId": "missed_forward", "text": rules.CUES[other]}
        else:
            cue = {"faultId": fid or rng.choice(rules.FAULTS[m]), "text": rules.CUES[fid] if fid else "Film one more rep."}
        limit = rng.choice([3, 3, 3, 1, 2, 5])
        cases["notes"].append({"movement": m, "reps": reps, "cue": cue, "limit": limit,
                               "out": rules.notes(m, reps, cue, limit)})

    offs = [None, 0.0, 19.9, 20.0, 20.0001, 36.0, 60.0, 70.0, 70.0001, 85.0]
    sevs = [0.0, 1.0, 1.49, 1.4999999, 1.5, 2.0, 3.3]
    for m in movements:
        for off in offs:
            vals = values(m)
            cases["onScreen"].append({"values": vals, "off": off, "out": rules.on_screen(vals, off)})
    for fid in rules.RULES:
        for s in sevs:
            for off in offs:
                cases["confidence"].append({"fid": fid, "sev": s, "off": off, "out": rules.confidence(fid, s, off)})
                cases["confirmedOffSide"].append({"fid": fid, "sev": s, "off": off, "out": rules.confirmed_off_side(fid, s, off)})
                for scale_ok in (True, False):
                    seen, total = rng.randint(0, 4), rng.randint(1, 4)
                    cases["cueConfidence"].append({"fid": fid, "sev": s, "off": off, "seen": seen, "total": total,
                                                   "scaleOk": scale_ok,
                                                   "out": cue_confidence(fid, s, off, seen, total, scale_ok)})
    for conf in ("clear", "worth_checking", "low"):
        for seen in range(0, 4):
            for total in range(1, 4):
                cases["repConfidence"].append({"conf": conf, "seen": seen, "total": total,
                                               "out": rules.rep_confidence(conf, seen, total)})

    for fid in rules.RULES:
        thr = rules.RULES[fid]["threshold"]
        for _ in range(12):
            v = rng.choice([thr, thr * 1.25, rng.uniform(0, 3 * thr), thr * rng.choice(STEPS)])
            d = rng.choice([None, {}, detail(fid)])
            cases["whySentence"].append({"fid": fid, "values": {fid: v}, "detail": d,
                                         "out": rules.why_sentence(fid, {fid: v}, d)})

    OUT.write_text(json.dumps(cases, separators=(",", ":")) + "\n")
    print(OUT, {k: len(v) for k, v in cases.items()}, sum(len(v) for v in cases.values()))


if __name__ == "__main__":
    main()
