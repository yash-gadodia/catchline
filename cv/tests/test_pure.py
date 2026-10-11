import numpy as np
import pytest

from catchline_cv import rules
from catchline_cv.geometry import angle, lowpass, normalise, trunk_angle
from catchline_cv.phases import SNATCH_PHASES, find_reps, segment_snatch


def test_angle_right_and_straight():
    assert angle((1, 0), (0, 0), (0, 1)) == pytest.approx(90.0)
    assert angle((-1, 0), (0, 0), (1, 0)) == pytest.approx(180.0)
    assert angle((1, 1), (0, 0), (1, 0)) == pytest.approx(45.0)


def test_angle_vectorised():
    a = np.array([[1, 0], [-1, 0]])
    b = np.zeros((2, 2))
    c = np.array([[0, 1], [1, 0]])
    assert angle(a, b, c) == pytest.approx([90.0, 180.0])


def test_trunk_angle_image_coords():
    assert trunk_angle((0, 0), (0, 10)) == pytest.approx(90.0)  # shoulder straight above hip
    assert trunk_angle((10, -10), (0, 0)) == pytest.approx(45.0)
    assert trunk_angle((-10, -10), (0, 0)) == pytest.approx(45.0)  # facing either way


def test_normalise_and_clamp():
    assert normalise((360, 640), 720, 1280) == {"x": 0.5, "y": 0.5}
    assert normalise((-5, 2000), 720, 1280) == {"x": 0.0, "y": 1.0}


def test_lowpass_keeps_slow_signal_and_fills_nans():
    t = np.arange(120) / 30
    x = np.sin(2 * np.pi * 0.5 * t)
    x[10] = np.nan
    y = lowpass(x, 30, 6.0)
    assert np.isfinite(y).all()
    assert np.max(np.abs(y[15:-15] - np.sin(2 * np.pi * 0.5 * t[15:-15]))) < 0.02


def synthetic_snatch(fps=30):
    """Bar height (cm) and knee angle for a squat snatch: rest, pull with a double knee bend, peak,
    a 15 cm drop into the catch, a ride down to the squat bottom, a stand-up higher than the peak."""
    h = np.concatenate([
        np.full(30, 22.0),                      # 0-29 on the floor
        np.linspace(22, 60, 12),                # 30-41 first pull
        np.linspace(61, 80, 6),                 # 42-47 transition
        np.linspace(82, 125, 8),                # 48-55 second pull
        np.linspace(126, 140, 6),               # 56-61 turnover
        np.linspace(139, 125, 6),               # 62-67 drop into catch
        np.linspace(124, 100, 30),              # 68-97 ride down
        np.linspace(101, 160, 30),              # 98-127 stand up
        np.full(20, 160.0),                     # 128-147 hold
    ])
    knee = np.concatenate([
        np.full(30, 60.0),
        np.linspace(60, 150, 12),               # extends to first max at 41
        np.linspace(148, 135, 6),               # re-bend to 47
        np.linspace(140, 178, 8),               # second extension max at 55
        np.linspace(170, 110, 6),
        np.linspace(105, 90, 6),
        np.linspace(90, 60, 30),
        np.linspace(62, 175, 30),
        np.full(20, 175.0),
    ])
    elbow = np.full(len(h), 100.0)
    elbow[64:] = 165.0
    return h, knee, elbow


def test_segment_snatch_synthetic_events():
    h, knee, elbow = synthetic_snatch()
    phases, ev = segment_snatch(h, knee, 30, elbow=elbow)
    assert ev["liftoff"] == 30
    assert ev["first_ext"] == 41
    assert ev["rebend"] == 47
    assert ev["second_ext"] == 55
    assert ev["peak"] == 61
    assert ev["caught"] == 64
    assert ev["catch_bottom"] == 97
    assert ev["double_knee_bend"] is True
    assert [p["name"] for p in phases] == SNATCH_PHASES
    assert phases[0] == {"name": "setup", "startFrame": 0, "endFrame": 29}
    assert phases[1] == {"name": "first_pull", "startFrame": 30, "endFrame": 41}
    assert phases[5] == {"name": "catch", "startFrame": 62, "endFrame": 97}
    for a, b in zip(phases, phases[1:]):
        assert b["startFrame"] == a["endFrame"] + 1


def test_segment_snatch_without_rebend_uses_knee_pass():
    h, knee, _ = synthetic_snatch()
    knee = np.maximum.accumulate(np.where(np.arange(len(knee)) < 56, knee, 0))  # no re-bend before the peak
    knee[56:] = 150
    _, ev = segment_snatch(h, knee, 30, knee_pass=38)
    assert ev["double_knee_bend"] is False
    assert ev["first_ext"] == 38


def test_find_reps_floor_to_overhead():
    n = 200
    wrist = np.full(n, 20.0)
    wrist[50:60] = np.linspace(20, 180, 10)
    wrist[60:120] = 180.0
    nose = np.full(n, 150.0)
    knee = np.full(n, 50.0)
    assert find_reps(wrist, nose, knee, 30) == [(51, 119, 58)]


def test_rules_pick_most_severe_and_cap_confidence_off_side_on():
    vals = {"hips_rise_early": -3.0, "bar_forward_off_hips": 13.0, "jump_forward": 7.0}
    assert rules.fired(vals) == {"bar_forward_off_hips": pytest.approx(1.3), "jump_forward": pytest.approx(1.4)}
    assert rules.choose_cue(vals) == "jump_forward"
    assert rules.confidence("jump_forward", 1.4, 36.0) == "low"
    assert rules.confidence("hips_rise_early", 1.6, 36.0) == "worth_checking"
    assert rules.confidence("jump_forward", 1.6, 5.0) == "clear"
    assert rules.choose_cue({"hips_rise_early": 1.0, "bar_forward_off_hips": None, "jump_forward": 0.0}) is None
    assert len(rules.CUES["jump_forward"].split()) < 8
    assert rules.why_sentence("jump_forward", vals) == (
        "Your feet landed 7 cm forward because you chased a bar that swung 13 cm forward off your hips.")
