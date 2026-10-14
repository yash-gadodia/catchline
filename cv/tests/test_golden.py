"""The pipeline's output on the reference clips must not change: Analysis JSON and keyframe JPEG bytes are compared
with the goldens in tests/golden/ (recorded at catchline 65d737d). Set CATCHLINE_CLIPS to the directory holding the
clips (file names as in tests/golden/); the test is skipped for any clip that is not there.

    CATCHLINE_CLIPS=~/clips uv run pytest tests/test_golden.py -q

Re-record (only after an intended change in results): CATCHLINE_GOLDEN_UPDATE=1 with the same command."""
import glob
import hashlib
import json
import os

import pytest

from catchline_cv import pipeline

GOLDEN = os.path.join(os.path.dirname(__file__), "golden")
CLIPS = os.environ.get("CATCHLINE_CLIPS")
names = sorted(os.path.basename(p)[:-5] for p in glob.glob(os.path.join(GOLDEN, "*.json")))


@pytest.mark.skipif(not CLIPS, reason="CATCHLINE_CLIPS not set")
@pytest.mark.parametrize("name", names)
def test_reference_clip_output_is_unchanged(name, tmp_path):
    clip = os.path.join(CLIPS, name)
    if not os.path.exists(clip):
        pytest.skip(f"{clip} not present")
    golden = json.load(open(os.path.join(GOLDEN, name + ".json")))
    os.makedirs(tmp_path / "debug")
    res = pipeline.run(clip, str(tmp_path / "analysis.json"), str(tmp_path / "keyframes"), "kf", str(tmp_path / "debug"),
                       str(tmp_path / "cache"), "golden", golden.get("movement", "snatch"))
    analysis = json.load(open(tmp_path / "analysis.json"))
    assert (res if isinstance(res, dict) else res[0]) == analysis
    keyframes = {os.path.basename(p): hashlib.md5(open(p, "rb").read()).hexdigest()
                 for p in sorted(glob.glob(str(tmp_path / "keyframes" / "*.jpg")))}
    if os.environ.get("CATCHLINE_GOLDEN_UPDATE"):
        json.dump({"analysis": analysis, "keyframes_md5": keyframes}, open(os.path.join(GOLDEN, name + ".json"), "w"), indent=1)
    assert analysis == golden["analysis"]
    assert keyframes == golden["keyframes_md5"]
