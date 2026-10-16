"""Camera angle off side-on from the pose, for a lifter hanging from a bar. Inputs are the clip medians measured on
real clips (RTMPose, tracked lifter): left-right x separation of the shoulders and of the hips, in torso lengths.
Labels are by eye from frames (16 Oct 2026): IMG_0080 hangs facing the camera at a diagonal, IMG_7819 and the
"First BMU" clip are front-on (the latter mostly stands, so it calibrates but is not a hang label), the three kip clips (IMG_7993, IMG_7996, IMG_7998 = golden EDF10BB7) are near side-on
(the bar runs from beside the camera to the far upright at mid-frame: ~10-15 deg), IMG_0050 (= golden BD1AE773) is
side-on with both hands visible apart on the bar (~20 deg by eye, ~0 per the owner) and still reads 30: its shoulders
sit 0.36 torso apart in profile, which no width constant reconciles with the front-on clips, so it is not asserted."""
import numpy as np
import pytest

from catchline_cv.lifts import HANG_HIP_W, off_side_pose
from catchline_cv.pose import L_HIP, L_SHO, R_HIP, R_SHO

LABELLED = [  # clip, shoulder sep, hip sep, angle by eye
    ("IMG_0080", 0.50, 0.35, 55),
    ("IMG_7819", 0.56, 0.38, 80),
    ("IMG_7993", 0.13, 0.12, 12),
    ("IMG_7996", 0.10, 0.10, 12),
    ("IMG_7998", 0.15, 0.12, 12),
]


def pose(sho_sep, hip_sep, torso=200.0, n=20):
    k = np.full((n, 26, 2), np.nan)
    k[:, L_SHO], k[:, R_SHO] = [300 - sho_sep * torso / 2, 400], [300 + sho_sep * torso / 2, 400]
    k[:, L_HIP], k[:, R_HIP] = [300 - hip_sep * torso / 2, 400 + torso], [300 + hip_sep * torso / 2, 400 + torso]
    return k


@pytest.mark.parametrize("clip,sho,hip,label", LABELLED)
def test_hanging_angle_is_within_10_deg_of_the_label(clip, sho, hip, label):
    assert abs(off_side_pose(pose(sho, hip), hip_w=HANG_HIP_W) - label) <= 10


def test_the_old_hip_width_read_front_on_hangs_30_deg_short():
    # before: 0.5 torso for the hips; IMG_7819 read 51, the First BMU clip 53, IMG_0080 45
    assert [round(off_side_pose(pose(s, h))) for s, h in ((0.56, 0.38), (0.59, 0.38), (0.50, 0.35))] == [51, 53, 45]
    assert [round(off_side_pose(pose(s, h), hip_w=HANG_HIP_W)) for s, h in ((0.56, 0.38), (0.59, 0.38), (0.50, 0.35))] == [72, 74, 56]
