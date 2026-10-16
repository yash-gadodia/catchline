import subprocess

import pytest
from catchline_cv.video import ClipUnreadable, frames, probe


def write(tmp_path, name, data):
    p = tmp_path / name
    p.write_bytes(data)
    return str(p)


def test_gif_header_with_no_picture_is_unreadable_not_a_zero_division(tmp_path):
    # issue #2 lift B: ffprobe reports a 0x0 "video" stream for these bytes
    clip = write(tmp_path, "clip", b"GIF89a not a real video either Tue 14 Oct 2026")
    with pytest.raises(ClipUnreadable):
        probe(clip)
    with pytest.raises(ClipUnreadable):
        list(frames(clip, 384))


def test_random_bytes_are_unreadable_and_the_error_carries_no_command_line(tmp_path):
    # issue #2 lift A: ffprobe exits 1 and CalledProcessError's str() includes the argv and tmp path
    clip = write(tmp_path, "clip", b"\x00\x01\x02hello world not a video" * 50)
    with pytest.raises(ClipUnreadable) as info:
        probe(clip)
    assert "ffprobe" not in str(info.value)
    assert str(tmp_path) not in str(info.value)
    assert not isinstance(info.value, subprocess.CalledProcessError)


def test_audio_only_file_has_no_video_stream(tmp_path):
    clip = str(tmp_path / "clip")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=d=0.2", "-c:a", "aac", "-f", "mp4", clip], check=True
    )
    with pytest.raises(ClipUnreadable):
        probe(clip)


def test_real_clip_still_probes(tmp_path):
    clip = str(tmp_path / "clip")
    src = ["-f", "lavfi", "-i", "color=c=black:s=64x48:r=30", "-frames:v", "3"]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *src, "-f", "mp4", clip], check=True)
    assert probe(clip) == {"width": 64, "height": 48, "fps": 30.0, "frameCount": 3, "rotation": 0}


def test_a_keyframe_on_the_last_frame_still_decodes(tmp_path):
    # golden EDF10BB7 (variable frame rate): frame 388 at 29.97 fps is 12.946 s, but the last frame is stamped
    # 12.938 s, so the seek returned no picture and the keyframe export crashed
    from catchline_cv.pipeline import read_frame
    clip = str(tmp_path / "clip.mp4")
    src = ["-f", "lavfi", "-i", "testsrc=size=64x96:rate=30", "-frames:v", "30", "-pix_fmt", "yuv420p"]
    subprocess.run(["ffmpeg", "-v", "error", "-y", *src, clip], check=True)
    assert read_frame(clip, 29, 29.97, 96).shape == (96, 64, 3)
