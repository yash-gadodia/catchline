import os

import numpy as np
import pytest

from catchline_cv import detect

FPS = 30


def lifter(n, wri_y, elb=None, knee_x=None, hip_y=700.0):
    """(n, 26, 2) side-on lifter facing image-right: shoulders 500, hips 700 (torso 200 px), knees 850, ankles 1000.
    wri_y per frame (image px, y down). elb: (x offset from the shoulders, y) per frame, default halfway up the arm."""
    k = np.full((n, 26, 2), np.nan)
    x = 360.0
    wri_y = np.broadcast_to(np.asarray(wri_y, float), (n,))
    hip_y = np.broadcast_to(np.asarray(hip_y, float), (n,))
    knee_x = x + 10 if knee_x is None else np.broadcast_to(np.asarray(knee_x, float), (n,))
    if elb is None:
        elb = (np.zeros(n), (500.0 + wri_y) / 2)
    ex, ey = (np.broadcast_to(np.asarray(v, float), (n,)) for v in elb)
    pts = {5: (x, 500.0), 6: (x, 500.0), 11: (x, hip_y), 12: (x, hip_y), 13: (knee_x, 850.0), 14: (knee_x, 850.0),
           15: (x, 1000.0), 16: (x, 1000.0), 9: (x, wri_y), 10: (x, wri_y), 7: (x + ex, ey), 8: (x + ex, ey)}
    for j, (px, py) in pts.items():
        k[:, j, 0] = px
        k[:, j, 1] = py
    k[:, [20, 21]] = k[:, [15, 16]] + [20, 0]
    k[:, [24, 25]] = k[:, [15, 16]] - [5, 0]
    return k


def ramp(a, b, n):
    return np.linspace(a, b, n, endpoint=False)


FLOOR = 930.0        # wrists below the knees (850)
OVERHEAD = 240.0     # 1.3 torsos above the shoulders
LOW_LOCK = 380.0     # 0.6 torsos: overhead, but barely (real lockouts read 0.78-0.88)
RACK = 520.0         # at the shoulders


def snatch_like(lock=OVERHEAD):
    w = np.concatenate([np.full(40, FLOOR), ramp(FLOOR, lock, 20), np.full(50, lock), ramp(lock, FLOOR, 20), np.full(20, FLOOR)])
    return lifter(len(w), w)


def rack_elbows(w):
    """Elbows below the wrists and 40 px in front of the shoulders whenever the bar sits at the shoulders."""
    racked = np.abs(w - RACK) < 20
    return np.where(racked, 40.0, 0.0), np.where(racked, 620.0, (500.0 + w) / 2)


def clean_like(jerk_after=False):
    w = [np.full(40, FLOOR), ramp(FLOOR, RACK, 20), np.full(50, RACK)]
    if jerk_after:
        w += [ramp(RACK, OVERHEAD, 10), np.full(40, OVERHEAD)]
    w += [ramp(w[-1][-1], FLOOR, 20), np.full(20, FLOOR)]
    w = np.concatenate(w)
    return lifter(len(w), w, elb=rack_elbows(w))


def jerk_like(dip=True, feet_rise=0.0):
    w = np.concatenate([np.full(50, RACK), np.full(10, RACK), ramp(RACK, OVERHEAD, 10), np.full(60, OVERHEAD),
                        ramp(OVERHEAD, RACK, 10), np.full(10, RACK)])
    n = len(w)
    knee_x = np.full(n, 370.0)
    hip_y = np.full(n, 700.0)
    if dip:
        knee_x[50:60] = 440.0
        hip_y[50:60] = 760.0
    k = lifter(n, w, elb=rack_elbows(w), knee_x=knee_x, hip_y=hip_y)
    k[60:130, [15, 16, 20, 21, 24, 25], 1] -= feet_rise
    return k


def test_snatch_is_a_floor_pull_received_overhead():
    assert detect.detect(snatch_like(), FPS) == {"movement": "snatch", "confidence": 0.9}


def test_a_low_lockout_is_still_a_snatch_but_not_a_confident_one():
    assert detect.detect(snatch_like(LOW_LOCK), FPS) == {"movement": "snatch", "confidence": 0.7}


def test_clean_is_a_floor_pull_received_at_the_shoulders():
    assert detect.detect(clean_like(), FPS) == {"movement": "clean", "confidence": 0.9}


def test_clean_and_jerk_counts_as_a_clean():
    assert detect.detect(clean_like(jerk_after=True), FPS) == {"movement": "clean", "confidence": 0.9}


def test_jerk_is_shoulders_to_overhead_with_a_dip_and_no_floor():
    assert detect.detect(jerk_like(), FPS) == {"movement": "jerk", "confidence": 0.9}


def test_press_from_the_shoulders_is_a_weak_jerk():
    assert detect.detect(jerk_like(dip=False), FPS) == {"movement": "jerk", "confidence": 0.7}


def test_a_body_that_rises_with_the_bar_is_not_a_jerk():
    # a bar muscle-up: hands at shoulder height in support, then back to a hang, feet a torso higher in between
    assert detect.detect(jerk_like(feet_rise=200.0), FPS) == {"movement": "unknown", "confidence": 0.0}
    assert detect.detect(jerk_like(feet_rise=40.0), FPS) == {"movement": "jerk", "confidence": 0.9}


def test_two_snatches_average_their_confidence():
    k = np.concatenate([snatch_like(), snatch_like(LOW_LOCK)])
    assert detect.detect(k, FPS) == {"movement": "snatch", "confidence": 0.8}


def test_a_split_vote_is_unknown():
    k = np.concatenate([snatch_like(), clean_like()])
    assert detect.detect(k, FPS) == {"movement": "unknown", "confidence": 0.45}


def test_no_lift_is_unknown():
    still = lifter(90, 690.0)
    assert detect.detect(still, FPS) == {"movement": "unknown", "confidence": 0.0}
    hanging = lifter(90, 250.0)
    assert detect.detect(hanging, FPS) == {"movement": "unknown", "confidence": 0.0}
    assert detect.detect(np.full((90, 26, 2), np.nan), FPS) == {"movement": "unknown", "confidence": 0.0}


def test_lifts_are_reported_for_debugging():
    out = detect.detect(clean_like(jerk_after=True), FPS, lifts=True)
    assert [(l["movement"], l["confidence"]) for l in out["lifts"]] == [("clean", 0.9)]
    assert out["lifts"][0]["from_floor"] is True


# ---------------------------------------------------------------- real clips (pose caches on the Mini)

CLIP_DIRS = [d for d in os.environ.get("CATCHLINE_CLIPS", "").split(":") if d]
CACHE = os.environ.get("CATCHLINE_POSE_CACHE")

REAL = [
    ("2026-10-05_21B27BAF.mov", "snatch", 0.9),       # squat snatch, dropped at the end
    ("2026-10-05_E0DF8887.mov", "snatch", 0.9),       # power snatch, made
    ("2026-08-21_EDF10BB7.mov", "unknown", 0.0),      # bar muscle-up attempts (hanging)
    ("2026-09-18_BD1AE773.mov", "unknown", 0.0),      # banded pull-ups off a box (hanging)
    ("2026-09-22_A1F2F738.mov", "unknown", 0.0),      # banded kipping pull-up (hanging)
    ("snatch-2026-09-20.mov", "snatch", 0.9),         # the reference snatch (two reps, lockouts 0.78 and 0.80)
    ("2026-05-04_A6AB9BA4-110D-43F3-87D5-3AF4D97BAFF6.MOV", "clean", 0.9),   # cleans, ~45 deg off side-on
    ("2026-07-13_38CD6F06-D468-45E2-AC35-D038CC83B836.MOV", "clean", 0.9),   # rack read at 0.26 torsos
    ("2026-07-27_86CCBFF4-E0A6-4E8B-AEEF-664B5DB06060.MOV", "clean", 0.9),
    ("2026-01-09_B9D886E0-2A21-4332-9E8E-E52B0A9E1CA0.MOV", "jerk", 0.7),    # 4 strict presses, front-on: knee "dips" of 6-12 deg are noise
]


@pytest.mark.skipif(not (CLIP_DIRS and CACHE), reason="set CATCHLINE_CLIPS (dirs, ':'-separated) and CATCHLINE_POSE_CACHE")
@pytest.mark.parametrize("clip, movement, confidence", REAL)
def test_real_clip(clip, movement, confidence):
    from catchline_cv import pipeline

    path = next((os.path.join(d, clip) for d in CLIP_DIRS if os.path.exists(os.path.join(d, clip))), None)
    if path is None:
        pytest.skip(f"{clip} not on this machine")
    det = pipeline.detect_movement(path, CACHE)
    assert (det["movement"], det["confidence"]) == (movement, confidence)
