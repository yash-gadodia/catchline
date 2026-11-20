import type { Fit, Size } from '../../analysis/geometry';
import type { Point } from '../../analysis/types';

// Marks live in normalised video coordinates (0..1 on each axis), so they stay
// on the same pixels when the stage resizes or zooms.
export type Shape = { kind: 'line'; points: [Point, Point] } | { kind: 'angle'; points: Point[] };

export const MAX_SHAPES = 3;

export function fromScreen(p: Point, fit: Fit): Point {
  return { x: (p.x - fit.x) / fit.width, y: (p.y - fit.y) / fit.height };
}

export function lineLengthPx(a: Point, b: Point, video: Size): number {
  return Math.hypot((b.x - a.x) * video.width, (b.y - a.y) * video.height);
}

export function lineLengthCm(a: Point, b: Point, video: Size, pxPerCm?: number): number | null {
  if (!pxPerCm) return null;
  return lineLengthPx(a, b, video) / pxPerCm;
}

// The angle a-vertex-c in degrees (0..180), measured in video pixels so a
// non-square frame does not skew it.
export function angleAt(a: Point, vertex: Point, c: Point, video: Size): number {
  const ux = (a.x - vertex.x) * video.width;
  const uy = (a.y - vertex.y) * video.height;
  const vx = (c.x - vertex.x) * video.width;
  const vy = (c.y - vertex.y) * video.height;
  if ((ux === 0 && uy === 0) || (vx === 0 && vy === 0)) return 0;
  return (Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * 180) / Math.PI;
}

export function isComplete(shape: Shape): boolean {
  return shape.kind === 'line' || shape.points.length === 3;
}

export function canDraw(shapes: Shape[]): boolean {
  return shapes.filter(isComplete).length < MAX_SHAPES;
}

export function addLine(shapes: Shape[], a: Point, b: Point): Shape[] {
  if (!canDraw(shapes)) return shapes;
  return [...shapes.filter(isComplete), { kind: 'line', points: [a, b] }];
}

// A tap this close (in normalised units) to a point the angle already has is the same spot: it would make a
// zero-length arm and a stray 0° mark that takes a drawing slot.
export const SAME_SPOT = 0.02;

export function addAnglePoint(shapes: Shape[], p: Point): Shape[] {
  if (!canDraw(shapes)) return shapes;
  const last = shapes[shapes.length - 1];
  if (last && !isComplete(last)) {
    if (last.points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < SAME_SPOT)) return shapes;
    return [...shapes.slice(0, -1), { kind: 'angle', points: [...last.points, p] }];
  }
  return [...shapes, { kind: 'angle', points: [p] }];
}
