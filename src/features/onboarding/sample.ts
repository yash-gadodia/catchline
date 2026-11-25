import { parseAnalysis } from '../../analysis/parse';
import type { Size } from '../../analysis/geometry';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import { joints } from '../analysis/tracker';

// The tracked lift the welcome screen plays: whatever scripts/make-sample.sh put in assets/sample (a lift's clip,
// analysis.json and body.json, as the phone saves them).
export const SAMPLE_CLIP: number = require('../../../assets/sample/clip.mp4');
export const SAMPLE_ANALYSIS: Analysis = parseAnalysis(require('../../../assets/sample/analysis.json'));
export const SAMPLE_BODY: Body = require('../../../assets/sample/body.json');

// Where a video sits in a box of another shape. A clip no wider than the box shows whole, scaled to fit and centred:
// the lift stays in view from the floor to overhead (filling the box cut a close-up lifter's head and bar off). A
// wider clip (a landscape lift in the tall box) would be a thin band, so it fills the box's height instead and is
// slid across to keep `focusX` (0..1 across the video, where the lifter stands) in the middle.
export function fitBox(video: Size, box: Size, focusX = 0.5): { left: number; top: number; width: number; height: number } {
  const wide = video.width / video.height > box.width / box.height;
  const scale = wide ? box.height / video.height : Math.min(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  const left = wide ? Math.min(0, Math.max(box.width - width, box.width / 2 - focusX * width)) : (box.width - width) / 2;
  return { left, top: (box.height - height) / 2, width, height };
}

// Where the lifter stands across the picture: the middle of every joint read over the clip (the bar's path when no
// body was read).
export function focusX(analysis: Analysis, body: Body | null): number {
  const xs: number[] = [];
  for (let f = 0; f < (body?.frames.length ?? 0); f++) for (const p of joints(body, f)) if (p) xs.push(p.x);
  if (!xs.length) for (const p of analysis.reps[0]?.path ?? []) xs.push(p.x);
  return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0.5;
}

export const SAMPLE_FOCUS_X = focusX(SAMPLE_ANALYSIS, SAMPLE_BODY);
