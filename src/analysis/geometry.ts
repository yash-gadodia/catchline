import type { Point } from './types';

export type Size = { width: number; height: number };

// Where a cover-fitted source image lands inside a box: its displayed size and
// top-left offset. `focus` is the CSS object-position (0..1 on each axis);
// `zoom` scales about `zoomOrigin`, a normalised SOURCE point that stays fixed.
export type Fit = { x: number; y: number; width: number; height: number };

export function coverFit(
  src: Size,
  box: Size,
  focus: Point = { x: 0.5, y: 0.5 },
  zoom = 1,
  zoomOrigin?: Point
): Fit {
  const scale = Math.max(box.width / src.width, box.height / src.height);
  const width = src.width * scale;
  const height = src.height * scale;
  const x = (box.width - width) * focus.x;
  const y = (box.height - height) * focus.y;
  if (zoom === 1) return { x, y, width, height };
  const origin = zoomOrigin ?? { x: 0.5, y: 0.5 };
  const ox = x + origin.x * width;
  const oy = y + origin.y * height;
  return {
    x: ox + (x - ox) * zoom,
    y: oy + (y - oy) * zoom,
    width: width * zoom,
    height: height * zoom,
  };
}

// The object-position that puts a normalised source point as close to the box
// centre as cover-fitting allows.
export function focusOn(point: Point, src: Size, box: Size): Point {
  const fit = coverFit(src, box);
  const axis = (p: number, displayed: number, boxLen: number) => {
    const slack = boxLen - displayed;
    if (slack === 0) return 0.5;
    return Math.min(1, Math.max(0, (boxLen / 2 - displayed * p) / slack));
  };
  return {
    x: axis(point.x, fit.width, box.width),
    y: axis(point.y, fit.height, box.height),
  };
}

export function toScreen(p: Point, fit: Fit): Point {
  return { x: fit.x + p.x * fit.width, y: fit.y + p.y * fit.height };
}

export function svgPath(points: Point[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}
