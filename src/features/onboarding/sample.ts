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

// Where a video sits when it fills a box of another shape: scaled to cover it, centred across, and slid up or down
// so the part of the picture around `focusY` (0..1 down the video) stays in view.
export function coverBox(video: Size, box: Size, focusY: number): { left: number; top: number; width: number; height: number } {
  const scale = Math.max(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  const top = Math.min(0, Math.max(box.height - height, box.height / 2 - focusY * height));
  return { left: (box.width - width) / 2, top, width, height };
}

// The middle of everything tracked, down the picture: half way between the highest and the lowest point of the
// bar path and the body over the clip.
export function focusY(analysis: Analysis, body: Body | null): number {
  const ys = (analysis.reps[0]?.path ?? []).map((p) => p.y);
  for (let f = 0; f < (body?.frames.length ?? 0); f++) for (const p of joints(body, f)) if (p) ys.push(p.y);
  if (!ys.length) return 0.5;
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}
