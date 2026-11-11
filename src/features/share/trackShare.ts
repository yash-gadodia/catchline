import type { Analysis } from '../../analysis/types';
import type { Body } from '../../analysis/device/tracking';
import type { Size } from '../../analysis/geometry';
import { bones, drawnSide, floorY, joints, startLineX } from '../analysis/tracker';
import { dark, opacity, stroke } from '../../design/tokens';

export type ShareSpeed = 1 | 0.5 | 0.25;
export const SHARE_SPEEDS: ShareSpeed[] = [1, 0.5, 0.25];
export type TrackShareOptions = { path: boolean; lines: boolean; body: boolean; watermark: boolean; speed: ShareSpeed };

// What modules/clip-transcoder TrackRenderer.swift draws on the lift's kept clip. Positions are 0..1 of the frame,
// sizes are output pixels; a layer that is off is empty (or null), so the native side only draws what it is given.
export type TrackSpec = {
  speed: ShareSpeed;
  // the frame of the share image
  frame: number;
  frameCount: number;
  fps: number;
  // [frame, x, y] per traced point
  path: [number, number, number][];
  startX: number | null;
  floorY: number | null;
  // per frame: x1, y1, x2, y2 for every bone, and x, y for every joint
  bones: number[][];
  joints: number[][];
  watermark: string | null;
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

const px = (pt: number, unit: number) => Number((pt * unit).toFixed(2));

export function frameCountOf(analysis: Analysis, body: Body | null): number {
  return Math.max(analysis.video.frameCount, body?.frames.length ?? 0, 1);
}

export function buildTrackSpec(analysis: Analysis, body: Body | null, options: TrackShareOptions, frame = 0): TrackSpec {
  const rep = analysis.reps[0];
  const count = frameCountOf(analysis, body);
  const unit = pxPerPt(analysis.video);
  const side = drawnSide(body, analysis.noCueReason?.offSideDeg);
  const drawBody = options.body && body !== null;
  const perFrame = <T,>(row: (f: number) => T[]): T[][] => (drawBody ? Array.from({ length: body.frames.length }, (_, f) => row(f)) : []);
  return {
    speed: options.speed,
    frame: Math.min(Math.max(0, Math.round(frame)), count - 1),
    frameCount: count,
    fps: analysis.video.fps,
    path: options.path ? (rep?.path ?? []).map((p) => [p.frame, p.x, p.y]) : [],
    startX: options.lines ? startLineX(rep) : null,
    floorY: options.lines ? floorY(body) : null,
    bones: perFrame((f) => bones(joints(body, f), side).flatMap(([a, b]) => [a.x, a.y, b.x, b.y])),
    joints: perFrame((f) =>
      joints(body, f).flatMap((p, i) => (p && (side === 'both' || i % 2 === side) ? [p.x, p.y] : [])),
    ),
    watermark: options.watermark ? 'catchline' : null,
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
      markSize: px(15, unit),
      markInset: px(12, unit),
      markFonts: ['BigShouldersDisplay_700Bold', 'BigShouldersDisplay-Bold'],
    },
  };
}
