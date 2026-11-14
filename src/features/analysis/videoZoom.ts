// The player's picture enlarged under the lifter's fingers: how many times bigger, and how far it is moved, in points.
export type PictureZoom = { scale: number; x: number; y: number };

export const NO_ZOOM: PictureZoom = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 4;

type Size = { width: number; height: number };
type Touch = { x: number; y: number };

// The picture never shows what is past its own edge: the move is held to what the scale leaves hidden.
export function held(z: PictureZoom, box: Size): PictureZoom {
  const scale = Math.min(Math.max(z.scale, 1), MAX_ZOOM);
  const mx = ((scale - 1) * box.width) / 2;
  const my = ((scale - 1) * box.height) / 2;
  return { scale, x: Math.min(Math.max(z.x, -mx), mx), y: Math.min(Math.max(z.y, -my), my) };
}

// Two fingers, from where they landed (a0, b0) to where they are (a, b): spreading them enlarges what is at the middle
// of the view, and moving them together drags the picture.
export function pinched(from: PictureZoom, a0: Touch, b0: Touch, a: Touch, b: Touch, box: Size): PictureZoom {
  const spread0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
  if (spread0 < 1) return from;
  const scale = Math.min(Math.max((from.scale * Math.hypot(a.x - b.x, a.y - b.y)) / spread0, 1), MAX_ZOOM);
  const k = scale / from.scale;
  return held({ scale, x: from.x * k + (a.x + b.x - a0.x - b0.x) / 2, y: from.y * k + (a.y + b.y - a0.y - b0.y) / 2 }, box);
}

// One finger on an enlarged picture drags it.
export function dragged(from: PictureZoom, dx: number, dy: number, box: Size): PictureZoom {
  return held({ scale: from.scale, x: from.x + dx, y: from.y + dy }, box);
}
