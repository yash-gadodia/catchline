import copy
import json
import os

import pytest

from eval import labels, manifest, run_eval, score

FIX = os.path.join(os.path.dirname(__file__), "..", "eval", "fixtures")
INDEX = os.path.join(FIX, "synthetic_INDEX.md")
LABELS = os.path.join(FIX, "synthetic_labels.jsonl")
RESULTS = json.load(open(os.path.join(FIX, "synthetic_results.json")))


def fake_runner(results):
    return lambda clips, cv_dir, cache, python: (results, "synthetic")


def run(tmp_path, labels_path=LABELS, results=RESULTS, gate=True):
    argv = ["--manifest", INDEX, "--labels", str(labels_path), "--out-root", str(tmp_path), "--cache", str(tmp_path / "c"), "--date", "d"]
    code = run_eval.main(argv + (["--gate"] if gate else []), runner=fake_runner(results))
    return code, json.load(open(tmp_path / "d" / "metrics.json"))


def without_clip(tmp_path, clip):
    p = tmp_path / "labels.jsonl"
    p.write_text("".join(l for l in open(LABELS) if clip not in l))
    return p


def test_manifest_parses_index():
    clips = manifest.load([INDEX])
    assert [c["id"] for c in clips][:2] == ["2026-01-01_AAAA", "2026-01-01_BBBB"]
    a, b, f = clips[0], clips[1], clips[5]
    assert (a["movement"], a["reps"], a["made"], a["windows"]) == ("power_snatch", 2, True, [[1.0, 3.0], [5.0, 7.0]])
    assert (b["movement"], b["made"]) == ("snatch", False)
    assert (f["movement"], f["reps"], f["made"]) == ("kipping_pull_up", 0, None)


def test_provisional_labels_have_no_faults():
    rows = manifest.provisional_labels(manifest.load([INDEX]))
    a = [r for r in rows if r["clip_id"] == "2026-01-01_AAAA"]
    assert [r["rep"] for r in a] == [1, 2] and all(r["made"] is True and r["primary_fault"] is None for r in a)
    f = [r for r in rows if r["clip_id"] == "2026-01-01_FFFF"]
    assert f == [dict(f[0], rep=0, made=None)]


def test_labels_normalise_both_schemas_and_latest_wins():
    rows = labels.load(LABELS)
    a = next(r for r in rows if r["clip_id"] == "2026-01-01_AAAA" and r["coach"] == "coach two" and r["rep"] == 1)
    assert (a["made"], a["primary"], a["secondary"], a["movement"]) == (True, "hips_rise_early", "bar_forward_off_hips", "power_snatch")
    e = [r for r in rows if r["clip_id"] == "2026-01-01_EEEE"]
    assert sorted(r["primary"] for r in e) == ["none", "none"]  # c1's later row wins, c3 skipped


def test_consensus_rules():
    cons = labels.consensus(labels.load(LABELS))
    assert cons["2026-01-01_AAAA"]["agreed"] and cons["2026-01-01_AAAA"]["reps"][2]["primary"] == "hips_rise_early"
    assert not cons["2026-01-01_CCCC"]["agreed"]
    assert cons["2026-01-01_DDDD"]["provisional"] and cons["2026-01-01_DDDD"]["agreed"]
    assert cons["2026-01-01_BBBB"]["reps"][1]["made"] is False


def test_fleiss_kappa():
    assert labels.fleiss_kappa([["a", "a"], ["b", "b"], ["a", "b"], ["a", "a"]]) == pytest.approx(0.4667, abs=1e-4)
    assert labels.fleiss_kappa([["a", "a"], ["a", "a"]]) == 1.0
    assert labels.fleiss_kappa([["a"]]) is None


def test_match_uses_windows_not_order():
    cv = score.cv_reps(RESULTS["2026-01-01_AAAA"]["analysis"])
    pairs, fp = score.match(2, [[1.0, 3.0], [5.0, 7.0]], cv)
    assert (pairs[1]["index"], pairs[2]["index"], fp) == (2, 1, [])


def test_metrics_on_synthetic_set(tmp_path):
    code, out = run(tmp_path)
    m = out["metrics"]
    s = m["supported"]
    assert (m["labelled"], m["excluded_coach_disagreement"], m["provisional_clips"]) == (5, 1, 1)
    assert (s["clips"], s["truth_reps"], s["cv_reps"], s["matched_reps"]) == (3, 4, 5, 4)
    assert (s["rep_count_exact"], s["rep_recall"], s["rep_precision"]) == (0.6667, 1.0, 0.8)
    assert (s["made_agreement"], s["made_confusion"]) == (0.75, {"made->made": 3, "missed->made": 1})
    assert s["abstain_rate"] == 0.3333
    assert (s["cue_precision"], s["harmful_rate"]) == (0.5, 0.5)
    assert m["unsupported_correct_reject"] == 1.0
    assert m["kappa"] == pytest.approx(0.5556, abs=1e-4)
    assert [t["status"] for t in m["targets"]] == ["fail", "blocked_by_kappa", "blocked_by_kappa"]
    assert m["per_fault"]["jump_forward"] == {"coach_n": 0, "cv_n": 1, "tp": 0, "precision": 0.0, "recall": None}
    b = next(c for c in out["clips"] if c["id"] == "2026-01-01_BBBB")
    assert b["harmful"] and "Land where you started" in b["harm_why"]
    assert code == 1
    assert "Gate: **FAIL**" in (tmp_path / "d" / "report.md").read_text()


def test_gate_scores_cues_once_kappa_passes(tmp_path):
    code, out = run(tmp_path, without_clip(tmp_path, "CCCC"))
    m = out["metrics"]
    assert m["kappa"] == pytest.approx(0.7475, abs=1e-4)
    assert [t["status"] for t in m["targets"]] == ["pass", "fail", "fail"]
    assert code == 1


def test_gate_passes_and_no_gate_never_fails(tmp_path):
    results = copy.deepcopy(RESULTS)
    results["2026-01-01_BBBB"]["analysis"]["cue"]["faultId"] = "excessive_backward_lean"
    code, out = run(tmp_path, without_clip(tmp_path, "CCCC"), results)
    assert out["metrics"]["gate_pass"] and code == 0
    assert run(tmp_path, gate=False)[0] == 0
