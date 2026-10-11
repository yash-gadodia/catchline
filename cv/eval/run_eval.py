import argparse
import datetime
import glob
import hashlib
import json
import os
import subprocess
import sys

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from eval import labels, manifest, report, score  # noqa: E402

RESEARCH = os.path.expanduser("~/dev/liftcheck-research")


def sha_file(path, cache):
    st = os.stat(path)
    key = f"{path}:{st.st_size}:{st.st_mtime_ns}"
    if key not in cache:
        h = hashlib.sha256()
        with open(path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        cache[key] = h.hexdigest()
    return cache[key]


def code_sha(cv_dir):
    h = hashlib.sha256()
    files = sorted(glob.glob(os.path.join(cv_dir, "catchline_cv", "*.py"))) + [os.path.join(cv_dir, f) for f in ("run.py", "pyproject.toml", "uv.lock")]
    for f in files:
        if os.path.exists(f):
            h.update(os.path.relpath(f, cv_dir).encode())
            h.update(open(f, "rb").read())
    return h.hexdigest()


def pipeline_cmd(cv_dir, python):
    if python:
        return [python]
    venv = os.path.join(cv_dir, ".venv", "bin", "python")
    return [venv] if os.path.exists(venv) else ["uv", "run", "python"]


def run_pipeline(clips, cv_dir, cache_root, python=None, log=print):
    """Run run.py on each clip; results cached under cache_root/runs/<clip>-<clip sha>-<code sha>/.
    Pose is cached by the pipeline itself in cache_root/runs/cache/ (keyed by file name)."""
    runs = os.path.join(cache_root, "runs")
    os.makedirs(runs, exist_ok=True)
    hashes_path = os.path.join(cache_root, "hashes.json")
    hashes = json.load(open(hashes_path)) if os.path.exists(hashes_path) else {}
    csha = code_sha(cv_dir)
    cmd = pipeline_cmd(cv_dir, python)
    results = {}
    for i, c in enumerate(clips, 1):
        if not os.path.exists(c["path"]):
            results[c["id"]] = {"status": "error", "error": "clip missing", "analysis": None}
            log(f"[{i}/{len(clips)}] {c['id']} MISSING {c['path']}")
            continue
        key = f"{c['id']}-{sha_file(c['path'], hashes)[:12]}-{csha[:12]}"
        json.dump(hashes, open(hashes_path, "w"))
        out_json = os.path.join(runs, key, f"{key}.json")
        cached = os.path.exists(out_json)
        if not cached:
            os.makedirs(os.path.join(runs, key), exist_ok=True)
            with open(os.path.join(runs, key, "log.txt"), "w") as fh:
                p = subprocess.run(cmd + ["run.py", os.path.abspath(c["path"]), "--id", key, "--out", os.path.abspath(runs), "--no-video"],
                                   cwd=cv_dir, stdout=fh, stderr=subprocess.STDOUT)
            if p.returncode != 0 or not os.path.exists(out_json):
                tail = open(os.path.join(runs, key, "log.txt")).read().strip().splitlines()[-1:] or ["?"]
                results[c["id"]] = {"status": "error", "error": tail[0], "analysis": None, "key": key}
                log(f"[{i}/{len(clips)}] {c['id']} ERROR {tail[0]}")
                continue
        a = json.load(open(out_json))
        results[c["id"]] = {"status": "failure" if a.get("failure") else "ok", "analysis": a, "key": key}
        log(f"[{i}/{len(clips)}] {c['id']} {'cached' if cached else 'ran'} reps={len(a.get('reps', []))} "
            f"cue={(a.get('cue') or {}).get('faultId')} failure={(a.get('failure') or {}).get('reason')}")
    return results, csha


def main(argv=None, runner=run_pipeline):
    ap = argparse.ArgumentParser(description="Catchline CV accuracy harness")
    ap.add_argument("--manifest", action="append", help="INDEX.md, video file or glob (repeatable)")
    ap.add_argument("--labels", default=os.path.join(RESEARCH, "labelling/labels/labels.jsonl"))
    ap.add_argument("--cv-dir", default=os.path.expanduser("~/dev/parallax/cv"))
    ap.add_argument("--python", help="interpreter for run.py (default: <cv-dir>/.venv/bin/python, else uv run python)")
    ap.add_argument("--cache", default=os.path.join(RESEARCH, "eval/cache"))
    ap.add_argument("--out-root", default=os.path.join(RESEARCH, "eval"))
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--write-provisional", metavar="PATH", help="write labels from the manifest (movement + made/missed only) and exit")
    ap.add_argument("--gate", action="store_true", help="exit 1 unless every target passes")
    a = ap.parse_args(argv)
    manifests = a.manifest or [os.path.join(RESEARCH, "reference/side-on/INDEX.md")]
    clips = manifest.load(manifests)

    if a.write_provisional:
        os.makedirs(os.path.dirname(os.path.abspath(a.write_provisional)), exist_ok=True)
        with open(a.write_provisional, "w") as fh:
            for r in manifest.provisional_labels(clips):
                fh.write(json.dumps(r) + "\n")
        print(f"wrote {a.write_provisional}")
        return 0

    rows = labels.load(a.labels)
    cons = labels.consensus(rows)
    kappa = labels.fleiss_kappa(labels.kappa_items(rows))
    results, csha = runner(clips, os.path.expanduser(a.cv_dir), os.path.expanduser(a.cache), a.python)
    m, per = score.score(clips, results, cons, kappa)

    out = os.path.join(os.path.expanduser(a.out_root), a.date)
    os.makedirs(out, exist_ok=True)
    meta = {"date": a.date, "cv_dir": a.cv_dir, "code_sha": csha, "labels": a.labels, "manifests": manifests,
            "label_rows": len(rows)}
    json.dump({"meta": meta, "metrics": m, "clips": per}, open(os.path.join(out, "metrics.json"), "w"), indent=1)
    open(os.path.join(out, "report.md"), "w").write(report.markdown(m, per, meta))
    s = m["supported"]
    print(f"wrote {out}/report.md")
    print(f"rep exact {report.fmt(s['rep_count_exact'])}, rep recall {report.fmt(s['rep_recall'])}, rep precision {report.fmt(s['rep_precision'])}, "
          f"made agree {report.fmt(s['made_agreement'])} (n={s['made_n']}), abstain {report.fmt(s['abstain_rate'])}, "
          f"cue precision {report.fmt(s['cue_precision'])}, kappa {report.fmt(m['kappa'])}, gate {'PASS' if m['gate_pass'] else 'FAIL'}")
    return 1 if a.gate and not m["gate_pass"] else 0


if __name__ == "__main__":
    sys.exit(main())
