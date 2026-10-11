def fmt(v):
    if v is None:
        return "n/a"
    if isinstance(v, bool):
        return "made" if v else "missed"
    if isinstance(v, float):
        return f"{v * 100:.1f}%" if v <= 1 else f"{v:.2f}"
    return str(v)


def table(head, rows):
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def markdown(m, per, meta):
    s = m["supported"]
    lines = [
        f"# Catchline CV eval, {meta['date']}",
        "",
        f"Pipeline `{meta['cv_dir']}` (commit {meta['cv_commit']}, code {meta['code_sha'][:12]}), labels `{meta['labels']}`, manifest {', '.join(meta['manifests'])}.",
        "",
        f"{m['clips_in_manifest']} clips, {m['labelled']} labelled, {m['excluded_coach_disagreement']} dropped for coach disagreement, "
        f"{m['provisional_clips']} provisional (single labeller), {m['pipeline_errors']} pipeline crashes.",
        "",
        "## Targets",
        "",
        table(["Target", "Rule", "Value", "Status"],
              [[t["what"], f"{t['op']} {fmt(t['threshold'])}", fmt(t["value"]), t["status"]] for t in m["targets"]]),
        "",
        f"Gate: **{'PASS' if m['gate_pass'] else 'FAIL'}**",
        "",
        "## Supported movements (snatch family)",
        "",
        table(["Metric", "Value"], [
            ["Rep count exact (per clip)", fmt(s["rep_count_exact"])],
            ["Rep recall (matched / labelled reps)", f"{fmt(s['rep_recall'])} ({s['matched_reps']}/{s['truth_reps']})"],
            ["Rep precision (matched / CV reps)", f"{fmt(s['rep_precision'])} ({s['matched_reps']}/{s['cv_reps']})"],
            ["Rep count MAE (reps)", s["rep_count_mae"]],
            ["Made/missed agreement (matched reps)", f"{fmt(s['made_agreement'])} (n={s['made_n']})"],
            ["Abstain rate (no cue)", f"{fmt(s['abstain_rate'])} (n={s['abstain_n']})"],
            ["Cue precision", f"{fmt(s['cue_precision'])} (n={s['cued_with_fault_labels']})"],
            ["Harmful-cue rate", fmt(s["harmful_rate"])],
            ["Failures", ", ".join(f"{k} {v}" for k, v in s["failures"].items()) or "none"],
        ]),
        "",
        "Made/missed confusion (label->CV): " + (", ".join(f"{k} {v}" for k, v in s["made_confusion"].items()) or "none"),
        "",
        f"Unsupported movements correctly rejected (0 reps): {fmt(m['unsupported_correct_reject'])} (n={m['unsupported_n']})",
        "",
        "## Per movement",
        "",
        table(["Movement", "Clips", "Rep exact", "Rep recall", "Rep precision", "Made agree", "Abstain", "Cue precision"],
              [[mv, b["clips"], fmt(b["rep_count_exact"]), fmt(b["rep_recall"]), fmt(b["rep_precision"]),
                f"{fmt(b['made_agreement'])} (n={b['made_n']})", fmt(b["abstain_rate"]), fmt(b["cue_precision"])]
               for mv, b in m["per_movement"].items()]),
        "",
        "## Per fault",
        "",
        table(["Fault", "Coach n", "CV n", "TP", "Precision", "Recall"],
              [[f, v["coach_n"], v["cv_n"], v["tp"], fmt(v["precision"]), fmt(v["recall"])] for f, v in m["per_fault"].items()])
        if m["per_fault"] else "No fault labels yet.",
        "",
        "Fault confusion (coach->CV): " + (", ".join(f"{k} {v}" for k, v in m["fault_confusion"].items()) or "none"),
        "",
        "## Per clip",
        "",
        table(["Clip", "Movement", "Labels", "Reps label/CV", "Made label/CV", "Cue", "Coach primary", "Failure"],
              [[r["id"], r["movement"], ("dropped" if r["labelled"] and not r["agreed"] else "prov" if r["provisional"] else "agreed" if r["labelled"] else "none"),
                f"{fmt(r['truth_reps'])}/{r['cv_reps']}",
                " ".join(f"{fmt(x['made'])}/{fmt(x['cv_made'])}" for x in r["reps"]) or "-",
                r["cue"] or "-", r["coach_primary"] or "-", r["failure"] or "-"] for r in per]),
        "",
    ]
    return "\n".join(lines)
