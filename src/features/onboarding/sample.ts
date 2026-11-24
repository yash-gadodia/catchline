import { parseAnalysis } from '../../analysis/parse';
import type { Size } from '../../analysis/geometry';
import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';

// The tracked lift the welcome screen plays: whatever scripts/make-sample.sh put in assets/sample (a lift's clip,
// analysis.json and body.json, as the phone saves them).
export const SAMPLE_CLIP: number = require('../../../assets/sample/clip.mp4');
export const SAMPLE_ANALYSIS: Analysis = parseAnalysis(require('../../../assets/sample/analysis.json'));
export const SAMPLE_BODY: Body = require('../../../assets/sample/body.json');

// Where a video sits when all of it shows in a box of another shape: scaled to fit, centred. The whole lift stays in
// view, floor to overhead; a close-up clip filling the box instead cut the lifter's head and the bar off.
export function fitBox(video: Size, box: Size): { left: number; top: number; width: number; height: number } {
  const scale = Math.min(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}
