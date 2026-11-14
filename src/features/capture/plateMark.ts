// The lifter's own mark on the plate nearest the camera, made on the first frame of the trimmed clip: the centre as
// shares of the frame's width and height, the radius as a share of its height.
export type PlateMark = { x: number; y: number; r: number };

export type Rect = { x: number; y: number; width: number; height: number };

// Where a frame of this size sits when fitted whole inside a box (letterboxed, centred).
export function containRect(frame: { width: number; height: number }, box: { width: number; height: number }): Rect {
  const scale = Math.min(box.width / frame.width, box.height / frame.height);
  const width = frame.width * scale;
  const height = frame.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

// A press on the centre dragged to the edge, in box points, as a mark on the frame. Null when the press is off the
// picture or the circle is too small to be a plate.
export const MIN_R = 0.02;
export function markFrom(centre: { x: number; y: number }, edge: { x: number; y: number }, rect: Rect): PlateMark | null {
  const x = (centre.x - rect.x) / rect.width;
  const y = (centre.y - rect.y) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const r = Math.hypot(edge.x - centre.x, edge.y - centre.y) / rect.height;
  if (r < MIN_R) return null;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return { x: round(x), y: round(y), r: round(Math.min(r, 1)) };
}

// What a press at `d` points from the centre of a circle of radius `r` takes hold of: the circle itself (move), its
// rim (resize), or nothing (a new circle starts there). The bands are never thinner than a fingertip.
export function grab(d: number, r: number): 'move' | 'resize' | 'new' {
  const inner = Math.max(r * 0.6, Math.min(r, 14));
  if (d <= inner) return 'move';
  return d <= Math.max(r * 1.5, r + 28) ? 'resize' : 'new';
}

// The plate the tracker followed, as a mark on the first frame of the path that has its size (null: no plate found).
export function foundMark(path: { frame: number; x: number; y: number; r?: number }[]): (PlateMark & { frame: number }) | null {
  const p = path.find((q) => q.r !== undefined);
  return p && p.r !== undefined ? { frame: p.frame, x: p.x, y: p.y, r: p.r } : null;
}
