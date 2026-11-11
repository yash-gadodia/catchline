import type { Analysis, TracePoint } from '../../analysis/types';
import type { PlateMark } from '../capture/plateMark';

// What a lifter who opted in sends to help the plate finder: square crops around the plate, each with where the
// plate is in the crop. Never the video, never a whole frame.
export const CROP_DIAMETERS = 3;
export const MAX_CROP_PX = 512;
// A crop never covers more than this share of the frame's shorter side, however big the plate was drawn.
export const MAX_FRAME_SHARE = 0.8;
// The plate's radius as a share of the frame's height when nothing says how big it is (a 45 cm plate, lifter filling ~60% of the frame).
export const DEFAULT_R = 0.08;
export const MAX_TRACKED = 4;

export type FrameSize = { width: number; height: number };
// left / top are shares of the frame's width / height, side a share of its height; px is the JPEG's side.
export type Crop = { left: number; top: number; side: number; px: number };
// The plate in the crop: centre and radius as shares of the crop's side. r is null when only the centre is known.
export type Label = { x: number; y: number; r: number | null };
export type FrameKind = 'mark' | 'correction' | 'track';
export type PlateFrame = { id: string; liftId: string; kind: FrameKind; frame: number; crop: Crop; label: Label; confidence: number | null };

// The tracker may say how big and how sure it was on a point (not yet: the fields are read when they are there).
export type PlatePoint = TracePoint & { r?: number; score?: number };

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function cropAround(centre: { x: number; y: number }, r: number | null, frame: FrameSize): Crop {
  const rPx = (r ?? DEFAULT_R) * frame.height;
  const sidePx = Math.max(16, Math.min(CROP_DIAMETERS * 2 * rPx, MAX_FRAME_SHARE * Math.min(frame.width, frame.height)));
  const leftPx = clamp(centre.x * frame.width - sidePx / 2, 0, frame.width - sidePx);
  const topPx = clamp(centre.y * frame.height - sidePx / 2, 0, frame.height - sidePx);
  return { left: round4(leftPx / frame.width), top: round4(topPx / frame.height), side: round4(sidePx / frame.height), px: Math.min(MAX_CROP_PX, Math.round(sidePx)) };
}

export function labelIn(crop: Crop, frame: FrameSize, centre: { x: number; y: number }, r: number | null): Label {
  const sidePx = crop.side * frame.height;
  return {
    x: round4(clamp((centre.x * frame.width - crop.left * frame.width) / sidePx, 0, 1)),
    y: round4(clamp((centre.y * frame.height - crop.top * frame.height) / sidePx, 0, 1)),
    r: r == null ? null : round4(Math.min((r * frame.height) / sidePx, 1)),
  };
}

// Up to four spread-out frames of the tracked plate: lift-off, mid-pull, the top, and the fastest (most blurred) one.
// Points read off the wrists are not the plate and are never sent as its label.
export function pickTracked(analysis: Pick<Analysis, 'reps' | 'lift' | 'traceKind'>, exclude: number[] = []): PlatePoint[] {
  if (analysis.traceKind !== 'bar') return [];
  const plate = ((analysis.reps[0]?.path ?? []) as PlatePoint[]).filter((p) => p.src !== 'wrist').sort((a, b) => a.frame - b.frame);
  if (plate.length < 2) return [];
  const start = analysis.lift?.startFrame ?? plate[0].frame;
  const liftOff = plate.find((p) => p.frame >= start) ?? plate[0];
  const top = plate.reduce((best, p) => (p.y < best.y ? p : best), plate[0]);
  const half = (liftOff.y + top.y) / 2;
  const mid = plate.find((p) => p.frame > liftOff.frame && p.frame < top.frame && p.y <= half);
  let fastest: PlatePoint | undefined;
  let speed = 0;
  for (let i = 1; i < plate.length; i++) {
    const v = Math.hypot(plate[i].x - plate[i - 1].x, plate[i].y - plate[i - 1].y) / Math.max(plate[i].frame - plate[i - 1].frame, 1);
    if (v > speed) {
      speed = v;
      fastest = plate[i];
    }
  }
  const out: PlatePoint[] = [];
  for (const p of [liftOff, mid, top, fastest]) {
    if (p && !exclude.includes(p.frame) && !out.some((o) => o.frame === p.frame)) out.push(p);
  }
  return out.slice(0, MAX_TRACKED);
}

// One lift's frames. A skipped mark sends no strong label: only the tracker's own points go, flagged as such.
export function liftFrames(input: { liftId: string; mark: PlateMark | null; analysis: Pick<Analysis, 'reps' | 'lift' | 'traceKind' | 'video' | 'failure'>; newId: () => string }): PlateFrame[] {
  const { liftId, mark, analysis, newId } = input;
  const frame = { width: analysis.video.width, height: analysis.video.height };
  if (!(frame.width > 0 && frame.height > 0)) return [];
  const out: PlateFrame[] = [];
  if (mark) {
    const crop = cropAround(mark, mark.r, frame);
    out.push({ id: newId(), liftId, kind: 'mark', frame: 0, crop, label: labelIn(crop, frame, mark, mark.r), confidence: null });
  }
  if (analysis.failure) return out;
  for (const p of pickTracked(analysis, mark ? [0] : [])) {
    const crop = cropAround(p, p.r ?? mark?.r ?? null, frame);
    out.push({ id: newId(), liftId, kind: 'track', frame: p.frame, crop, label: labelIn(crop, frame, p, p.r ?? null), confidence: p.score ?? null });
  }
  return out;
}

export function correctionFrame(input: { liftId: string; frame: number; mark: PlateMark; size: FrameSize; newId: () => string }): PlateFrame {
  const crop = cropAround(input.mark, input.mark.r, input.size);
  return { id: input.newId(), liftId: input.liftId, kind: 'correction', frame: input.frame, crop, label: labelIn(crop, input.size, input.mark, input.mark.r), confidence: null };
}
