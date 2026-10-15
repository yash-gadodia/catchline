import numpy as np

from catchline_cv.pose import strip_head
from catchline_cv.privacy import blur_bystanders, bystanders, lifter_mask


def person(x, y, h=400.0, score=0.9):
    """A standing person: 26 Halpe points around (x, y = feet), h px tall, image coords."""
    k = np.zeros((26, 2))
    rows = {0: 0.06, 1: 0.05, 2: 0.05, 3: 0.06, 4: 0.06, 17: 0.0, 18: 0.15, 5: 0.18, 6: 0.18, 7: 0.33, 8: 0.33,
            9: 0.47, 10: 0.47, 11: 0.5, 12: 0.5, 19: 0.5, 13: 0.73, 14: 0.73, 15: 0.96, 16: 0.96,
            20: 1.0, 21: 1.0, 22: 1.0, 23: 1.0, 24: 0.98, 25: 0.98}
    for j, r in rows.items():
        k[j] = (x + (-0.08 if j % 2 else 0.08) * h * (j not in (0, 17, 18, 19)), y - h + r * h)
    box = np.array([x - 0.15 * h, y - h, x + 0.15 * h, y])
    return strip_head([[(box, k, np.full(26, score))]])[0][0]


def checker(h, w):
    """1 px checkerboard of 0/255: its blur is ~127.5 everywhere, so |out - img| / 127.5 reads the blend alpha."""
    yy, xx = np.mgrid[:h, :w]
    return np.repeat((((yy + xx) % 2) * 255).astype(np.uint8)[..., None], 3, 2)


def alpha(out, img):
    return np.abs(out.astype(float) - img.astype(float)).mean(2) / 127.5


def two_people():
    lifter = person(250, 1150, h=700)
    other = person(380, 760, h=420)
    return lifter, other


def test_the_lifter_is_never_changed_where_the_two_overlap():
    rng = np.random.default_rng(0)
    img = rng.integers(0, 255, (1280, 720, 3), dtype=np.uint8)
    lifter, other = two_people()
    out = blur_bystanders(img, bystanders([lifter, other], lifter[0]), lifter)
    core = lifter_mask(img.shape, *lifter) > 0
    assert np.array_equal(out[core], img[core])
    # the lifter's head (above the shoulders, no head points) is part of what stays sharp
    assert np.array_equal(out[445:505, 230:270], img[445:505, 230:270])
    # and the two masks really overlap, so this is the lifter winning, not the masks missing each other
    assert alpha(blur_bystanders(checker(1280, 720), [other]), checker(1280, 720))[core].max() > 0.9


def test_the_bystander_head_is_smudged_beyond_recovery():
    rng = np.random.default_rng(1)
    img = rng.integers(0, 255, (1280, 720, 3), dtype=np.uint8)
    lifter, other = two_people()
    out = blur_bystanders(img, bystanders([lifter, other], lifter[0]), lifter)
    # head of the bystander: above their shoulders (y 416) by about half a torso
    head_in, head_out = img[350:400, 360:400].astype(float), out[350:400, 360:400].astype(float)
    assert head_in.std() > 70
    assert head_out.std() < 3


def test_the_mask_edge_is_feathered_not_a_hard_step():
    img = checker(1280, 720)
    _, other = two_people()
    a = alpha(blur_bystanders(img, [other]), img)
    row = a[560, 380:720]  # from the bystander's chest out to the right edge of the frame
    assert row[0] > 0.98 and row[-1] == 0
    assert np.abs(np.diff(row)).max() < 0.08
    ramp = ((row > 0.1) & (row < 0.9)).sum()
    assert 0.012 * 1280 < ramp < 0.06 * 1280


def test_a_bystander_with_few_keypoints_gets_an_ellipse_not_a_rectangle():
    img = checker(1280, 720)
    box, k, s = person(400, 900, h=400)
    s = s.copy()
    s[:] = 0
    s[[5, 6]] = 0.9  # only the shoulders are confident
    a = alpha(blur_bystanders(img, [(box, k, s)]), img)
    x1, y1, x2, y2 = box.astype(int)
    assert a[(y1 + y2) // 2, (x1 + x2) // 2] > 0.98
    assert a[(y1 + y2) // 2, x1] > 0.95 and a[y1, (x1 + x2) // 2] > 0.95
    assert a[y2, x1] < 0.5 and a[y2, x2] < 0.5  # the box corners are outside the grown ellipse; a box would be ~1


def test_bystanders_keeps_a_person_right_behind_the_lifter_even_with_a_big_box_overlap():
    lifter = person(300, 1000, h=600)
    behind = person(330, 980, h=560)  # box IoU with the lifter ~0.8
    far = person(600, 700, h=200)
    out = bystanders([behind, lifter, far], lifter[0])
    assert [p[0][0] for p in out] == [behind[0][0], far[0][0]]
    assert bystanders([lifter], lifter[0]) == []
    assert len(bystanders([behind, far], None)) == 2


# Build 27 (15-10-2026), a clean in a busy gym: pose on the stored second-pull keyframe (608x1080) found the lifter and
# a person standing right behind them. The old blur carved the lifter's dilated keypoint hull out of the bystander box,
# and with the arms out that hull spanned the person behind, so their chest, arm and hips stayed sharp.
REAL_LIFTER = (np.array([122.9, 198.8, 458.9, 1066.1]),
               {5: (390.4, 340.3), 6: (282.4, 359.3), 7: (424.3, 427.1), 8: (227.4, 433.4), 9: (413.7, 507.5),
                10: (166.0, 496.9), 11: (335.4, 577.4), 12: (267.6, 573.2), 13: (341.7, 744.7), 14: (259.1, 721.4),
                15: (371.4, 926.8), 16: (278.2, 876.0), 18: (337.5, 323.3), 19: (301.5, 560.5), 20: (331.1, 1005.1),
                21: (227.4, 939.5), 22: (362.9, 1005.1), 23: (223.2, 924.7), 24: (386.2, 943.7), 25: (297.3, 895.0)},
               {5: 0.865, 6: 0.867, 7: 0.792, 8: 0.88, 9: 0.629, 10: 0.805, 11: 0.757, 12: 0.756, 13: 0.85, 14: 0.844,
                15: 0.908, 16: 0.88, 18: 0.907, 19: 1.043, 20: 0.848, 21: 0.908, 22: 0.823, 23: 0.855, 24: 0.804,
                25: 0.827})
REAL_BEHIND = (np.array([159.4, 420.3, 254.4, 740.6]),
               {5: (262.4, 452.2), 6: (201.4, 455.3), 7: (278.1, 498.3), 8: (192.8, 496.0), 9: (262.4, 525.7),
                10: (203.8, 520.2), 11: (257.7, 561.7), 12: (221.8, 563.2), 13: (256.2, 639.1), 14: (224.1, 635.9),
                15: (264.0, 714.1), 16: (230.4, 705.5), 18: (228.8, 440.4), 19: (239.0, 553.1), 20: (268.7, 747.8),
                21: (197.5, 725.9), 22: (277.3, 744.6), 23: (198.3, 720.4), 24: (270.2, 729.8), 25: (236.6, 717.3)},
               {5: 0.583, 6: 0.527, 7: 0.447, 8: 0.414, 9: 0.296, 10: 0.347, 11: 0.593, 12: 0.598, 13: 0.622,
                14: 0.702, 15: 0.602, 16: 0.758, 18: 0.537, 19: 0.651, 20: 0.523, 21: 0.733, 22: 0.508, 23: 0.779,
                24: 0.534, 25: 0.722})


def real(p):
    box, pts, sc = p
    k, s = np.full((26, 2), np.nan), np.zeros(26)
    for j, xy in pts.items():
        k[j], s[j] = xy, sc[j]
    return box, k, s


def test_the_person_behind_the_lifter_in_the_build_27_clean_is_blurred():
    img = checker(1080, 608)
    lifter, behind = real(REAL_LIFTER), real(REAL_BEHIND)
    others = bystanders([lifter, behind], lifter[0])
    assert len(others) == 1 and others[0][0] is behind[0]
    a = alpha(blur_bystanders(img, others, lifter), img)
    # their chest and hip, which show between the lifter's arm and thigh
    assert a[505:515, 210:220].min() > 0.9
    assert a[555:565, 207:217].min() > 0.9
    # the lifter's torso and head stay exact
    assert a[440:460, 320:340].max() == 0
    assert a[265:285, 335:355].max() == 0
