import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import type { Size } from '../../analysis/geometry';
import { HIP_TRAIL_S, bones, drawnSide, floorY, joints, liftRange, startLineX } from '../analysis/tracker';
import { dark, opacity, stroke } from '../../design/tokens';
import { t } from '../../i18n';

export type ShareSpeed = 4 | 2 | 1 | 0.5 | 0.25;
export const SHARE_SPEEDS: ShareSpeed[] = [1, 0.5, 0.25];
// 2x and 4x need TrackRenderer to keep every 2nd or 4th frame; a binary before that writes them at 1x, so they
// show only where ClipTranscoder says so (build 43 on).
export const FAST_SHARE_SPEEDS: ShareSpeed[] = [4, 2, 1, 0.5, 0.25];
export const shareSpeeds = (fast: boolean): ShareSpeed[] => (fast ? FAST_SHARE_SPEEDS : SHARE_SPEEDS);
// `whole` shares every frame of the clip; off, a lift that tracking marked is shared from its first frame to its last.
export type TrackShareOptions = { path: boolean; lines: boolean; body: boolean; watermark: boolean; speed: ShareSpeed; whole?: boolean };

// What modules/clip-transcoder TrackRenderer.swift draws on the lift's kept clip. Positions are 0..1 of the frame,
// sizes are output pixels; a layer that is off is empty (or null), so the native side only draws what it is given.
export type TrackSpec = {
  speed: ShareSpeed;
  // the frame of the share image
  frame: number;
  frameCount: number;
  // The frames the video holds, first and last inclusive, counted over the whole clip (0 and frameCount - 1 for all
  // of it). Binary 4.0.0 (build 41) does not read them and writes every frame.
  startFrame: number;
  endFrame: number;
  fps: number;
  // [frame, x, y] per traced point
  path: [number, number, number][];
  // a hanging movement's hip trail: only this many frames back are drawn (build 43 on; older binaries draw it all)
  trailFrames?: number;
  startX: number | null;
  floorY: number | null;
  // per frame: x1, y1, x2, y2 for every bone, and x, y for every joint
  bones: number[][];
  joints: number[][];
  watermark: string | null;
  // the logo lockup and the end card; a binary before 4.0.2 ignores it and draws `watermark`
  brand?: { wordmark: string; line: string; endLine: string; endS: number; top: number };
  style: {
    flare: string;
    halo: string;
    bone: string;
    pathWidth: number;
    haloWidth: number;
    boneWidth: number;
    lineWidth: number;
    dash: [number, number];
    lineAlpha: number;
    dotRadius: number;
    dotStroke: number;
    jointRadius: number;
    jointStroke: number;
    markSize: number;
    markInset: number;
    markFonts: string[];
  };
};

// The tracker screen on a 390 x 844 pt phone shows the clip full width, or 60% of the screen tall if that is
// narrower. Output pixels per point of that box, so a 2.5 pt path is as heavy in the file as it is on screen.
const SCREEN = { width: 390, height: 844 };
export function pxPerPt(video: Size): number {
  return video.width / Math.min(SCREEN.width, Math.round((Math.round(SCREEN.height * 0.6) * video.width) / video.height));
}

// A bar path was drawn for this lift (the plate was followed); a hip trail or a body-only result is not one.
export function hasBarPath(analysis: Analysis): boolean {
  return analysis.traceKind === 'bar' && (analysis.reps[0]?.path.length ?? 0) > 0;
}

const px = (pt: number, unit: number) => Number((pt * unit).toFixed(2));

// The mark says what made the video and where to get it (owner, 12-11): "Catchline · free on the App Store". Reels and
// TikTok cover the bottom ~20% (caption) and a right-hand column (buttons), so it sits a fifth of the height up and as
// far in from the right, never off the left edge (MARK_WIDTH: the longest translation at MARK_SIZE, measured).
const MARK_SIZE = 15;
const MARK_WIDTH = 180;
export function markLayout(video: Size): { size: number; inset: number; widthPt: number } {
  const unit = pxPerPt(video);
  const widthPt = video.width / unit;
  const heightPt = video.height / unit;
  return { size: MARK_SIZE, inset: Math.max(12, Math.min(Math.round(heightPt * 0.2), Math.round(widthPt - MARK_WIDTH - 12))), widthPt };
}

export function frameCountOf(analysis: Analysis, body: Body | null): number {
  return Math.max(analysis.video.frameCount, body?.frames.length ?? 0, 1);
}

export function buildTrackSpec(analysis: Analysis, body: Body | null, options: TrackShareOptions, frame?: number): TrackSpec {
  const rep = analysis.reps[0];
  const count = frameCountOf(analysis, body);
  const unit = pxPerPt(analysis.video);
  const mark = markLayout(analysis.video);
  const range = liftRange(analysis.lift, count, options.whole === true);
  const side = drawnSide(body, analysis.noCueReason?.offSideDeg);
  const drawBody = options.body && body !== null;
  const perFrame = <T,>(row: (f: number) => T[]): T[][] => (drawBody ? Array.from({ length: body.frames.length }, (_, f) => row(f)) : []);
  return {
    speed: options.speed,
    frame: Math.min(Math.max(range.first, Math.round(frame ?? range.first)), range.last),
    frameCount: count,
    startFrame: range.first,
    endFrame: range.last,
    fps: analysis.video.fps,
    path: options.path ? (rep?.path ?? []).map((p) => [p.frame, p.x, p.y]) : [],
    ...(analysis.traceKind === 'hip' ? { trailFrames: Math.round(HIP_TRAIL_S * analysis.video.fps) } : {}),
    startX: options.lines ? startLineX(rep) : null,
    floorY: options.lines ? floorY(body) : null,
    bones: perFrame((f) => bones(joints(body, f), side).flatMap(([a, b]) => [a.x, a.y, b.x, b.y])),
    joints: perFrame((f) =>
      joints(body, f).flatMap((p, i) => (p && (side === 'both' || i % 2 === side) ? [p.x, p.y] : [])),
    ),
    watermark: options.watermark ? t('share.mark') : null,
    ...(options.watermark ? { brand: { wordmark: 'Catchline', line: t('share.brandLine'), endLine: t('share.endLine'), endS: 1.5, top: 0.12 } } : {}),
    style: {
      flare: dark.flare,
      halo: dark.halo,
      bone: dark.text,
      pathWidth: px(stroke.path, unit),
      haloWidth: px(stroke.halo, unit),
      boneWidth: px(stroke.outline, unit),
      lineWidth: px(stroke.hairline, unit),
      dash: [px(2, unit), px(5, unit)],
      lineAlpha: opacity.lines,
      dotRadius: px(4.5, unit),
      dotStroke: px(1.5, unit),
      jointRadius: px(3, unit),
      jointStroke: px(1, unit),
      markSize: px(mark.size, unit),
      markInset: px(mark.inset, unit),
      markFonts: ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'],
    },
  };
}
