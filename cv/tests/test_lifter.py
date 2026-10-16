"""Lifter tracking on real poses (tests/fixtures/lifter_swaps.json.gz: RTMPose output sliced from two handheld kipping
clips, every person in every frame, head points already dropped) where a coach spots the athlete at the hips."""
import gzip
import json
import os

import numpy as np
import pytest

from catchline_cv.lifter import select_lifter
from catchline_cv.pose import L_WRI, R_WRI

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "lifter_swaps.json.gz")


def load(key):
    with gzip.open(FIXTURE, "rt") as fh:
        d = json.load(fh)[key]
    arr = lambda v: np.array([np.nan if x is None else x for x in v], float)
    return d["first_frame"], [[(arr(p["box"]), arr(p["kp"]).reshape(26, 2), arr(p["s"])) for p in ps] for ps in d["frames"]]


def top_wrist_y(k):
    return np.fmin(k[:, L_WRI, 1], k[:, R_WRI, 1])


@pytest.mark.parametrize("hanging", [True, False])
def test_the_track_stays_on_the_athlete_when_the_coach_steps_in(hanging):
    # IMG_7993 frames 200-303: the athlete kips on the bar (top hand at y 280-364 px) and the coach steps under her from
    # frame 260. The old IoU-only tracker took the coach's box at frame 261 and kept it for 33 frames (hands at y up to
    # 778).
    first, people = load("kip_coach_steps_in")
    k, _, boxes = select_lifter(people, hanging=hanging)
    assert np.isfinite(boxes[:, 0]).sum() == 104
    assert (top_wrist_y(k) > 420).sum() == 0
    assert boxes[281 - first].round().tolist() == [96, 82, 580, 1254]


def test_a_bar_movement_keeps_the_hands_on_the_bar_while_the_coach_holds_the_hips():
    # EDF10BB7 (= IMG_7998) frames 40-91: the coach stands under the athlete with his hands on her hips. The old tracker
    # followed him for 13 frames (hands at y up to 931; the bar is at y ~330). Frames where no detection has the
    # athlete's hands on the bar are left empty (8 of 52) rather than given to the coach.
    first, people = load("kip_coach_at_hips")
    k, _, boxes = select_lifter(people, hanging=True)
    assert np.isfinite(boxes[:, 0]).sum() == 44
    assert (top_wrist_y(k) > 420).sum() == 1
    assert np.nanmax(top_wrist_y(k)[59 - first: 81 - first]) < 360
